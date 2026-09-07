import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

export interface HistoricalConsumptionItem {
    month: string;          // e.g. "AGO/26" or "2026-08"
    consumptionKwh: number; // e.g. 138
    dailyAvgKwh: number;    // e.g. 4.60
    days: number;           // e.g. 30
}

export interface ExtractedEnergyBill {
    utilityCompany: string;
    consumerUnit: string | null;
    installationClass: string | null;
    tariffModality: string | null;
    referenceMonth: string | null;       // YYYY-MM
    referenceMonthLabel: string | null;  // e.g. "AGO/2026"
    readingDateCurrent: string | null;   // YYYY-MM-DD
    readingDatePrevious: string | null;  // YYYY-MM-DD
    readingDateNext: string | null;      // YYYY-MM-DD
    dueDate: string | null;              // YYYY-MM-DD
    billingDays: number | null;
    meterNumber: string | null;
    gridReadingPrevious: number | null;
    gridReadingCurrent: number | null;
    gridConsumptionKwh: number | null;
    dailyAvgKwh: number | null;
    monthlyAvgKwh: number | null;
    injectedReadingPrevious: number | null;
    injectedReadingCurrent: number | null;
    solarInjectedKwh: number | null;
    solarCompensatedKwh: number | null;
    generationBalanceKwh: number | null; // SALDO ATUAL DE GERAÇÃO
    unitPrice: number | null;
    availabilityCostKwh: number | null;
    availabilityCostAmount: number | null;
    energySceeExemptAmount: number | null;
    energyCompensatedAmount: number | null;
    availabilityAdjustmentAmount: number | null;
    bonusDiscountsAmount: number | null;
    flagType: string | null;
    flagAmount: number | null;
    taxesIcms: number | null;
    taxesPisCofins: number | null;
    totalAmount: number | null;
    historicalConsumption: HistoricalConsumptionItem[];
    confidence: number;
}

const ENERGY_BILL_PROMPT = `Você é um especialista em leitura de contas de energia elétrica brasileiras com energia solar / microgeração distribuída (GD / SCEE), especialmente faturas da CEMIG e outras distribuidoras.
Analise a imagem/fatura de energia elétrica com extrema atenção e extraia TODOS os campos técnicos, solares, financeiros e a tabela de histórico.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem explicações adicionais) com a seguinte estrutura:

{
  "utilityCompany": "string (ex: 'CEMIG')",
  "consumerUnit": "string (N.º da Unidade Consumidora / Instalação, ex: '2.777.942.018-25')",
  "installationClass": "string (ex: 'Residencial Trifásico')",
  "tariffModality": "string (ex: 'Convencional B1')",
  "referenceMonth": "YYYY-MM (ex: '2026-08')",
  "referenceMonthLabel": "string (ex: 'AGO/2026')",
  "readingDateCurrent": "YYYY-MM-DD (ex: '2026-08-29')",
  "readingDatePrevious": "YYYY-MM-DD (ex: '2026-07-30')",
  "readingDateNext": "YYYY-MM-DD ou null (ex: '2026-09-29')",
  "dueDate": "YYYY-MM-DD (Vencimento, ex: '2026-09-17')",
  "billingDays": number (Nº de dias, ex: 30),
  "meterNumber": "string (Número do medidor, ex: 'PRB212101622')",
  "gridReadingPrevious": number (Leitura anterior de energia consumida),
  "gridReadingCurrent": number (Leitura atual de energia consumida),
  "gridConsumptionKwh": number (Consumo medido da rede em kWh, ex: 138),
  "dailyAvgKwh": number (Média diária kWh/Dia, ex: 4.60),
  "monthlyAvgKwh": number ou null (Média histórica em kWh),
  "injectedReadingPrevious": number ou null (Leitura anterior de energia injetada),
  "injectedReadingCurrent": number ou null (Leitura atual de energia injetada),
  "solarInjectedKwh": number (Energia Injetada no ciclo em kWh, ex: 217),
  "solarCompensatedKwh": number (Energia compensada GD no mês em kWh, ex: 46),
  "generationBalanceKwh": number (SALDO ATUAL DE GERAÇÃO em kWh encontrado em Informações Gerais, ex: 441.24),
  "unitPrice": number (Preço Unitário efetivo ou Tarifa Unitária em R$/kWh, ex: 1.18002201),
  "availabilityCostKwh": number (Taxa mínima em kWh: 100 para trifásico, 50 para bifásico, 30 para monofásico),
  "availabilityCostAmount": number (Custo de Disponibilidade em R$, ex: 117.98),
  "energySceeExemptAmount": number (Energia SCEE ISENTA em R$, ex: 28.70),
  "energyCompensatedAmount": number (Energia compensada GD II em R$, valor negativo, ex: -21.29),
  "availabilityAdjustmentAmount": number (Ajuste Custo Disponibilidade em R$, ex: -7.40),
  "bonusDiscountsAmount": number (Bônus Itaipu ou outros descontos em R$, ex: -8.21),
  "flagType": "string (ex: 'Verde', 'Amarela', 'Vermelha 1', 'Vermelha 2')",
  "flagAmount": number (Valor cobrado pela bandeira tarifária em R$, ex: 2.24),
  "taxesIcms": number (Valor do ICMS em R$, ex: 21.23),
  "taxesPisCofins": number (Valor de PIS/COFINS em R$, ex: 4.54),
  "totalAmount": number (Total a Pagar / Valor a pagar em R$, ex: 109.78),
  "historicalConsumption": [
    {
      "month": "string (ex: 'AGO/26' ou '2026-08')",
      "consumptionKwh": number (ex: 138),
      "dailyAvgKwh": number (ex: 4.60),
      "days": number (ex: 30)
    }
  ],
  "confidence": number (de 0 a 1 indicando qualidade da extração)
}

Regras Cruciais:
1. "SALDO ATUAL DE GERAÇÃO": Procure com máxima atenção na seção "Informações Gerais" ou "Demonstrativo de Compensação". Geralmente está escrito "SALDO ATUAL DE GERAÇÃO: XXX,XX kWh". Converta para número decimal (ex: 441.24).
2. "Energia Injetada": Procure na tabela "Informações Técnicas" no tipo de medição "Energia Injetada". A diferença ou consumo faturado é a energia injetada em kWh (ex: 217).
3. "Histórico de Consumo": Extraia TODAS as linhas da tabela de histórico de consumo impressa na fatura (geralmente 12 ou 13 meses).
4. Decimais brasileiros: converta vírgula para ponto (ex: "109,78" -> 109.78, "1,18002201" -> 1.18002201).
5. Datas: converta para YYYY-MM-DD. Mês de referência: "AGO/2026" ou "AGO/26" -> "2026-08".
6. Nunca invente valores. Se um campo não estiver presente, use null ou 0.`;

function parseJsonContent(content: string): ExtractedEnergyBill {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(cleaned);
}

async function extractWithGemini(base64: string, mimeType: string): Promise<ExtractedEnergyBill> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
        },
    });

    const result = await model.generateContent([
        ENERGY_BILL_PROMPT,
        { inlineData: { data: base64, mimeType } },
    ]);

    const text = (await result.response).text();
    return parseJsonContent(text);
}

async function extractWithOpenAI(base64: string, mimeType: string): Promise<ExtractedEnergyBill> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: ENERGY_BILL_PROMPT },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64}`,
                                detail: "high",
                            },
                        },
                    ],
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 2500,
            temperature: 0,
        }),
    });

    if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        throw new Error(`OpenAI API error (${apiResponse.status}): ${errBody.substring(0, 300)}`);
    }

    const response = await apiResponse.json();
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("GPT-4o returned empty response");

    return parseJsonContent(content);
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const allowedTypes = [
            "image/jpeg", "image/jpg", "image/png", "image/webp",
            "image/gif", "application/pdf"
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: `Tipo de arquivo não suportado: ${file.type}. Use JPG, PNG, WebP ou PDF.` },
                { status: 400 }
            );
        }

        if (file.size > 12 * 1024 * 1024) {
            return NextResponse.json(
                { error: "Arquivo muito grande. Máximo suportado: 12MB." },
                { status: 400 }
            );
        }

        // Process in-memory buffer — ZERO PERSISTENCE TO STORAGE
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let mediaType = file.type;
        if (mediaType === "image/jpg") mediaType = "image/jpeg";
        const base64 = buffer.toString("base64");

        // 1. Try Gemini Vision (Fast & Free)
        try {
            console.log("[extract-energy-bill] Attempting Gemini Vision extraction...");
            const extracted = await extractWithGemini(base64, mediaType);
            console.log(`[extract-energy-bill] ✅ Gemini Vision succeeded. UC: ${extracted.consumerUnit}, Month: ${extracted.referenceMonth}, Saldo: ${extracted.generationBalanceKwh} kWh`);
            return NextResponse.json({
                success: true,
                data: extracted,
                method: "gemini-vision",
            });
        } catch (geminiError) {
            console.warn("[extract-energy-bill] Gemini Vision failed, attempting OpenAI fallback:", geminiError);
        }

        // 2. Try OpenAI GPT-4o Vision (Fallback)
        try {
            console.log("[extract-energy-bill] Attempting OpenAI Vision fallback...");
            const extracted = await extractWithOpenAI(base64, mediaType);
            console.log("[extract-energy-bill] ✅ OpenAI Vision succeeded.");
            return NextResponse.json({
                success: true,
                data: extracted,
                method: "gpt-4o-vision",
            });
        } catch (openaiError) {
            console.error("[extract-energy-bill] OpenAI Vision also failed:", openaiError);
            const message = openaiError instanceof Error ? openaiError.message : "Erro desconhecido";
            return NextResponse.json(
                { error: `Falha na extração por IA. Erro: ${message}` },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("[extract-energy-bill] Critical error:", error);
        const message = error instanceof Error ? error.message : "Erro interno";
        return NextResponse.json({ error: `Erro no processamento da fatura: ${message}` }, { status: 500 });
    }
}
