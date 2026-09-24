/**
 * FipeZap import — pure parser for the sheets of FIPE's historical series workbook
 * (https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx): the national sheet
 * ("Índice FipeZAP") and one sheet per city, all with the same layout.
 *
 * Sheet layout (four header rows, then one row per month):
 *   row 1  section   Imóveis residenciais … | Imóveis comerciais …
 *   row 2  type      Venda … | Locação … | (rental yield, rich text) …
 *   row 3  metric    Número-Índice | Var. mensal (%) | Var. em 12 meses (%) | Preço médio (R$/m²) | (% - mensalizada)
 *   row 4  columns   Data | Total | 1D | 2D | 3D | 4D | …
 * Header cells are merged, so each label sits on the first column of its block. Columns are found by
 * those labels, never by position, so FIPE adding or moving a block does not silently shift the data.
 * Rates come as fractions (0.0061 = 0,61 %); "." marks a month without a value. Commercial blocks are ignored.
 *
 * Stored units follow the rows already in `fipezap_series`: rates and yield in % with two decimals,
 * sale price in whole R$/m², rental price with one decimal, the index number with four decimals.
 * Only the last RETENTION_MONTHS months are kept (rolling window, national included).
 */

export type FipezapIndexType = "venda" | "locacao" | "yield";
export type FipezapMetric = "var_mensal" | "var_12m" | "preco_m2" | "yield_mensal" | "indice";
export type FipezapDorm = "total" | "1" | "2" | "3" | "4";

export interface FipezapRecord {
    /** 'brasil' or a city slug (see fipezap-cities.ts) */
    city_slug: string;
    /** first day of the month, `YYYY-MM-01` */
    reference_date: string;
    index_type: FipezapIndexType;
    metric: FipezapMetric;
    dormitorios: FipezapDorm;
    value: number;
}

/** A cell as exceljs hands it over: plain value, Date, rich text or formula result. */
export type SheetCell = string | number | boolean | Date | null | undefined | { richText?: Array<{ text?: string }>; text?: string; result?: unknown };

export const FIPEZAP_NATIONAL_TITLE = "Índice FipeZAP";
/** Rolling window kept in the table: 15 years. When 2027-01 arrives, 2012-01 goes. */
export const RETENTION_MONTHS = 180;
/** A file with fewer recognised city sheets than this is half-downloaded or reshaped: refuse it. */
export const MIN_CITY_SHEETS = 30;
/** How many months a series may trail the newest month of its sheet before it counts as stalled. */
const STALL_MONTHS = 3;

export function cellText(v: SheetCell): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v.richText)) return v.richText.map(p => p.text ?? "").join("").trim();
    if (typeof v.text === "string") return v.text.trim();
    if (v.result !== undefined) return cellText(v.result as SheetCell);
    return "";
}

export function cellNumber(v: SheetCell): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v && typeof v === "object" && !(v instanceof Date) && v.result !== undefined) return cellNumber(v.result as SheetCell);
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t === "" || t === "." || t === "-") return null;
    const n = Number(t.replace("%", "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

/** Month of a date cell (Date, Excel serial or ISO text) as `YYYY-MM-01`; null when it is not a date. */
export function cellMonth(v: SheetCell): string | null {
    let d: Date | null = null;
    if (v instanceof Date) d = v;
    else if (typeof v === "number" && v > 20000 && v < 80000) d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    else if (typeof v === "string" && /^\d{4}-\d{2}(-\d{2})?/.test(v.trim())) return `${v.trim().slice(0, 7)}-01`;
    if (!d || Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const round = (v: number, digits: number) => { const f = Math.pow(10, digits); return Math.round(v * f) / f; };

interface ColumnSpec { col: number; index_type: FipezapIndexType; metric: FipezapMetric; dormitorios: FipezapDorm }

/** Maps the sheet's residential columns from its four header rows. `grid[r][c]` is 0-based. */
export function mapFipezapColumns(grid: SheetCell[][]): { headerRow: number; dateCol: number; columns: ColumnSpec[] } | null {
    let headerRow = -1, dateCol = -1;
    for (let r = 0; r < Math.min(grid.length, 12) && headerRow < 0; r++) {
        const c = (grid[r] ?? []).findIndex(v => cellText(v).toLowerCase() === "data");
        if (c >= 0) { headerRow = r; dateCol = c; }
    }
    if (headerRow < 3) return null;
    const width = Math.max(...grid.slice(headerRow - 3, headerRow + 1).map(r => r?.length ?? 0));
    // merged header cells: carry the last label to the right
    const fill = (row: SheetCell[] | undefined) => { const out: string[] = []; let last = ""; for (let c = 0; c < width; c++) { const t = cellText(row?.[c]); if (t) last = t; out.push(c > dateCol ? last : ""); } return out; };
    const section = fill(grid[headerRow - 3]), type = fill(grid[headerRow - 2]), metric = fill(grid[headerRow - 1]);
    const columns: ColumnSpec[] = [];
    for (let c = dateCol + 1; c < width; c++) {
        if (/comercia/i.test(section[c])) continue;
        const dormText = cellText(grid[headerRow]?.[c]);
        const dorm: FipezapDorm | null = /^total$/i.test(dormText) ? "total" : (/^([1-4])D$/i.exec(dormText)?.[1] as FipezapDorm | undefined) ?? null;
        if (!dorm) continue;
        if (/mensalizada/i.test(metric[c])) { columns.push({ col: c, index_type: "yield", metric: "yield_mensal", dormitorios: dorm }); continue; }
        const indexType: FipezapIndexType | null = /venda/i.test(type[c]) ? "venda" : /loca/i.test(type[c]) ? "locacao" : null;
        const m: FipezapMetric | null = /var\.?\s*mensal/i.test(metric[c]) ? "var_mensal" : /12\s*meses/i.test(metric[c]) ? "var_12m" : /pre[cç]o/i.test(metric[c]) ? "preco_m2" : /n[úu]mero.?[- ]?[íi]ndice/i.test(metric[c]) ? "indice" : null;
        if (indexType && m) columns.push({ col: c, index_type: indexType, metric: m, dormitorios: dorm });
    }
    return { headerRow, dateCol, columns };
}

export interface ParseOptions {
    /** 'brasil' or the city's slug: stamped on every record */
    citySlug: string;
    /** the national sheet must have every block (35 residential columns besides the index numbers); city sheets only the Total columns */
    strict?: boolean;
}

/** Every value of one sheet, oldest month first. Throws when the layout is not recognised. */
export function parseFipezapSheet(grid: SheetCell[][], opts: ParseOptions): FipezapRecord[] {
    const map = mapFipezapColumns(grid);
    if (!map) throw new Error("Cabeçalho não encontrado (linha com “Data”)");
    const rates = map.columns.filter(c => c.metric !== "indice");
    if (opts.strict) {
        // venda + locação: 3 metrics × 5 dormitórios each, plus 5 yield columns
        if (rates.length < 35) throw new Error(`Layout inesperado: ${rates.length} colunas reconhecidas (esperado 35)`);
    } else {
        const has = (t: FipezapIndexType, m: FipezapMetric) => rates.some(c => c.index_type === t && c.metric === m && c.dormitorios === "total");
        if (!has("venda", "var_mensal") || !has("locacao", "var_mensal") || !has("yield", "yield_mensal")) throw new Error(`Layout inesperado: faltam as colunas Total de venda, locação ou rentabilidade (${rates.length} colunas reconhecidas)`);
    }
    const out: FipezapRecord[] = [];
    let started = false;
    for (let r = map.headerRow + 1; r < grid.length; r++) {
        const month = cellMonth(grid[r]?.[map.dateCol]);
        if (!month) { if (started) break; continue; }   // footnotes after the last month
        started = true;
        for (const c of map.columns) {
            const raw = cellNumber(grid[r]?.[c.col]);
            if (raw === null) continue;
            const value = c.metric === "indice" ? round(raw, 4) : c.metric === "preco_m2" ? round(raw, c.index_type === "venda" ? 0 : 1) : round(raw * 100, 2);
            out.push({ city_slug: opts.citySlug, reference_date: month, index_type: c.index_type, metric: c.metric, dormitorios: c.dormitorios, value });
        }
    }
    return out;
}

/** Newest month among the records ("" when there are none). */
export function latestMonth(records: FipezapRecord[]): string {
    return records.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), "");
}

/** First month kept when `latest` is the newest month published: 2026-08 → 2011-09; 2027-01 → 2012-02. */
export function retentionCutoff(latest: string, months = RETENTION_MONTHS): string {
    return shiftMonth(latest, -(months - 1));
}

export function applyRetention(records: FipezapRecord[], cutoff: string): FipezapRecord[] {
    return records.filter(r => r.reference_date >= cutoff);
}

/**
 * Guards against writing a half-read or reshaped sheet. Returns the problems found (empty = fine).
 * Strict (national): at least 5000 values and tight ranges. City sheets get wider ranges: a small
 * market's 4-bedroom rental bucket really does move 20–30 % in a month (Natal, São Luís, Teresina),
 * while a fraction multiplied twice (0.58 → 58) is still caught. Both: not older than the table, and
 * each of the three series (venda, locação, yield) present and at most STALL_MONTHS behind the sheet.
 */
export function validateFipezapRecords(records: FipezapRecord[], dbLatestMonth: string | null, opts: { strict?: boolean } = {}): string[] {
    const problems: string[] = [];
    if (records.length === 0) return ["nenhum valor lido"];
    if (opts.strict && records.length < 5000) problems.push(`poucos valores lidos (${records.length})`);
    const latest = latestMonth(records);
    if (dbLatestMonth && latest < dbLatestMonth) problems.push(`arquivo termina em ${latest}, antes do banco (${dbLatestMonth})`);
    const maxMonthly = opts.strict ? 15 : 50, max12m = opts.strict ? 80 : 150;
    const wild = records.find(r => (r.metric === "var_mensal" && Math.abs(r.value) > maxMonthly) || (r.metric === "var_12m" && Math.abs(r.value) > max12m) || (r.metric === "yield_mensal" && (r.value <= 0 || r.value > 3)) || ((r.metric === "preco_m2" || r.metric === "indice") && r.value <= 0));
    if (wild) problems.push(`valor fora da faixa: ${wild.reference_date} ${wild.index_type}/${wild.metric}/${wild.dormitorios} = ${wild.value}`);
    // FIPE releases sale and rental figures on different days, so a series may trail the newest month a little
    for (const t of ["venda", "locacao", "yield"] as const) {
        const last = records.reduce((a, r) => (r.index_type === t && r.reference_date > a ? r.reference_date : a), "");
        if (!last || (latest && last < shiftMonth(latest, -STALL_MONTHS))) problems.push(`série ${t} parada em ${last || "nenhum mês"}`);
    }
    return problems;
}

export interface WorkbookValidation {
    /** the run must stop */
    fatal: string[];
    /** cities left out of this run, with the reason */
    skipped: Map<string, string[]>;
    /** slugs that passed, national first */
    accepted: string[];
}

/**
 * Validates a whole file: the national sheet (`nationalSlug`) is mandatory and its problems are fatal;
 * an expected city that is missing or fails validation is skipped and reported; fewer than `minCities`
 * accepted cities is fatal (a half-downloaded or reshaped file). `dbLatestBySlug` holds the newest
 * month already stored per slug.
 */
export function validateFipezapWorkbook(
    parsed: Map<string, FipezapRecord[]>,
    dbLatestBySlug: Map<string, string | null>,
    expected: { nationalSlug: string; citySlugs: string[]; minCities: number },
): WorkbookValidation {
    const fatal: string[] = [];
    const skipped = new Map<string, string[]>();
    const accepted: string[] = [];
    const national = parsed.get(expected.nationalSlug);
    if (!national) fatal.push("planilha nacional não encontrada no arquivo");
    else {
        const problems = validateFipezapRecords(national, dbLatestBySlug.get(expected.nationalSlug) ?? null, { strict: true });
        if (problems.length) fatal.push(...problems.map(p => `nacional: ${p}`));
        else accepted.push(expected.nationalSlug);
    }
    for (const slug of expected.citySlugs) {
        const records = parsed.get(slug);
        if (!records) { skipped.set(slug, ["planilha não encontrada no arquivo"]); continue; }
        const problems = validateFipezapRecords(records, dbLatestBySlug.get(slug) ?? null);
        if (problems.length) skipped.set(slug, problems);
        else accepted.push(slug);
    }
    const cities = accepted.filter(s => s !== expected.nationalSlug).length;
    if (cities < expected.minCities) fatal.push(`só ${cities} cidades reconhecidas (mínimo ${expected.minCities})`);
    return { fatal, skipped, accepted };
}

/** `YYYY-MM-01` shifted by whole months. */
export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
