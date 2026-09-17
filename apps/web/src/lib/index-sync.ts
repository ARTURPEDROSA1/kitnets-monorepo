/**
 * Index sync — pure helpers for the daily jobs that keep `/indices` current.
 *
 *   CDI (SGS 4391), Selic (SGS 4390), salário mínimo (SGS 1619)  → Banco Central's public API
 *   IVAR                                                          → brasilindicadores.com.br (FGV has no public API)
 *
 * Rules shared by every job:
 *   • only months that have ended are stored (the Banco Central publishes the running month as a partial figure);
 *   • a stored value is rewritten only when the source differs beyond rounding, so hand-loaded values with more
 *     decimals are kept while wrong ones are corrected;
 *   • nothing is ever written for a future month.
 */

export interface MonthPoint { month: string; value: number }            // month = `YYYY-MM`
export interface IvarPoint { month: string; monthly: number; acc12m: number | null }

export const BCB_SERIES = { CDI: 4391, SELIC: 4390, MINIMUM_WAGE: 1619 } as const;
/** Date-range query (the API's "últimos N" form is capped at 20 points). */
export function bcbSeriesUrl(series: number, monthsBack: number, now = new Date()): string {
    const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
    return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=${br(start)}&dataFinal=${br(now)}`;
}
export const IVAR_SOURCE_URL = "https://brasilindicadores.com.br/ivar";

/** Current month in Brasília time, `YYYY-MM`. */
export function currentMonthBRT(now = new Date()): string {
    return new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 7);
}

/** Banco Central SGS payload (`[{ data: "01/08/2026", valor: "1.09" }]`) → month points, oldest first. */
export function parseBcbSeries(json: unknown): MonthPoint[] {
    if (!Array.isArray(json)) throw new Error("Resposta do Banco Central fora do formato esperado");
    const out = new Map<string, number>();
    for (const row of json as Array<{ data?: unknown; valor?: unknown }>) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(row?.data ?? ""));
        const value = Number(String(row?.valor ?? "").replace(",", "."));
        if (!m || !Number.isFinite(value)) continue;
        out.set(`${m[3]}-${m[2]}`, value);
    }
    return [...out.entries()].map(([month, value]) => ({ month, value })).sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** Months that have already ended. */
export function completedMonths<T extends { month: string }>(points: T[], nowMonth: string): T[] {
    return points.filter(p => p.month < nowMonth);
}

export interface WritePlan<T> { inserts: T[]; updates: T[]; unchanged: number }

/**
 * What to write: months missing from the table, and months whose stored value differs from the source by more
 * than `tolerance` (0.006 keeps a stored 1.0527 against the source's rounded 1.05, and fixes a stored 1 against 1.05).
 */
export function planWrites<T extends { month: string }>(points: T[], stored: Map<string, T>, differs: (source: T, current: T) => boolean): WritePlan<T> {
    const plan: WritePlan<T> = { inserts: [], updates: [], unchanged: 0 };
    for (const p of points) {
        const cur = stored.get(p.month);
        if (!cur) plan.inserts.push(p);
        else if (differs(p, cur)) plan.updates.push(p);
        else plan.unchanged++;
    }
    return plan;
}

export const RATE_TOLERANCE = 0.006;
export const rateDiffers = (a: MonthPoint, b: MonthPoint) => Math.abs(a.value - b.value) > RATE_TOLERANCE;
export const ivarDiffers = (a: IvarPoint, b: IvarPoint) => Math.abs(a.monthly - b.monthly) > 0.004 || (a.acc12m !== null && (b.acc12m === null || Math.abs(a.acc12m - b.acc12m) > 0.004));

/** Sanity bounds for a monthly interest rate (CDI / Selic), in % a month. */
export function validateRates(points: MonthPoint[], label: string): string[] {
    const bad = points.find(p => !(p.value > 0 && p.value < 5));
    return bad ? [`${label}: valor fora da faixa em ${bad.month} (${bad.value})`] : [];
}

export interface MinimumWageRow { reference_date: string; amount_brl: number; variation_percent: number | null }

/**
 * New minimum-wage rows: months where the amount changes, after the latest row already stored.
 * The series is monthly and flat between decrees, so a change month is the month the new wage took effect.
 */
export function minimumWageChanges(points: MonthPoint[], latest: { reference_date: string; amount_brl: number } | null, nowMonth: string): MinimumWageRow[] {
    const out: MinimumWageRow[] = [];
    let prevAmount = latest ? Number(latest.amount_brl) : null;
    const after = latest ? latest.reference_date.slice(0, 7) : "";
    for (const p of points) {
        if (p.month > nowMonth) continue;                    // never a future month
        if (p.month <= after) continue;                      // already covered by the table
        if (!(p.value > 0)) continue;
        if (prevAmount !== null && Math.abs(p.value - prevAmount) < 0.005) continue;
        if (prevAmount === null) { prevAmount = p.value; continue; }   // empty table: nothing to compare the first point with
        out.push({ reference_date: `${p.month}-01`, amount_brl: p.value, variation_percent: Math.round((p.value / prevAmount - 1) * 10000) / 100 });
        prevAmount = p.value;
    }
    return out;
}

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/\s+/g, " ").trim();
const pctValue = (s: string): number | null => { const m = /(-?\d+(?:[.,]\d+)?)\s*%/.exec(s); if (!m) return null; const n = Number(m[1].replace(",", ".")); return Number.isFinite(n) ? n : null; };

/**
 * IVAR tables from the source page. Each year has its own heading ("IVAR 2026") followed by a table whose rows are
 * month name · monthly % · 12-month % · year-to-date %. The year comes from the heading, never from nearby text.
 */
export function parseIvarTables(html: string): IvarPoint[] {
    const out = new Map<string, IvarPoint>();
    const heading = /<h[1-4][^>]*>\s*IVAR\s+(\d{4})\s*<\/h[1-4]>/gi;
    let h: RegExpExecArray | null;
    while ((h = heading.exec(html)) !== null) {
        const year = Number(h[1]);
        const rest = html.slice(h.index + h[0].length);
        const nextHeading = rest.search(/<h[1-4][^>]*>/i);
        const section = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
        const table = /<table[\s\S]*?<\/table>/i.exec(section)?.[0];
        if (!table) continue;
        for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
            const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(stripTags);
            if (cells.length < 2) continue;
            const monthIdx = MONTHS_PT.indexOf(cells[0].toLowerCase());
            const monthly = pctValue(cells[1]);
            if (monthIdx < 0 || monthly === null) continue;
            const month = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
            out.set(month, { month, monthly, acc12m: cells[2] !== undefined ? pctValue(cells[2]) : null });
        }
    }
    return [...out.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** Refuses a page that reads wrong: no data, a month that has not ended, a gap after the stored series, wild values. */
export function validateIvar(points: IvarPoint[], nowMonth: string, latestStoredMonth: string | null): string[] {
    const problems: string[] = [];
    if (points.length < 6) problems.push(`poucos meses lidos (${points.length})`);
    const future = points.find(p => p.month >= nowMonth);
    if (future) problems.push(`mês que ainda não terminou na fonte: ${future.month}`);
    const wild = points.find(p => Math.abs(p.monthly) > 10 || (p.acc12m !== null && Math.abs(p.acc12m) > 60));
    if (wild) problems.push(`valor fora da faixa em ${wild.month} (${wild.monthly})`);
    if (latestStoredMonth && points.length > 0 && points[0].month > nextMonth(latestStoredMonth)) problems.push(`a fonte começa em ${points[0].month}, depois do último mês gravado (${latestStoredMonth}): ficaria um buraco`);
    for (let i = 1; i < points.length; i++) if (points[i].month !== nextMonth(points[i - 1].month)) { problems.push(`meses fora de sequência: ${points[i - 1].month} → ${points[i].month}`); break; }
    return problems;
}

export function nextMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
