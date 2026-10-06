/**
 * Reading an energy bill: the vision model's answer, then what the PDF's own text layer states.
 *
 * The vision model reads every bill (photos and scans have no text). Where the bill is a digital PDF, the
 * lines it prints — every "Energia compensada GD …" line, the injected-energy meter row, the generation
 * balance, the total — are read again from its text (lib/energy-bill-text.ts) and win over the model:
 * on 2026-10-06 the model took only "GD I 220 kWh" of a bill that compensated GD I 220 + GD II 992, and
 * read the injected energy as 0. The compensated energy is always the sum of the lines, never one of them.
 *
 * No Next.js or Sentry imports: the route wires it up, and scripts can run it on real bills.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeExtractedNumbers } from "@/lib/energy-bill-checks";
import { parseBillText, sumCompensation, type BillTextFacts, type CompensationLine } from "@/lib/energy-bill-text";

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
    installationAddress: string | null;  // Logradouro, número e bairro (ex: "RUA JOSE GOIS, 45 CS - SANTO ANTONIO")
    installationCity: string | null;     // Cidade (ex: "ITABIRITO")
    installationState: string | null;    // UF (ex: "MG")
    installationZip: string | null;      // CEP (ex: "35450-264")
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
    /** the sum of compensationLines (kWh) */
    solarCompensatedKwh: number | null;
    generationBalanceKwh: number | null; // SALDO ATUAL DE GERAÇÃO
    unitPrice: number | null;
    availabilityCostKwh: number | null;
    availabilityCostAmount: number | null;
    energySceeExemptAmount: number | null;
    /** the sum of compensationLines (R$, negative) */
    energyCompensatedAmount: number | null;
    availabilityAdjustmentAmount: number | null;
    bonusDiscountsAmount: number | null;
    flagType: string | null;
    flagAmount: number | null;
    taxesIcms: number | null;
    taxesPisCofins: number | null;
    totalAmount: number | null;
    /** every "Energia compensada GD …" / "Compensação GD …" line of the bill */
    compensationLines?: CompensationLine[];
    /** the fields the PDF's text layer confirmed (or corrected) */
    textChecked?: string[];
    historicalConsumption: HistoricalConsumptionItem[];
    confidence: number;
}

export const ENERGY_BILL_PROMPT = `Você é um especialista em leitura de contas de energia elétrica brasileiras com microgeração distribuída (GD / SCEE / Energia Solar), especialmente faturas da CEMIG e outras distribuidoras.
Analise a imagem/fatura de energia elétrica com extrema atenção e extraia TODOS os campos técnicos, solares, financeiros e a tabela de histórico.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem explicações adicionais) com a seguinte estrutura:

{
  "utilityCompany": "string (ex: 'CEMIG')",
  "consumerUnit": "string (N.º da Unidade Consumidora / Instalação, ex: '2.778.206.018-17')",
  "installationAddress": "string ou null (Endereço da instalação/unidade consumidora com rua, número e bairro, ex: 'RUA JOSE GOIS, 45 CS - SANTO ANTONIO')",
  "installationCity": "string ou null (Cidade da instalação, ex: 'ITABIRITO')",
  "installationState": "string ou null (UF com 2 letras, ex: 'MG')",
  "installationZip": "string ou null (CEP da instalação, ex: '35450-264')",
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
  "injectedReadingPrevious": number ou null (Leitura Anterior da linha "Energia Injetada" em Informações Técnicas, ex: 919),
  "injectedReadingCurrent": number ou null (Leitura Atual da linha "Energia Injetada" em Informações Técnicas, ex: 1911),
  "solarInjectedKwh": number (coluna "Consumo kWh" da linha "Energia Injetada" em Informações Técnicas, ex: 992),
  "compensationLines": [
    { "regime": "string ('GD I', 'GD II' ou 'GD III')", "kwh": number (coluna Quant., ex: 220), "amount": number (coluna Valor R$, negativo, ex: -137.17) }
  ],
  "solarCompensatedKwh": number (SOMA dos kWh de todas as compensationLines, ex: 220 + 992 = 1212),
  "generationBalanceKwh": number (SALDO ATUAL DE GERAÇÃO em kWh encontrado em Informações Gerais, ex: 457.85),
  "unitPrice": number (Preço Unitário efetivo ou Tarifa Unitária em R$/kWh, ex: 1.17999863),
  "availabilityCostKwh": number (Taxa mínima em kWh: 100 para trifásico, 50 para bifásico, 30 para monofásico),
  "availabilityCostAmount": number (Custo de Disponibilidade em R$, ex: 35.39),
  "energySceeExemptAmount": number (Energia SCEE ISENTA / Energia compensada ISENTA em R$, ex: 755.70),
  "energyCompensatedAmount": number (SOMA dos valores de todas as compensationLines, negativo, ex: -137.17 + -458.91 = -596.08),
  "availabilityAdjustmentAmount": number (Ajuste Custo Disponibilidade em R$, ex: -92.21),
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

3. "ENERGIA COMPENSADA (compensationLines, solarCompensatedKwh, energyCompensatedAmount)":
   - Na tabela "Valores Faturados", liste em compensationLines CADA linha de compensação, uma por regime: "Energia compensada GD I", "Energia compensada GD II", "Energia compensada GD III" (em alguns meses impressas como "Compensação GD I", "Compensação GD II").
   - Uma mesma fatura pode ter DUAS ou TRÊS dessas linhas (ex: "Energia compensada GD I" 220 kWh -137,17 E "Energia compensada GD II" 992 kWh -458,91). Inclua TODAS; nunca só a primeira.
   - solarCompensatedKwh = soma dos kWh de todas as linhas (ex: 220 + 992 = 1212) e energyCompensatedAmount = soma dos valores (ex: -596.08).
   - Conferência: a soma costuma ser igual à quantidade da linha "Energia SCEE ISENTA" / "Energia compensada ISENTA" (ex: 1.212 kWh).
   - "Energia SCEE ISENTA" NÃO é uma linha de compensação: é a energia isenta que as compensações abatem; o valor dela vai em energySceeExemptAmount.
   - Se não houver nenhuma linha de compensação, use compensationLines: [] e 0.

4. "SALDO ATUAL DE GERAÇÃO (generationBalanceKwh)":
   - Procure com máxima atenção na seção "Informações Gerais" ou "Demonstrativo de Compensação".
   - Geralmente está escrito "SALDO ATUAL DE GERAÇÃO: XXX,XX kWh" (ex: 457,85 kWh -> 457.85). Copie todos os dígitos exatamente.

5. "ENERGIA INJETADA (solarInjectedKwh)":
   - Na tabela "Informações Técnicas", a linha com Tipo de Medição "Energia Injetada" traz Leitura Anterior, Leitura Atual, Constante e Consumo kWh (ex: 919, 1.911, 1, 992).
   - solarInjectedKwh é o "Consumo kWh" dessa linha (= (Leitura Atual − Leitura Anterior) × Constante, ex: 992). Preencha também injectedReadingPrevious e injectedReadingCurrent.
   - Use 0 SOMENTE quando a fatura não tiver a linha "Energia Injetada" (a unidade apenas recebe créditos de outra UC).

6. "HISTÓRICO DE CONSUMO (historicalConsumption)":
   - Extraia TODAS as linhas da tabela de histórico de consumo impressa na fatura (geralmente 12 ou 13 meses).
   - Cada linha deve conter: month (ex: "AGO/26"), consumptionKwh (ex: 68), dailyAvgKwh (ex: 2.26) e days (ex: 30).

7. "ENDEREÇO DA INSTALAÇÃO (installationAddress, installationCity, installationState, installationZip)":
   - Procure no cabeçalho ou dados da unidade consumidora o endereço de localização do imóvel.
   - Em contas da CEMIG, fica localizado no topo à esquerda, logo abaixo do nome do titular/cliente (ex: 'RUA JOSE GOIS 45 CS', 'SANTO ANTONIO', '35450-264 ITABIRITO, MG').
   - Extraia o logradouro com número e bairro em installationAddress (ex: 'RUA JOSE GOIS, 45 CS - SANTO ANTONIO'), a cidade em installationCity (ex: 'ITABIRITO'), a UF em installationState (ex: 'MG') e o CEP em installationZip (ex: '35450-264').

8. Decimais brasileiros: converta vírgula para ponto (ex: "1.586,61" -> 1586.61, "2,26" -> 2.26, "32,93" -> 32.93, "1,17999863" -> 1.17999863). O ponto é separador de milhar ("1.212" -> 1212).

9. Datas: converta para YYYY-MM-DD. Mês de referência: "AGO/2026" ou "AGO/26" -> "2026-08".
10. Nunca invente valores. Se um campo não estiver presente, use null ou 0.`;

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

/** The model's compensation lines, cleaned: numbers only, credits negative, empty lines dropped. */
function cleanCompensationLines(raw: unknown): CompensationLine[] {
    if (!Array.isArray(raw)) return [];
    const out: CompensationLine[] = [];
    for (const item of raw) {
        const o = (item ?? {}) as Record<string, unknown>;
        const kwh = typeof o.kwh === "number" ? o.kwh : Number(String(o.kwh ?? "").replace(/\./g, "").replace(",", "."));
        const amountRaw = typeof o.amount === "number" ? o.amount : Number(String(o.amount ?? "").replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(kwh) || kwh <= 0) continue;
        out.push({ regime: String(o.regime ?? "GD").trim().toUpperCase() || "GD", kwh, amount: Number.isFinite(amountRaw) ? -Math.abs(amountRaw) : 0 });
    }
    return out;
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

    // 4. Compensated energy = every compensation line added up (GD I + GD II + …), never one of them
    const lines = cleanCompensationLines(data.compensationLines);
    data.compensationLines = lines;
    if (lines.length > 0) {
        const sum = sumCompensation(lines);
        data.solarCompensatedKwh = sum.kwh;
        data.energyCompensatedAmount = sum.amount;
    }

    // 5. Injected energy read as 0 while the injected meter moved: the meter's difference is what was injected
    const injPrev = data.injectedReadingPrevious, injCurr = data.injectedReadingCurrent;
    if (typeof injPrev === "number" && typeof injCurr === "number" && injCurr > injPrev && !((data.solarInjectedKwh ?? 0) > 0)) {
        data.solarInjectedKwh = injCurr - injPrev;
    }

    // No inference for a missing "energia compensada": the extractor never invents
    // values. extractionWarnings() tells the user what to fill in instead.
    return data;
}

/**
 * What the PDF's text layer states wins over the model: the compensation lines (summed), the injected-energy
 * meter row, the consumption meter row, the generation balance and the total. Fields the text does not carry
 * keep the model's reading. `textChecked` lists what the text confirmed or corrected.
 */
export function applyBillText(data: ExtractedEnergyBill, facts: BillTextFacts): ExtractedEnergyBill {
    const checked: string[] = [];
    if (facts.compensation.length > 0) {
        const sum = sumCompensation(facts.compensation);
        data.compensationLines = facts.compensation;
        data.solarCompensatedKwh = sum.kwh;
        data.energyCompensatedAmount = sum.amount;
        checked.push("solarCompensatedKwh", "energyCompensatedAmount");
    }
    if (facts.sceeExempt) {
        data.energySceeExemptAmount = facts.sceeExempt.amount;
        checked.push("energySceeExemptAmount");
    }
    if (facts.injected) {
        data.injectedReadingPrevious = facts.injected.previous;
        data.injectedReadingCurrent = facts.injected.current;
        data.solarInjectedKwh = facts.injected.kwh;
        checked.push("solarInjectedKwh");
    }
    if (facts.consumption) {
        data.gridReadingPrevious = facts.consumption.previous;
        data.gridReadingCurrent = facts.consumption.current;
        data.gridConsumptionKwh = facts.consumption.kwh;
        data.meterNumber = data.meterNumber || facts.consumption.meter;
        checked.push("gridConsumptionKwh");
    }
    if (facts.generationBalanceKwh != null) {
        data.generationBalanceKwh = facts.generationBalanceKwh;
        checked.push("generationBalanceKwh");
    }
    if (facts.totalAmount != null && facts.totalAmount > 0) {
        data.totalAmount = facts.totalAmount;
        checked.push("totalAmount");
    }
    if (checked.length > 0) data.textChecked = checked;
    return data;
}

/** The model's JSON → a cleaned bill, corrected by the PDF's text when there is one. */
export function parseExtraction(content: string, pdfText?: string | null): ExtractedEnergyBill {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const bill = postProcessExtractedBill(normalizeExtractedNumbers(JSON.parse(cleaned)));
    return pdfText && pdfText.trim() ? applyBillText(bill, parseBillText(pdfText)) : bill;
}

/** The raw JSON text from Gemini Vision. */
export async function geminiBillJson(base64: string, mimeType: string, model: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const genAI = new GoogleGenerativeAI(apiKey);
    const generative = genAI.getGenerativeModel({ model, generationConfig: { responseMimeType: "application/json", temperature: 0.1 } });
    const result = await generative.generateContent([ENERGY_BILL_PROMPT, { inlineData: { data: base64, mimeType } }]);
    return (await result.response).text();
}

/** The raw JSON text from OpenAI Vision. */
export async function openAiBillJson(base64: string, mimeType: string, model: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: [{ type: "text", text: ENERGY_BILL_PROMPT }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } }] }],
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
    return content;
}
