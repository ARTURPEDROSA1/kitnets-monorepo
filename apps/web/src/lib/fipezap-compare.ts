/**
 * Pure arithmetic and formatting for the FipeZap city dashboard: compounding, rebasing, yearly
 * tables, rankings and pt-BR/en/es number formats. No I/O.
 */

export interface MonthPoint { month: string; value: number }

const LOCALES: Record<string, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };
const MONTHS_SHORT: Record<string, string[]> = {
    pt: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};
const MONTHS_LONG: Record<string, string[]> = {
    pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
};

export const locale = (lang: string) => LOCALES[lang] ?? LOCALES.pt;

/** "+0,76%" / "−1,20%" (a real minus sign); `sign` false drops the plus. */
export function fmtPct(v: number | null | undefined, opts: { digits?: number; sign?: boolean; lang?: string } = {}): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "–";
    const { digits = 2, sign = true, lang = "pt" } = opts;
    const abs = Math.abs(v).toLocaleString(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const s = v < 0 ? "−" : sign && v > 0 ? "+" : "";
    return `${s}${abs}%`;
}

/** "R$ 9.954" or "R$ 53,79" — whole reais above 1000, two decimals below (rental R$/m²). */
export function fmtBRL(v: number | null | undefined, opts: { digits?: number; lang?: string } = {}): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "–";
    const digits = opts.digits ?? (Math.abs(v) >= 1000 ? 0 : 2);
    return v.toLocaleString(locale(opts.lang ?? "pt"), { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(v: number, lang = "pt"): string {
    return v.toLocaleString(locale(lang), { maximumFractionDigits: 0 });
}

/** 'YYYY-MM-01' → "ago/26" */
export function monthShort(month: string, lang = "pt"): string {
    const [y, m] = month.split("-").map(Number);
    return `${(MONTHS_SHORT[lang] ?? MONTHS_SHORT.pt)[m - 1]}/${String(y).slice(2)}`;
}

/** 'YYYY-MM-01' → "agosto de 2026" / "August 2026" / "agosto de 2026" */
export function monthLong(month: string, lang = "pt"): string {
    const [y, m] = month.split("-").map(Number);
    const name = (MONTHS_LONG[lang] ?? MONTHS_LONG.pt)[m - 1];
    return lang === "en" ? `${name} ${y}` : `${name} de ${y}`;
}

export const yearOf = (month: string) => Number(month.slice(0, 4));

/** Compounds monthly variations in %: [1, 1] → 2.01 */
export function compound(values: Array<number | null | undefined>): number | null {
    let acc = 1, n = 0;
    for (const v of values) { if (v === null || v === undefined || !Number.isFinite(v)) continue; acc *= 1 + v / 100; n++; }
    return n ? (acc - 1) * 100 : null;
}

/** Monthly yield in % → annual in %: 0.5 → 6.17 */
export function annualiseYield(monthly: number | null | undefined): number | null {
    if (monthly === null || monthly === undefined || !Number.isFinite(monthly)) return null;
    return (Math.pow(1 + monthly / 100, 12) - 1) * 100;
}

export function average(values: Array<number | null | undefined>): number | null {
    const v = values.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Index = 100 at `baseMonth`. Uses FIPE's index levels when given (exact), otherwise compounds the
 * monthly variations after the base month. Months before the base are dropped.
 */
export function rebaseSeries(monthly: MonthPoint[], baseMonth: string, levels?: MonthPoint[]): MonthPoint[] {
    if (levels && levels.length) {
        const sorted = [...levels].sort((a, b) => a.month.localeCompare(b.month)).filter(p => p.month >= baseMonth);
        const base = sorted[0]?.value;
        if (base) return sorted.map(p => ({ month: p.month, value: (p.value / base) * 100 }));
    }
    const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month)).filter(p => p.month >= baseMonth);
    let acc = 100;
    return sorted.map((p, i) => { if (i > 0) acc *= 1 + p.value / 100; return { month: p.month, value: acc }; });
}

/** Points from `from` (inclusive) on; null `from` keeps everything. */
export function filterFrom<T extends { month: string }>(points: T[], from: string | null, to?: string | null): T[] {
    return points.filter(p => (!from || p.month >= from) && (!to || p.month <= to));
}

/** 'YYYY-12-01' for every year in [fromYear, toYear]. */
export function decemberDates(fromYear: number, toYear: number): string[] {
    const out: string[] = [];
    for (let y = fromYear; y <= toYear; y++) out.push(`${y}-12-01`);
    return out;
}

/** Sorts by a numeric key; nulls last; ties keep the input order. */
export function rankBy<T>(rows: T[], key: (r: T) => number | null | undefined, dir: "asc" | "desc" = "desc"): T[] {
    return rows.map((r, i) => ({ r, i, v: key(r) })).sort((a, b) => {
        const av = a.v ?? null, bv = b.v ?? null;
        if (av === null && bv === null) return a.i - b.i;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (dir === "desc" ? bv - av : av - bv) || a.i - b.i;
    }).map(x => x.r);
}

/** 1-based position of `slug` in a ranking, or null. */
export function rankPosition<T extends { slug: string }>(ranked: T[], slug: string): number | null {
    const i = ranked.findIndex(r => r.slug === slug);
    return i < 0 ? null : i + 1;
}

/**
 * Cell colour of the yearly table: the city's yearly variation against that year's inflation.
 * Real gain in emerald, real loss in rose, three steps each; neutral within ±1 point.
 */
export function yearlyHeatClass(value: number | null, inflation: number | null): string {
    if (value === null) return "text-muted-foreground/40";
    const d = inflation === null ? value : value - inflation;
    if (d > 8) return "bg-emerald-500/80 text-white dark:bg-emerald-600/80";
    if (d > 4) return "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200";
    if (d > 1) return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
    if (d < -8) return "bg-rose-500/80 text-white dark:bg-rose-600/80";
    if (d < -4) return "bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200";
    if (d < -1) return "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300";
    return "bg-muted/60 text-foreground/80";
}

/** Text colour for a signed delta: green up, red down, muted at zero. */
export function deltaClass(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 0.005) return "text-muted-foreground";
    return v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

/** Replaces {placeholders} in a template; missing keys stay visible so a typo is caught in review. */
export function fill(template: string, vars: Record<string, string | number | null | undefined>): string {
    return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === null || vars[k] === undefined ? m : String(vars[k])));
}
