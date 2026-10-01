/**
 * The maths behind the Panorama's "quanto vale hoje?": an amount corrected by each index between two
 * dates. Monthly rates compound (lib/index-correction.ts, calendar days, partial months pro rata die);
 * a level (the salário mínimo in R$) scales the amount by the ratio of the values in force at the two
 * dates. Pure, shared by the calculator card, its results table and the per-index cards.
 */
import { addMonths, correctByIndex, lastDayOfMonth, monthOf, type IndexMonthValue } from "@/lib/index-correction";
import { formatMonthYear } from "@/lib/index-period";

export interface PanoramaData {
    /** monthly rates in %, by Panorama key (lib/index-compare.ts) */
    rates: Record<string, IndexMonthValue[]>;
    /** levels in R$ (the salário mínimo), by key */
    levels: Record<string, IndexMonthValue[]>;
}

export interface Correction {
    /** the amount typed, in R$ */
    value: number;
    /** ISO dates */
    start: string;
    end: string;
    data: PanoramaData;
}

export type CorrectionKind = "variation" | "level" | "none";

export type CorrectionResult =
    /**
     * `fromMonth` / `throughMonth` ("YYYY-MM"): the index starts after the start date or stops before
     * the end date, so the correction ran from its first month / up to its last one
     */
    | { corrected: number; percent: number; fromMonth?: string; throughMonth?: string }
    | { note: string };

export const formatBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The amount of `ctx` corrected by one index. An index that did not exist yet at the start date is
 * applied from its first month (`fromMonth`), one whose last published month is before the end date
 * up to that month (`throughMonth`). Null when the index has no data or is not a correction index
 * (the FipeZAP yield).
 */
export function computeCorrection(ctx: Correction, seriesKey: string, kind: CorrectionKind): CorrectionResult | null {
    if (kind === "none" || ctx.value <= 0) return null;
    if (kind === "variation") {
        const rates = ctx.data.rates[seriesKey];
        if (!rates || rates.length === 0) return null;
        let earliestMonth = rates[0].month;
        let latestMonth = rates[0].month;
        for (const v of rates) {
            if (v.month < earliestMonth) earliestMonth = v.month;
            if (v.month > latestMonth) latestMonth = v.month;
        }
        // the whole first month counts when the period starts before the series: the value is dated
        // the last day of the month before it
        const seriesStart = lastDayOfMonth(addMonths(earliestMonth, -1));
        const seriesEnd = lastDayOfMonth(latestMonth);
        const start = ctx.start < seriesStart ? seriesStart : ctx.start;
        const end = ctx.end > seriesEnd ? seriesEnd : ctx.end;
        if (end <= start) return { note: `Sem dados entre ${formatMonthYear(ctx.start)} e ${formatMonthYear(ctx.end)}.` };
        const res = correctByIndex(ctx.value, start, end, rates);
        if ("error" in res) return { note: res.error };
        return {
            corrected: res.correctedValue,
            percent: res.accumulatedPercent,
            fromMonth: start !== ctx.start ? earliestMonth : undefined,
            throughMonth: end !== ctx.end ? latestMonth : undefined,
        };
    }
    const levels = ctx.data.levels[seriesKey];
    if (!levels || levels.length === 0) return null;
    const sorted = [...levels].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    // the value in force at a date: the last adjustment up to that month
    const at = (date: string) => {
        const m = monthOf(date);
        let last: number | null = null;
        for (const l of sorted) {
            if (l.month <= m) last = l.value;
            else break;
        }
        return last;
    };
    const a = at(ctx.start);
    const b = at(ctx.end);
    if (a === null || b === null || a === 0) return { note: "Sem salário mínimo vigente nas datas escolhidas." };
    return { corrected: ctx.value * (b / a), percent: (b / a - 1) * 100 };
}
