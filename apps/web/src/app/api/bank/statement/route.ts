import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { requireUserWithLimit } from "@/lib/session";
import { HOUR } from "@/lib/rate-limit";
import { xlsxToTsv } from "@/lib/income-template";
import { parseStatement } from "@/lib/bank-statement";
import { rowsFromExtraction, suggestRouting, type BankSource } from "@/lib/bank-ledger";
import { extractStatementPdf, loadBankRows, loadPropertyRefs } from "@/lib/bank-ledger-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

function hashRef(date: string, amount: number, memo: string): string {
    const s = `${date}|${amount.toFixed(2)}|${memo}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return `pdf:${date}:${h.toString(16)}`;
}

/**
 * POST /api/bank/statement  (multipart "file": .ofx/.qfx/.csv/.tsv/.txt/.xlsx/.pdf)
 * → { rows: RoutedRow[], properties: PropertyRef[], source }
 *
 * Parses the holding's statement (PDF through Gemini), flags rows already in
 * the bank ledger and suggests where each one goes. Nothing is stored here;
 * ./commit writes the reviewed rows.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let file: File | null = null;
    try {
        const entry = (await request.formData()).get("file");
        file = entry instanceof File ? entry : null;
    } catch {
        return NextResponse.json({ error: "Envie o arquivo no campo 'file'" }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 12 MB" }, { status: 413 });

    const name = file.name.toLowerCase();
    let source: BankSource = "CSV";
    try {
        const bytes = await file.arrayBuffer();
        let parsed;
        if (name.endsWith(".pdf") || file.type === "application/pdf") {
            const gate = await requireUserWithLimit("ai:bank-statement", 20, HOUR);
            if ("response" in gate) return gate.response;
            source = "PDF";
            const raw = await extractStatementPdf(Buffer.from(bytes).toString("base64"), "application/pdf");
            parsed = rowsFromExtraction(raw, hashRef);
        } else if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
            const text = (await xlsxToTsv(bytes, "Extrato")) || (await xlsxToTsv(bytes, "Sheet1")) || (await xlsxToTsv(bytes, "Planilha1")) || "";
            if (!text) return NextResponse.json({ error: "Não encontrei a linha de cabeçalho (coluna 'Data') na planilha" }, { status: 422 });
            parsed = parseStatement(text, name);
        } else {
            let text = new TextDecoder("utf-8").decode(bytes);
            if (text.includes("�")) text = new TextDecoder("latin1").decode(bytes);
            source = /\.(ofx|qfx)$/.test(name) || /<OFX>|<STMTTRN>/i.test(text) ? "OFX" : "CSV";
            parsed = parseStatement(text, name);
        }
        if (parsed.length === 0) return NextResponse.json({ error: "Nenhum lançamento reconhecido no arquivo" }, { status: 422 });

        const [properties, history] = await Promise.all([loadPropertyRefs(supabase, profileId), loadBankRows(supabase, profileId, 1000)]);
        const existing = new Set(history.map(h => h.reference));
        const rows = suggestRouting(parsed, source, properties, history, existing);
        return NextResponse.json({ rows, properties: properties.map(p => ({ id: p.id, name: p.name })), source });
    } catch (err) {
        console.error("[Bank statement]", (err as Error).message);
        return NextResponse.json({ error: source === "PDF" ? `Não foi possível ler o PDF: ${(err as Error).message}` : "Não foi possível ler o extrato" }, { status: 422 });
    }
}
