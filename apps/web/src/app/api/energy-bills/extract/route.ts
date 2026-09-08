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

const ENERGY_BILL_PROMPT = `Você é um especialista em leitura de contas de energia elétrica brasileiras com microgeração distribuída (GD / SCEE / Energia Solar), especialmente faturas da CEMIG e outras distribuidoras.
Analise a imagem/fatura de energia elétrica com extrema atenção e extraia TODOS os campos técnicos, solares, financeiros e a tabela de histórico.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem explicações adicionais) com a seguinte estrutura:

{
  "utilityCompany": "string (ex: 'CEMIG')",
  "consumerUnit": "string (N.º da Unidade Consumidora / Instalação, ex: '2.778.206.018-17')",
  "installationClass": "string (ex: 'Residencial Monofásico', 'Residencial Bifásico', 'Residencial Trifásico')",
  "tariffModality": "string (ex: 'Convencional B1')",
  "referenceMonth": "YYYY-MM (ex: '2026-08')",
  "referenceMonthLabel": "string (ex: 'AGO/2026')",
  "readingDateCurrent": "YYYY-MM-DD (ex: '2026-08-29')",
  "readingDatePrevious": "YYYY-MM-DD (ex: '2026-07-30')",
  "readingDateNext": "YYYY-MM-DD ou null (ex: '2026-09-29')",
  "dueDate": "YYYY-MM-DD (Vencimento, ex: '2026-09-17')",
  "billingDays": number (Nº de dias faturados, ex: 30),
  "meterNumber": "string (Número do medidor, ex: 'AMM222130135')",
  "gridReadingPrevious": number (Leitura anterior de energia consumida, ex: 2816),
  "gridReadingCurrent": number (Leitura atual de energia consumida, ex: 2884),
  "gridConsumptionKwh": number (Consumo total faturado/medido da instalação em kWh no ciclo, ex: 68),
  "dailyAvgKwh": number (Média diária kWh/Dia, ex: 2.26),
  "monthlyAvgKwh": number ou null (Média histórica em kWh),
  "injectedReadingPrevious": number ou null (Leitura anterior de energia injetada),
  "injectedReadingCurrent": number ou null (Leitura atual de energia injetada),
  "solarInjectedKwh": number (Energia Injetada no ciclo em kWh, ex: 217),
  "solarCompensatedKwh": number (Energia compensada GD / Compensação Local no ciclo em kWh, ex: 38),
  "generationBalanceKwh": number (SALDO ATUAL DE GERAÇÃO em kWh encontrado em Informações Gerais, ex: 1586.61),
  "unitPrice": number (Preço Unitário efetivo ou Tarifa Unitária em R$/kWh, ex: 1.17999863),
  "availabilityCostKwh": number (Taxa mínima em kWh: 100 para trifásico, 50 para bifásico, 30 para monofásico),
  "availabilityCostAmount": number (Custo de Disponibilidade em R$, ex: 35.39),
  "energySceeExemptAmount": number (Energia SCEE ISENTA em R$, ex: 23.69),
  "energyCompensatedAmount": number (Energia compensada GD I / GD II em R$, valor negativo, ex: -23.69),
  "availabilityAdjustmentAmount": number (Ajuste Custo Disponibilidade em R$, ex: 0),
  "bonusDiscountsAmount": number (Bônus Itaipu ou outros descontos em R$, ex: 0),
  "flagType": "string (ex: 'Verde', 'Amarela', 'Vermelha 1', 'Vermelha 2')",
  "flagAmount": number (Valor cobrado pela bandeira tarifária em R$, ex: 0),
  "taxesIcms": number (Valor do ICMS em R$, ex: 21.23),
  "taxesPisCofins": number (Valor de PIS/COFINS em R$, ex: 4.54),
  "totalAmount": number (Total a Pagar / Valor a pagar em R$, ex: 32.93),
  "historicalConsumption": [
    {
      "month": "string (ex: 'AGO/26' ou '2026-08')",
      "consumptionKwh": number (ex: 68),
      "dailyAvgKwh": number (ex: 2.26),
      "days": number (ex: 30)
    }
  ],
  "confidence": number (de 0 a 1 indicando qualidade da extração)
}

Regras Cruciais:
1. "CONSUMO DA REDE (gridConsumptionKwh)":
   - Em faturas com microgeração/energia solar (como na CEMIG), a linha "Energia Elétrica" nos Valores Faturados muitas vezes cobra apenas o mínimo de disponibilidade (ex: 30 kWh) e a parcela compensada aparece em "Energia SCEE ISENTA" (ex: 38 kWh).
   - O consumo REAL total medido do ciclo é a soma das duas (30 + 38 = 68 kWh) ou a diferença de leituras do medidor (2.884 - 2.816 = 68 kWh), e está registrado exatamente na tabela "Histórico do Consumo" na coluna "Consumo kWh" para este mês (ex: AGO/26 -> 68).
   - NUNCA confunda a média diária (ex: 2 ou 2,26) com o consumo total (ex: 68)! O gridConsumptionKwh deve ser o consumo total do mês (ex: 68).

2. "MÉDIA DIÁRIA (dailyAvgKwh)":
   - Extraia com precisão decimal da coluna "Média kWh/Dia" da tabela "Histórico do Consumo" para a linha do mês faturado (ex: "AGO/26" -> 2,26 -> 2.26).
   - Não trunque e não arredonde para inteiro! Se a tabela diz "2,26", o valor deve ser 2.26.
   - Caso não esteja na tabela, calcule: gridConsumptionKwh / billingDays (ex: 68 / 30 = 2.27).

3. "COMPENSAÇÃO LOCAL (solarCompensatedKwh)":
   - Verifique a tabela de itens faturados ("Valores Faturados" ou "Demonstrativo de Faturamento").
   - Procure pelas linhas: "Energia compensada GD I", "Energia compensada GD II", "Energia compensada GD III" ou "Energia SCEE ISENTA".
   - A quantidade faturada/compensada em kWh (coluna "Quant." ou "Quantidade", ex: 38) é o solarCompensatedKwh!
   - Se houver essa linha na conta, este campo DEVE conter esse valor em kWh (ex: 38), NUNCA 0 ou null.

4. "SALDO ATUAL DE GERAÇÃO (generationBalanceKwh)":
   - Procure com máxima atenção na seção "Informações Gerais" ou "Demonstrativo de Compensação".
   - Geralmente está escrito "SALDO ATUAL DE GERAÇÃO: XXX,XX kWh" (ex: 1.586,61 kWh -> 1586.61).

5. "ENERGIA INJETADA (solarInjectedKwh)":
   - Procure na tabela "Informações Técnicas" no tipo de medição "Energia Injetada". A diferença ou consumo faturado é a energia injetada em kWh. Se a instalação não injetou energia nesta UC neste ciclo (ex: apenas recebe créditos de outra UC geradora remota), o valor pode ser 0.

6. "HISTÓRICO DE CONSUMO (historicalConsumption)":
   - Extraia TODAS as linhas da tabela de histórico de consumo impressa na fatura (geralmente 12 ou 13 meses).
   - Cada linha deve conter: month (ex: "AGO/26"), consumptionKwh (ex: 68), dailyAvgKwh (ex: 2.26) e days (ex: 30).

7. Decimais brasileiros: converta vírgula para ponto (ex: "1.586,61" -> 1586.61, "2,26" -> 2.26, "32,93" -> 32.93, "1,17999863" -> 1.17999863).

8. Datas: converta para YYYY-MM-DD. Mês de referência: "AGO/2026" ou "AGO/26" -> "2026-08".
9. Nunca invente valores. Se um campo não estiver presente, use null ou 0.`;

function parseMonthToKey(str: string | null | undefined): string | null {
    if (!str) return null;
    const clean = str.trim().toUpperCase();
    if (/^\d{4}-\d{2}$/.test(clean)) return clean;

    const monthsMap: Record<string, string> = {
        JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
        JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12"
    };

    const match = clean.match(/([A-Z]{3})[\/\-](\d{2,4})/);
    if (!match) return null;

    const monthNum = monthsMap[match[1]];
    if (!monthNum) return null;

    let year = match[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${monthNum}`;
}

export function postProcessExtractedBill(data: ExtractedEnergyBill): ExtractedEnergyBill {
    if (!data) return data;

    const targetKey = parseMonthToKey(data.referenceMonth) || parseMonthToKey(data.referenceMonthLabel);

    // 1. Cross-check with historical consumption table for the exact reference month
    if (targetKey && Array.isArray(data.historicalConsumption) && data.historicalConsumption.length > 0) {
        const matchingHist = data.historicalConsumption.find((h) => {
            const hKey = parseMonthToKey(h.month);
            return hKey === targetKey;
        });

        if (matchingHist) {
            // If historical table has authoritative consumption for this month
            if (matchingHist.consumptionKwh > 0) {
                // If model extracted <= 5 (e.g. 2 instead of 68) or mismatched significantly
                if (data.gridConsumptionKwh == null || data.gridConsumptionKwh <= 5 || Math.abs(data.gridConsumptionKwh - matchingHist.consumptionKwh) > 5) {
                    console.log(`[postProcess] Overriding gridConsumptionKwh (${data.gridConsumptionKwh}) with historical consumption: ${matchingHist.consumptionKwh}`);
                    data.gridConsumptionKwh = matchingHist.consumptionKwh;
                }
            }

            // If daily average is in historical table
            if (matchingHist.dailyAvgKwh > 0) {
                if (data.dailyAvgKwh == null || data.dailyAvgKwh <= 0.1 || Math.abs(data.dailyAvgKwh - matchingHist.dailyAvgKwh) > 0.5) {
                    console.log(`[postProcess] Overriding dailyAvgKwh (${data.dailyAvgKwh}) with historical daily average: ${matchingHist.dailyAvgKwh}`);
                    data.dailyAvgKwh = matchingHist.dailyAvgKwh;
                }
            }

            if (matchingHist.days > 0 && (!data.billingDays || data.billingDays === 30)) {
                data.billingDays = matchingHist.days;
            }
        }
    }

    // 2. Meter Readings difference check
    if (data.gridReadingCurrent != null && data.gridReadingPrevious != null && data.gridReadingCurrent > data.gridReadingPrevious) {
        const meterDiff = data.gridReadingCurrent - data.gridReadingPrevious;
        if (meterDiff > 0 && (data.gridConsumptionKwh == null || data.gridConsumptionKwh <= 5)) {
            console.log(`[postProcess] Correcting gridConsumptionKwh with meter diff: ${meterDiff}`);
            data.gridConsumptionKwh = meterDiff;
        }
    }

    // 3. Fallback daily average calculation if still missing or absurdly low
    const days = data.billingDays || 30;
    if ((data.dailyAvgKwh == null || data.dailyAvgKwh <= 0.1) && data.gridConsumptionKwh && data.gridConsumptionKwh > 0) {
        data.dailyAvgKwh = Math.round((data.gridConsumptionKwh / days) * 100) / 100;
        console.log(`[postProcess] Computed fallback dailyAvgKwh: ${data.dailyAvgKwh}`);
    }

    // 4. Solar Compensated kWh validation
    // If solarCompensatedKwh is 0 or null, check if there was compensated or SCEE exempt activity
    if (!data.solarCompensatedKwh || data.solarCompensatedKwh === 0) {
        const hasSolarActivity = (data.energyCompensatedAmount && Math.abs(data.energyCompensatedAmount) > 0) ||
                                (data.energySceeExemptAmount && data.energySceeExemptAmount > 0) ||
                                (data.generationBalanceKwh && data.generationBalanceKwh > 0);

        if (hasSolarActivity && data.gridConsumptionKwh && data.gridConsumptionKwh > 0) {
            const availKwh = data.availabilityCostKwh || 30;
            // In CEMIG, the compensated amount is typically the consumption above availability cost
            if (data.gridConsumptionKwh > availKwh) {
                const estimatedCompensated = data.gridConsumptionKwh - availKwh;
                console.log(`[postProcess] Inferred solarCompensatedKwh from consumption - availability (${data.gridConsumptionKwh} - ${availKwh}): ${estimatedCompensated}`);
                data.solarCompensatedKwh = estimatedCompensated;
            }
        }
    }

    return data;
}

function parseJsonContent(content: string): ExtractedEnergyBill {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(cleaned);
    return postProcessExtractedBill(parsed);
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
