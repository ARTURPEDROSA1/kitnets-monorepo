/**
 * Correction calculator — which indexes have one and how each is worded.
 *
 * The calculator compounds a monthly variation series (`{ month, value % }`). Indexes stored in
 * `economic_index_values` already are one. FipeZap comes from `fipezap_series` (monthly variation,
 * all bedrooms) and the minimum wage is turned into one: 0 % every month, and the adjustment in the
 * month a new wage took effect.
 */
export interface CalcSeriesPoint { month: string; value: number }   // same shape as IndexValueForCalc

export interface CalculatorIndex {
    /** how the index is written in the calculator's texts */
    label: string;
    /** Portuguese gender: "pela Selic" vs "pelo IPCA" */
    feminine?: boolean;
    source: "index" | "fipezap" | "minimum-wage";
    /** `economic_indexes.code` for source "index"; `fipezap_series.index_type` for "fipezap" */
    key?: string;
}

/** Keyed by the code used in `/api/indices/{code}/calculator-data` (upper case). */
export const CALCULATOR_INDEXES: Record<string, CalculatorIndex> = {
    IPCA: { label: "IPCA", source: "index", key: "IPCA" },
    INPC: { label: "INPC", source: "index", key: "INPC" },
    IGPM: { label: "IGP-M", source: "index", key: "IGPM" },
    IVAR: { label: "IVAR", source: "index", key: "IVAR" },
    CDI: { label: "CDI", source: "index", key: "CDI" },
    SELIC: { label: "Selic", feminine: true, source: "index", key: "SELIC" },
    "FIPEZAP-LOCACAO": { label: "FipeZap Locação", source: "fipezap", key: "locacao" },
    "FIPEZAP-VENDA": { label: "FipeZap Venda", source: "fipezap", key: "venda" },
    "REAJUSTE-SALARIO-MINIMO": { label: "Salário Mínimo", source: "minimum-wage" },
};

const nextMonth = (month: string): string => {
    const [y, m] = month.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Minimum wage as a monthly variation series, from the first wage in the table to `nowMonth`:
 * the adjustment (computed from the amounts, not from the rounded percentage) in the month a new wage
 * took effect, 0 in every other month. Projections and future rows are left out.
 */
export function minimumWageMonthlySeries(rows: Array<{ reference_date: string; amount_brl: number; is_projection?: boolean | null }>, nowMonth: string): CalcSeriesPoint[] {
    const wages = rows
        .filter(r => !r.is_projection && Number(r.amount_brl) > 0 && r.reference_date.slice(0, 7) <= nowMonth)
        .map(r => ({ month: r.reference_date.slice(0, 7), amount: Number(r.amount_brl) }))
        .sort((a, b) => (a.month < b.month ? -1 : 1));
    if (wages.length === 0) return [];
    const changeAt = new Map<string, number>();
    for (let i = 1; i < wages.length; i++) {
        const pct = (wages[i].amount / wages[i - 1].amount - 1) * 100;
        const prev = changeAt.get(wages[i].month);   // two decrees in the same month compound
        changeAt.set(wages[i].month, prev === undefined ? pct : ((1 + prev / 100) * (1 + pct / 100) - 1) * 100);
    }
    const out: CalcSeriesPoint[] = [];
    for (let m = wages[0].month; m <= nowMonth; m = nextMonth(m)) out.push({ month: m, value: changeAt.get(m) ?? 0 });
    return out;
}
