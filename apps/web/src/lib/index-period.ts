/**
 * The period buttons of the index pages (6M · 1A · 2A · 5A · 10A · YTD · Máx · Personalizar) and the
 * figures shown for the chosen slice.
 *
 * The series are monthly (the salário mínimo one yearly), so a preset counts points, not days: "1A"
 * is the last twelve published months, ending at the latest value the series has — not at today, so
 * a series that is a month behind still shows a full window. Everything happens in the browser: the
 * page loads the whole history once and the buttons only slice it, which keeps these public pages
 * free of query-string variants (see lib/crawler-guard.ts for what those cost).
 */

export type PeriodKey = "6m" | "1y" | "2y" | "5y" | "10y" | "20y" | "ytd" | "max" | "custom";

export interface PeriodPreset {
    key: PeriodKey;
    label: string;
    /** what the button says on hover */
    title: string;
    /** window length in months (monthly series) */
    months?: number;
    /** window length in years (yearly series) */
    years?: number;
}

/** ISO dates, both ends included */
export interface DateRange {
    start: string;
    end: string;
}

export const MONTHLY_PRESETS: PeriodPreset[] = [
    { key: "6m", label: "6M", title: "Últimos 6 meses", months: 6 },
    { key: "1y", label: "1A", title: "Últimos 12 meses", months: 12 },
    { key: "2y", label: "2A", title: "Últimos 2 anos", months: 24 },
    { key: "5y", label: "5A", title: "Últimos 5 anos", months: 60 },
    { key: "10y", label: "10A", title: "Últimos 10 anos", months: 120 },
    { key: "ytd", label: "YTD", title: "Do início do ano até o último dado" },
    { key: "max", label: "Máx", title: "Toda a série" },
    { key: "custom", label: "Personalizar", title: "Escolher as datas" },
];

export const YEARLY_PRESETS: PeriodPreset[] = [
    { key: "5y", label: "5A", title: "Últimos 5 anos", years: 5 },
    { key: "10y", label: "10A", title: "Últimos 10 anos", years: 10 },
    { key: "20y", label: "20A", title: "Últimos 20 anos", years: 20 },
    { key: "max", label: "Máx", title: "Toda a série" },
    { key: "custom", label: "Personalizar", title: "Escolher as datas" },
];

export const DEFAULT_MONTHLY_PERIOD: PeriodKey = "5y";
export const DEFAULT_YEARLY_PERIOD: PeriodKey = "10y";

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" shifted by n months */
export function addMonths(month: string, n: number): string {
    const [y, m] = month.split("-").map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

/** "2026-08-01" → "ago/2026" */
export function formatMonthYear(date: string): string {
    const [y, m] = date.split("-").map(Number);
    return `${MONTHS_PT[(m || 1) - 1]}/${y}`;
}

/** "2026-08-01" → "ago/26" (chart ticks) */
export function formatMonthYearShort(date: string): string {
    const [y, m] = date.split("-").map(Number);
    return `${MONTHS_PT[(m || 1) - 1]}/${String(y).slice(2)}`;
}

/** "ago/2021 – ago/2026" */
export function formatRangeLabel(range: DateRange): string {
    return `${formatMonthYear(range.start)} – ${formatMonthYear(range.end)}`;
}

/**
 * The dates a preset covers, given the oldest and newest points of the series (ISO). The window ends
 * at the newest point; its start never goes before the oldest one.
 */
export function presetRange(preset: PeriodPreset, earliest: string, latest: string): DateRange {
    let start = earliest;
    if (preset.key === "ytd") {
        start = `${latest.slice(0, 4)}-01-01`;
    } else if (preset.years) {
        start = `${Number(latest.slice(0, 4)) - preset.years + 1}-01-01`;
    } else if (preset.months) {
        start = `${addMonths(latest.slice(0, 7), -(preset.months - 1))}-01`;
    }
    return { start: start < earliest ? earliest : start, end: latest };
}

/** A preset that would show the whole series anyway (the series is shorter than its window). */
export function presetIsRedundant(preset: PeriodPreset, earliest: string, latest: string): boolean {
    if (preset.key === "max" || preset.key === "custom" || preset.key === "ytd") return false;
    return presetRange(preset, earliest, latest).start <= earliest;
}

/** Keeps a custom range inside the series and in order; a missing end means "up to the latest point". */
export function clampRange(range: Partial<DateRange>, earliest: string, latest: string): DateRange {
    let start = range.start && range.start > earliest ? range.start : earliest;
    let end = range.end && range.end < latest ? range.end : latest;
    if (start > latest) start = latest;
    if (end < earliest) end = earliest;
    if (start > end) [start, end] = [end, start];
    return { start, end };
}

export function filterByRange<T extends { reference_date: string }>(rows: T[], range: DateRange): T[] {
    return rows.filter((r) => r.reference_date >= range.start && r.reference_date <= range.end);
}

export interface SeriesPoint {
    /** ISO reference date */
    date: string;
    value: number;
}

export interface SeriesSummary {
    count: number;
    first: SeriesPoint;
    last: SeriesPoint;
    /** variations: the compound of the slice, %; levels: last over first − 1, % */
    accumulated: number;
    average: number;
    max: SeriesPoint;
    min: SeriesPoint;
}

/**
 * The figures of a slice. `variation` series (IPCA, CDI, FipeZAP…) hold monthly rates in %, so the
 * slice compounds; `level` series (the salário mínimo in R$, the FipeZAP yield in % per month) hold
 * values, so the accumulated figure is the change from the first point to the last.
 */
export function summarizeSeries(points: SeriesPoint[], kind: "variation" | "level" = "variation"): SeriesSummary | null {
    if (points.length === 0) return null;
    const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    let max = first;
    let min = first;
    let sum = 0;
    let compound = 1;
    for (const p of sorted) {
        if (p.value > max.value) max = p;
        if (p.value < min.value) min = p;
        sum += p.value;
        compound *= 1 + p.value / 100;
    }
    const accumulated = kind === "variation" ? (compound - 1) * 100 : first.value === 0 ? 0 : (last.value / first.value - 1) * 100;
    return { count: sorted.length, first, last, accumulated, average: sum / sorted.length, max, min };
}
