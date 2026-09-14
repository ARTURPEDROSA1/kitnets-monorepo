/**
 * Property valuations (market value over time) — pure helpers shared by the
 * API, the analysis section and the portfolio roll-up.
 */
import { round2 } from "./property-income";
import { shiftMonthKey } from "./period-filter";

export type ValuationSource = "MANUAL" | "APPRAISAL" | "FIPEZAP" | "LISTING";

export const VALUATION_SOURCES: ReadonlyArray<{ value: ValuationSource; label: string; hint: string }> = [
    { value: "MANUAL", label: "Estimativa própria", hint: "Quanto você acha que o imóvel vale hoje" },
    { value: "APPRAISAL", label: "Avaliação / laudo", hint: "Laudo de avaliação, banco ou corretor" },
    { value: "FIPEZAP", label: "FipeZap (estimativa)", hint: "Preço de compra corrigido pelo índice FipeZap de venda" },
    { value: "LISTING", label: "Anúncios comparáveis", hint: "Preço pedido de imóveis semelhantes" },
];
export const VALUATION_SOURCE_VALUES = VALUATION_SOURCES.map(s => s.value) as ValuationSource[];
export const VALUATION_SOURCE_LABELS: Record<ValuationSource, string> = Object.fromEntries(VALUATION_SOURCES.map(s => [s.value, s.label])) as Record<ValuationSource, string>;

export interface PropertyValuation {
    id: string;
    property_id: string;
    /** `YYYY-MM-DD` */
    valued_on: string;
    amount: number;
    source: ValuationSource;
    note: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ValuationInput {
    id?: string;
    valued_on: string;
    amount: number;
    source: ValuationSource;
    note?: string | null;
}

/** Newest valuation on or before `asOf` (`YYYY-MM` or `YYYY-MM-DD`), or null. */
export function latestValuation(rows: PropertyValuation[], asOf?: string): PropertyValuation | null {
    const limit = asOf ? (asOf.length === 7 ? `${asOf}-31` : asOf) : null;
    let best: PropertyValuation | null = null;
    for (const r of rows) {
        if (limit && r.valued_on > limit) continue;
        if (!best || r.valued_on > best.valued_on || (r.valued_on === best.valued_on && (r.created_at ?? "") > (best.created_at ?? ""))) best = r;
    }
    return best;
}

/** Monthly index point: `month` = `YYYY-MM`, `value` = variation in % for that month. */
export interface MonthlyIndexPoint {
    month: string;
    value: number;
}

export interface FipezapEstimate {
    amount: number;
    /** compounded factor applied to the purchase price */
    factor: number;
    /** first and last months compounded (`YYYY-MM`) */
    from: string | null;
    to: string | null;
    months: number;
}

/**
 * Carries the purchase price by the FipeZap sale index: compounds every monthly
 * variation strictly after the acquisition month up to `asOf` (or the last
 * available month). Months missing from the series are skipped.
 */
export function fipezapEstimate(purchasePrice: number, acquiredOn: string, series: MonthlyIndexPoint[], asOf?: string): FipezapEstimate {
    const start = acquiredOn.slice(0, 7);
    const end = asOf ? asOf.slice(0, 7) : null;
    let factor = 1, from: string | null = null, to: string | null = null, months = 0;
    for (const p of [...series].sort((a, b) => (a.month < b.month ? -1 : 1))) {
        if (p.month <= start) continue;
        if (end && p.month > end) break;
        if (!Number.isFinite(p.value)) continue;
        factor *= 1 + p.value / 100;
        from = from ?? p.month;
        to = p.month;
        months++;
    }
    return { amount: round2(purchasePrice * factor), factor: Math.round(factor * 1e6) / 1e6, from, to, months };
}

/**
 * Cumulative price-level factors from a monthly index (IPCA): `factor(m)` is
 * the level at month `m` relative to `base` (= 1 at the base month). Months
 * outside the series carry the nearest known level, so the map covers every
 * month from `from` to `to` inclusive.
 */
export function priceLevelFactors(series: MonthlyIndexPoint[], from: string, to: string, base: string): Map<string, number> {
    const byMonth = new Map(series.map(p => [p.month, p.value]));
    const level = new Map<string, number>();
    let acc = 1;
    for (let m = from; m <= to; m = shiftMonthKey(m, 1)) {
        const v = byMonth.get(m);
        if (v !== undefined && Number.isFinite(v)) acc *= 1 + v / 100;
        level.set(m, acc);
        if (m === to) break;
    }
    const baseLevel = level.get(base) ?? level.get(to) ?? 1;
    const out = new Map<string, number>();
    for (const [m, l] of level) out.set(m, l / baseLevel);
    return out;
}
