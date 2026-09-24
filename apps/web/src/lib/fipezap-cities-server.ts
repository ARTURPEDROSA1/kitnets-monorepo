/**
 * Server-side reads for the "FipeZAP por cidade" dashboard.
 *
 * Every read filters `city_slug` and pages in 1000s (PostgREST's cap) or goes through the
 * `vw_fipezap_latest` view, and is cached under the `indices` tag that the cron jobs expire.
 * In development, FIPEZAP_FIXTURE can point to a JSON array of FipezapRecord (see .claude/tmp)
 * so the page can be built before the migration reaches the database.
 */
import { createStaticClient } from "@/utils/supabase/static";
import { cachedRead, getIndexMetadata, getIndexValuesByDateRange } from "@/lib/indexes";
import { FIPEZAP_CITIES, FIPEZAP_NATIONAL_SLUG, fipezapCityBySlug, type FipezapCity } from "@/lib/fipezap-cities";
import type { FipezapDorm, FipezapIndexType, FipezapMetric, FipezapRecord } from "@/lib/fipezap-import";
import { annualiseYield, compound, decemberDates, yearOf } from "@/lib/fipezap-compare";

const PAGE = 1000;

interface RowFilter {
    citySlugs?: string[];
    indexTypes?: FipezapIndexType[];
    metrics?: FipezapMetric[];
    dormitorios?: FipezapDorm | FipezapDorm[];
    from?: string;
    to?: string;
    months?: string[];
}

// ── data access (Supabase, or a local fixture in development) ────────────────

let fixture: FipezapRecord[] | null | undefined;
function loadFixture(): FipezapRecord[] | null {
    if (fixture !== undefined) return fixture;
    fixture = null;
    const path = process.env.FIPEZAP_FIXTURE;
    if (path && process.env.NODE_ENV !== "production") {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            fixture = JSON.parse(require("node:fs").readFileSync(path, "utf8")) as FipezapRecord[];
            console.warn(`[fipezap-cities] using fixture ${path} (${fixture.length} rows)`);
        } catch (err) { console.error("[fipezap-cities] fixture unreadable:", (err as Error).message); }
    }
    return fixture;
}

const matches = (r: FipezapRecord, f: RowFilter) =>
    (!f.citySlugs || f.citySlugs.includes(r.city_slug)) &&
    (!f.indexTypes || f.indexTypes.includes(r.index_type)) &&
    (!f.metrics || f.metrics.includes(r.metric)) &&
    (!f.dormitorios || (Array.isArray(f.dormitorios) ? f.dormitorios.includes(r.dormitorios) : r.dormitorios === f.dormitorios)) &&
    (!f.from || r.reference_date >= f.from) && (!f.to || r.reference_date <= f.to) &&
    (!f.months || f.months.includes(r.reference_date));

async function queryRows(f: RowFilter): Promise<FipezapRecord[]> {
    const fx = loadFixture();
    if (fx) return fx.filter(r => matches(r, f));
    const supabase = createStaticClient();
    const out: FipezapRecord[] = [];
    for (let offset = 0; ; offset += PAGE) {
        let q = supabase.from("fipezap_series").select("city_slug, reference_date, index_type, metric, dormitorios, value");
        if (f.citySlugs) q = q.in("city_slug", f.citySlugs);
        if (f.indexTypes) q = q.in("index_type", f.indexTypes);
        if (f.metrics) q = q.in("metric", f.metrics);
        if (f.dormitorios) q = Array.isArray(f.dormitorios) ? q.in("dormitorios", f.dormitorios) : q.eq("dormitorios", f.dormitorios);
        if (f.from) q = q.gte("reference_date", f.from);
        if (f.to) q = q.lte("reference_date", f.to);
        if (f.months) q = q.in("reference_date", f.months);
        const { data, error } = await q.order("reference_date", { ascending: true }).order("city_slug").order("index_type").order("metric").order("dormitorios").range(offset, offset + PAGE - 1);
        if (error) throw new Error(`fipezap_series: ${error.message}`);
        for (const r of data ?? []) if (r.value !== null) out.push({ ...r, value: Number(r.value) } as FipezapRecord);
        if (!data || data.length < PAGE) break;
    }
    return out;
}

/** Newest month of each (city, type, metric, bucket) series that matches the filter. */
async function latestRows(f: Omit<RowFilter, "from" | "to" | "months">): Promise<FipezapRecord[]> {
    const fx = loadFixture();
    if (fx) {
        const best = new Map<string, FipezapRecord>();
        for (const r of fx) {
            if (!matches(r, f)) continue;
            const k = `${r.city_slug}|${r.index_type}|${r.metric}|${r.dormitorios}`;
            const cur = best.get(k);
            if (!cur || r.reference_date > cur.reference_date) best.set(k, r);
        }
        return [...best.values()];
    }
    let q = createStaticClient().from("vw_fipezap_latest").select("city_slug, reference_date, index_type, metric, dormitorios, value");
    if (f.citySlugs) q = q.in("city_slug", f.citySlugs);
    if (f.indexTypes) q = q.in("index_type", f.indexTypes);
    if (f.metrics) q = q.in("metric", f.metrics);
    if (f.dormitorios) q = Array.isArray(f.dormitorios) ? q.in("dormitorios", f.dormitorios) : q.eq("dormitorios", f.dormitorios);
    const { data, error } = await q.limit(PAGE);
    if (error) throw new Error(`vw_fipezap_latest: ${error.message}`);
    return (data ?? []).filter(r => r.value !== null).map(r => ({ ...r, value: Number(r.value) }) as FipezapRecord);
}

const shift = (month: string, delta: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; };
const key = (r: Pick<FipezapRecord, "index_type" | "metric" | "dormitorios">) => `${r.index_type}|${r.metric}|${r.dormitorios}`;

// ── snapshot: one row per city at its latest month ───────────────────────────

export interface CitySnapshot {
    city: FipezapCity;
    /** newest month this city published for the chosen series */
    month: string;
    varMensal: number | null;
    varMensalPrev: number | null;
    /** compounded monthly variations from January of `month`'s year */
    ytd: number | null;
    var12m: number | null;
    precoM2: number | null;
    /** monthly rental yield in %, and annualised */
    yieldMensal: number | null;
    yieldAnual: number | null;
    /** average of the annualised yield over the last 12 months */
    yield12m: number | null;
}

export interface FipezapSnapshot {
    /** newest month among all cities (the national index publishes it) */
    latest: string;
    national: CitySnapshot | null;
    cities: CitySnapshot[];
}

async function _getSnapshot(indexType: "venda" | "locacao", dormitorios: FipezapDorm): Promise<FipezapSnapshot> {
    const latestPerCity = await latestRows({ indexTypes: [indexType], metrics: ["var_mensal"], dormitorios });
    if (latestPerCity.length === 0) return { latest: "", national: null, cities: [] };
    const latest = latestPerCity.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), "");
    // January of the latest year (year-to-date) minus 12 months (yield average) covers every need
    const from = shift(`${yearOf(latest)}-01-01`, -12);
    const rows = await queryRows({ indexTypes: [indexType, "yield"], metrics: ["var_mensal", "var_12m", "preco_m2", "yield_mensal"], dormitorios, from });
    const byCity = new Map<string, FipezapRecord[]>();
    for (const r of rows) { const list = byCity.get(r.city_slug); if (list) list.push(r); else byCity.set(r.city_slug, [r]); }
    const snapshots: CitySnapshot[] = [];
    for (const l of latestPerCity) {
        const city = fipezapCityBySlug(l.city_slug);
        if (!city) continue;
        const list = byCity.get(l.city_slug) ?? [];
        const month = l.reference_date;
        const at = (m: string, k: string) => list.find(r => r.reference_date === m && key(r) === k)?.value ?? null;
        const kVar = `${indexType}|var_mensal|${dormitorios}`;
        const ytdValues = list.filter(r => key(r) === kVar && r.reference_date >= `${yearOf(month)}-01-01` && r.reference_date <= month).map(r => r.value);
        const yieldMensal = at(month, `yield|yield_mensal|${dormitorios}`);
        const yields12 = list.filter(r => key(r) === `yield|yield_mensal|${dormitorios}` && r.reference_date > shift(month, -12) && r.reference_date <= month).map(r => annualiseYield(r.value) as number);
        snapshots.push({
            city, month,
            varMensal: at(month, kVar),
            varMensalPrev: at(shift(month, -1), kVar),
            ytd: compound(ytdValues),
            var12m: at(month, `${indexType}|var_12m|${dormitorios}`),
            precoM2: at(month, `${indexType}|preco_m2|${dormitorios}`),
            yieldMensal,
            yieldAnual: annualiseYield(yieldMensal),
            yield12m: yields12.length ? yields12.reduce((a, b) => a + b, 0) / yields12.length : null,
        });
    }
    const order = new Map(FIPEZAP_CITIES.map((c, i) => [c.slug, i]));
    snapshots.sort((a, b) => (order.get(a.city.slug) ?? 99) - (order.get(b.city.slug) ?? 99));
    return { latest, national: snapshots.find(s => s.city.slug === FIPEZAP_NATIONAL_SLUG) ?? null, cities: snapshots.filter(s => s.city.slug !== FIPEZAP_NATIONAL_SLUG) };
}

export const getFipezapSnapshot = (indexType: "venda" | "locacao", dormitorios: FipezapDorm) =>
    cachedRead(() => _getSnapshot(indexType, dormitorios), ["fipezap-cities-snapshot", indexType, dormitorios], { latest: "", national: null, cities: [] } as FipezapSnapshot);

// ── history: every month of a few cities ─────────────────────────────────────

export interface HistoryPoint {
    month: string;
    varMensal: number | null;
    var12m: number | null;
    precoM2: number | null;
    indice: number | null;
    yieldMensal: number | null;
    yieldAnual: number | null;
}

async function _getHistory(slugs: string[], indexType: "venda" | "locacao", dormitorios: FipezapDorm): Promise<Record<string, HistoryPoint[]>> {
    const rows = await queryRows({ citySlugs: slugs, indexTypes: [indexType, "yield"], dormitorios });
    const out: Record<string, Map<string, HistoryPoint>> = {};
    for (const r of rows) {
        const months = (out[r.city_slug] ??= new Map());
        const p = months.get(r.reference_date) ?? { month: r.reference_date, varMensal: null, var12m: null, precoM2: null, indice: null, yieldMensal: null, yieldAnual: null };
        if (r.index_type === "yield") { p.yieldMensal = r.value; p.yieldAnual = annualiseYield(r.value); }
        else if (r.metric === "var_mensal") p.varMensal = r.value;
        else if (r.metric === "var_12m") p.var12m = r.value;
        else if (r.metric === "preco_m2") p.precoM2 = r.value;
        else if (r.metric === "indice") p.indice = r.value;
        months.set(r.reference_date, p);
    }
    const result: Record<string, HistoryPoint[]> = {};
    for (const slug of slugs) result[slug] = [...(out[slug]?.values() ?? [])].sort((a, b) => a.month.localeCompare(b.month));
    return result;
}

/** Full stored history (≤ 180 months) of up to a handful of cities, oldest first. */
export const getFipezapHistory = (slugs: string[], indexType: "venda" | "locacao", dormitorios: FipezapDorm) => {
    const sorted = [...new Set(slugs)].sort();
    return cachedRead(() => _getHistory(sorted, indexType, dormitorios), ["fipezap-cities-history", indexType, dormitorios, sorted.join(",")], {} as Record<string, HistoryPoint[]>);
};

// ── yearly table: December-over-December per city ────────────────────────────

export interface YearlyRow { city: FipezapCity; byYear: Record<number, number | null>; latest: { month: string; var12m: number } | null }
export interface FipezapYearly { years: number[]; rows: YearlyRow[] }

async function _getYearly(indexType: "venda" | "locacao", dormitorios: FipezapDorm): Promise<FipezapYearly> {
    const latestPerCity = await latestRows({ indexTypes: [indexType], metrics: ["var_12m"], dormitorios });
    if (latestPerCity.length === 0) return { years: [], rows: [] };
    const latest = latestPerCity.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), "");
    const firstYear = yearOf(latest) - 14;   // the table's 15-year window
    const lastFullYear = latest.endsWith("-12-01") ? yearOf(latest) : yearOf(latest) - 1;
    const years: number[] = []; for (let y = firstYear; y <= lastFullYear; y++) years.push(y);
    const rows = await queryRows({ indexTypes: [indexType], metrics: ["var_12m"], dormitorios, months: decemberDates(firstYear, lastFullYear) });
    const order = new Map(FIPEZAP_CITIES.map((c, i) => [c.slug, i]));
    const result: YearlyRow[] = [];
    for (const l of latestPerCity) {
        const city = fipezapCityBySlug(l.city_slug);
        if (!city) continue;
        const byYear: Record<number, number | null> = {};
        for (const y of years) byYear[y] = rows.find(r => r.city_slug === l.city_slug && r.reference_date === `${y}-12-01`)?.value ?? null;
        result.push({ city, byYear, latest: latest.endsWith("-12-01") ? null : { month: l.reference_date, var12m: l.value } });
    }
    result.sort((a, b) => (order.get(a.city.slug) ?? 99) - (order.get(b.city.slug) ?? 99));
    return { years, rows: result };
}

export const getFipezapYearly = (indexType: "venda" | "locacao", dormitorios: FipezapDorm) =>
    cachedRead(() => _getYearly(indexType, dormitorios), ["fipezap-cities-yearly", indexType, dormitorios], { years: [], rows: [] } as FipezapYearly);

// ── bedroom buckets of one city ──────────────────────────────────────────────

export interface BucketFigures { dorm: FipezapDorm; month: string; varMensal: number | null; ytd: number | null; var12m: number | null; precoM2: number | null; yieldAnual: number | null }

async function _getBuckets(slug: string, indexType: "venda" | "locacao"): Promise<BucketFigures[]> {
    const latest = await latestRows({ citySlugs: [slug], indexTypes: [indexType], metrics: ["var_mensal"] });
    if (latest.length === 0) return [];
    const newest = latest.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), "");
    const rows = await queryRows({ citySlugs: [slug], indexTypes: [indexType, "yield"], metrics: ["var_mensal", "var_12m", "preco_m2", "yield_mensal"], from: `${yearOf(newest)}-01-01` });
    const dorms: FipezapDorm[] = ["total", "1", "2", "3", "4"];
    return dorms.flatMap(dorm => {
        const l = latest.find(r => r.dormitorios === dorm);
        if (!l) return [];
        const month = l.reference_date;
        const at = (k: string) => rows.find(r => r.reference_date === month && key(r) === k)?.value ?? null;
        const ytd = compound(rows.filter(r => key(r) === `${indexType}|var_mensal|${dorm}` && r.reference_date <= month).map(r => r.value));
        return [{ dorm, month, varMensal: l.value, ytd, var12m: at(`${indexType}|var_12m|${dorm}`), precoM2: at(`${indexType}|preco_m2|${dorm}`), yieldAnual: annualiseYield(at(`yield|yield_mensal|${dorm}`)) }];
    });
}

/** Latest figures of every bedroom bucket a city publishes (many cities publish only `total`). */
export const getFipezapBuckets = (slug: string, indexType: "venda" | "locacao") =>
    cachedRead(() => _getBuckets(slug, indexType), ["fipezap-cities-buckets", indexType, slug], [] as BucketFigures[]);

// ── inflation and interest overlays (economic_index_values) ──────────────────

export interface BenchmarkPoint { month: string; varMensal: number; acc12m: number | null; ytd: number | null }

async function _getBenchmark(code: string, from: string): Promise<BenchmarkPoint[]> {
    const meta = await getIndexMetadata(code);
    if (!meta) return [];
    const values = await getIndexValuesByDateRange(meta.id, from);
    return values
        .filter(v => !v.is_projection)
        .map(v => ({ month: `${v.year}-${String(v.month).padStart(2, "0")}-01`, varMensal: Number(v.value_percent), acc12m: v.accumulated_12m, ytd: v.accumulated_year }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

/** IPCA / IGPM / CDI / SELIC monthly series with 12-month and year-to-date accumulations, oldest first. */
export const getBenchmarkSeries = (code: "IPCA" | "IGPM" | "CDI" | "SELIC", from: string) =>
    cachedRead(() => _getBenchmark(code, from), ["fipezap-cities-benchmark", code, from], [] as BenchmarkPoint[]);
