import { parseCurrencyBR } from "@/lib/currency";

/**
 * Checks on what the AI read from an energy bill, before the user confirms it.
 *
 * The extractor must never invent values. When something looks missing or
 * inconsistent it says so in `extractionWarnings`, the upload screen shows the
 * messages, and the user fixes the field. (The previous post-processing step
 * filled a missing "energia compensada" with consumption − availability and
 * saved it as if it had been read.)
 */

const NUMERIC_FIELDS = [
    "billingDays", "gridReadingPrevious", "gridReadingCurrent", "gridConsumptionKwh", "dailyAvgKwh", "monthlyAvgKwh",
    "injectedReadingPrevious", "injectedReadingCurrent", "solarInjectedKwh", "solarCompensatedKwh", "generationBalanceKwh",
    "unitPrice", "availabilityCostKwh", "availabilityCostAmount", "energySceeExemptAmount", "energyCompensatedAmount",
    "availabilityAdjustmentAmount", "bonusDiscountsAmount", "flagAmount", "taxesIcms", "taxesPisCofins", "totalAmount",
    "confidence",
] as const;

/**
 * Models occasionally answer "1.234,56" or "138 kWh" where a number was asked
 * for. Coerce those; anything unreadable becomes null rather than NaN.
 */
export function normalizeExtractedNumbers<T extends Record<string, unknown>>(data: T): T {
    if (!data || typeof data !== "object") return data;
    const out: Record<string, unknown> = { ...data };
    for (const key of NUMERIC_FIELDS) {
        const v = out[key];
        if (v == null || typeof v === "number") {
            if (typeof v === "number" && !Number.isFinite(v)) out[key] = null;
            continue;
        }
        if (typeof v === "string") {
            const cleaned = v.replace(/[^\d.,()\-+]/g, "");
            out[key] = cleaned && /\d/.test(cleaned) ? parseCurrencyBR(cleaned) : null;
        } else {
            out[key] = null;
        }
    }
    return out as T;
}

export interface ExtractedBillLike {
    referenceMonth?: string | null;
    gridReadingPrevious?: number | null;
    gridReadingCurrent?: number | null;
    gridConsumptionKwh?: number | null;
    solarInjectedKwh?: number | null;
    solarCompensatedKwh?: number | null;
    generationBalanceKwh?: number | null;
    energyCompensatedAmount?: number | null;
    energySceeExemptAmount?: number | null;
    totalAmount?: number | null;
    confidence?: number | null;
}

/** Portuguese messages for the upload screen; empty when nothing looks off. */
export function extractionWarnings(bill: ExtractedBillLike | null | undefined): string[] {
    if (!bill) return [];
    const warnings: string[] = [];
    const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

    if (!bill.referenceMonth || !/^\d{4}-\d{2}$/.test(bill.referenceMonth)) {
        warnings.push("Mês de referência não identificado. Informe antes de salvar.");
    }

    const solarActivity =
        num(bill.solarInjectedKwh) > 0 ||
        num(bill.generationBalanceKwh) > 0 ||
        Math.abs(num(bill.energyCompensatedAmount)) > 0 ||
        num(bill.energySceeExemptAmount) > 0;
    if (solarActivity && !(num(bill.solarCompensatedKwh) > 0)) {
        warnings.push("A energia compensada (kWh) não foi lida da fatura. Confira o campo “Compensada GD” e informe o valor impresso.");
    }

    const prev = bill.gridReadingPrevious, curr = bill.gridReadingCurrent;
    if (typeof prev === "number" && typeof curr === "number" && curr > prev && num(bill.gridConsumptionKwh) > 0) {
        const diff = curr - prev;
        const consumption = num(bill.gridConsumptionKwh);
        if (Math.abs(diff - consumption) > Math.max(5, consumption * 0.05)) {
            warnings.push(`O consumo lido (${consumption} kWh) difere da diferença entre as leituras do medidor (${diff} kWh).`);
        }
    }

    if (num(bill.gridConsumptionKwh) > 0 && !(num(bill.totalAmount) > 0)) {
        warnings.push("Valor total da fatura não identificado.");
    }

    if (typeof bill.confidence === "number" && bill.confidence > 0 && bill.confidence < 0.6) {
        warnings.push("Leitura com baixa confiança. Revise os campos antes de salvar.");
    }

    return warnings;
}
