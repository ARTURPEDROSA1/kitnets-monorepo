import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireUserWithLimit, validateUpload } from "@/lib/session";
import { HOUR } from "@/lib/rate-limit";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { checkIptuTotals, type ExtractedIptu } from "@/lib/property-taxes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/properties/[id]/taxes/extract   (multipart "file": PDF or image of the IPTU DAM)
 * → { success, data: ExtractedIptu, method }
 *
 * Reads the municipal IPTU document with Gemini (PDF or image), OpenAI as
 * fallback for images. Nothing is stored here; ./import saves the row + PDF.
 */

const IPTU_PROMPT = `Você é um especialista em leitura de guias de IPTU brasileiras (Documento de Arrecadação Municipal — DAM), emitidas por prefeituras.
Analise o documento com atenção e extraia os campos abaixo. Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem explicações):

{
  "municipio": "string ou null (nome do município, ex: 'NOVA LIMA')",
  "contribuinte": "string ou null (nome do contribuinte)",
  "inscricao": "string ou null (Inscrição imobiliária / C.M.C., ex: '01/07/029/0055-001')",
  "exercicio": number ou null (ano do exercício, ex: 2026),
  "referencia": "string ou null ('Única' para cota única, ou 'n/N' para parcela, ex: '1/6')",
  "vencimento": "YYYY-MM-DD ou null (data de vencimento)",
  "areaTerreno": number ou null (área do terreno em m², ex: 360.00),
  "areaConstruida": number ou null (área construída em m², ex: 112.42),
  "valorVenalTerreno": number ou null (valor venal do terreno em R$, ex: 41658.62),
  "valorVenalPredial": number ou null (valor venal predial / da construção em R$, ex: 93606.47),
  "valorVenalImovel": number ou null (valor venal do imóvel = terreno + construção, ex: 135265.09),
  "aliquotaPct": number ou null (alíquota em %, ex: 0.5 para '0,5000'),
  "valorImposto": number ou null (valor do imposto / IPTU predial em R$, ex: 676.33),
  "coletaLixo": number ou null (taxa de coleta de lixo em R$, ex: 270.53),
  "tsa": number ou null (TSA / taxa de serviços em R$, 0 se ausente),
  "desconto": number ou null (desconto concedido em R$, ex: 33.82 — sempre positivo),
  "total": number ou null (valor total a pagar em R$, ex: 913.04),
  "confidence": number entre 0 e 1
}

Regras:
1. Decimais brasileiros: converta vírgula em ponto e remova separadores de milhar ("135.265,09" -> 135265.09; "0,5000" -> 0.5).
2. "total" é o valor final a pagar impresso no documento (ex: "Total: 913,04" ou "Valor R$ 913,04"). Deve ser igual a valorImposto + coletaLixo + tsa − desconto.
3. "valorVenalImovel" é o valor sobre o qual a alíquota é aplicada (Valor Venal Imóvel × Alíquota = Valor do Imposto).
4. Datas em YYYY-MM-DD ("10/06/2026" -> "2026-06-10").
5. Nunca invente valores: use null quando o campo não existir no documento.`;

function parseJson(content: string): ExtractedIptu {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const n = (k: string): number | null => {
        const v = raw[k];
        if (v === null || v === undefined || v === "") return null;
        const num = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
        return Number.isFinite(num) ? Math.round(num * 10000) / 10000 : null;
    };
    const s = (k: string): string | null => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string).trim() : null);
    const data: ExtractedIptu = {
        municipio: s("municipio"),
        contribuinte: s("contribuinte"),
        inscricao: s("inscricao"),
        exercicio: (() => { const y = n("exercicio"); return y && y >= 1990 && y <= 2100 ? Math.round(y) : null; })(),
        referencia: s("referencia"),
        vencimento: (() => { const d = s("vencimento"); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; })(),
        areaTerreno: n("areaTerreno"),
        areaConstruida: n("areaConstruida"),
        valorVenalTerreno: n("valorVenalTerreno"),
        valorVenalPredial: n("valorVenalPredial"),
        valorVenalImovel: n("valorVenalImovel"),
        aliquotaPct: n("aliquotaPct"),
        valorImposto: n("valorImposto"),
        coletaLixo: n("coletaLixo"),
        tsa: n("tsa"),
        desconto: n("desconto") === null ? null : Math.abs(n("desconto")!),
        total: n("total"),
        confidence: Math.min(1, Math.max(0, n("confidence") ?? 0.5)),
    };
    // Post-process: fill/repair the total from its parts; derive the taxable value when missing.
    const totals = checkIptuTotals(data);
    if (data.total === null && totals.computed !== null) data.total = totals.computed;
    if (data.valorVenalImovel === null && data.valorVenalTerreno !== null && data.valorVenalPredial !== null) {
        data.valorVenalImovel = Math.round((data.valorVenalTerreno + data.valorVenalPredial) * 100) / 100;
    }
    // Alíquota sometimes comes as a fraction (0.005) — normalise to %.
    if (data.aliquotaPct !== null && data.aliquotaPct > 0 && data.aliquotaPct < 0.05 && data.valorVenalImovel && data.valorImposto) {
        const implied = (data.valorImposto / data.valorVenalImovel) * 100;
        if (Math.abs(implied - data.aliquotaPct * 100) < 0.05) data.aliquotaPct = Math.round(data.aliquotaPct * 100 * 10000) / 10000;
    }
    return data;
}

async function extractWithGemini(base64: string, mimeType: string): Promise<ExtractedIptu> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const result = await model.generateContent([IPTU_PROMPT, { inlineData: { data: base64, mimeType } }]);
    return parseJson((await result.response).text());
}

async function extractWithOpenAI(base64: string, mimeType: string): Promise<ExtractedIptu> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    if (!mimeType.startsWith("image/")) throw new Error("OpenAI fallback needs an image");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "user", content: [{ type: "text", text: IPTU_PROMPT }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } }] }],
            response_format: { type: "json_object" },
            max_tokens: 1200,
            temperature: 0,
        }),
    });
    if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const content = (await res.json()).choices?.[0]?.message?.content;
    if (!content) throw new Error("GPT-4o returned empty response");
    return parseJson(content);
}

export async function POST(request: Request, context: RouteContext) {
    const gate = await requireUserWithLimit("ai:iptu-extract", 30, HOUR);
    if ("response" in gate) return gate.response;
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { id } = await context.params;
    if (!(await getOwnedProperty(authed.ctx.supabase, authed.ctx.profileId, id))) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    let file: File | null = null;
    try {
        const entry = (await request.formData()).get("file");
        file = entry instanceof File ? entry : null;
    } catch {
        return NextResponse.json({ error: "Envie o arquivo no campo 'file'" }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    const invalid = validateUpload(file, 12 * 1024 * 1024);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;

    try {
        const data = await extractWithGemini(base64, mimeType);
        return NextResponse.json({ success: true, data, method: "gemini-vision" });
    } catch (geminiError) {
        console.warn("[iptu-extract] Gemini failed, trying OpenAI:", (geminiError as Error).message);
    }
    try {
        const data = await extractWithOpenAI(base64, mimeType);
        return NextResponse.json({ success: true, data, method: "gpt-4o-vision" });
    } catch (openaiError) {
        console.error("[iptu-extract] OpenAI failed:", (openaiError as Error).message);
        return NextResponse.json({ error: `Falha na extração por IA: ${(openaiError as Error).message}` }, { status: 500 });
    }
}
