/**
 * FipeZap import — pure parser for the national sheet ("Índice FipeZAP") of FIPE's historical
 * series workbook (https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx).
 *
 * Sheet layout (four header rows, then one row per month):
 *   row 1  section   Imóveis residenciais … | Imóveis comerciais …
 *   row 2  type      Venda … | Locação … | (rental yield, rich text) …
 *   row 3  metric    Número-Índice | Var. mensal (%) | Var. em 12 meses (%) | Preço médio (R$/m²) | (% - mensalizada)
 *   row 4  columns   Data | Total | 1D | 2D | 3D | 4D | …
 * Header cells are merged, so each label sits on the first column of its block. Columns are found by
 * those labels, never by position, so FIPE adding or moving a block does not silently shift the data.
 * Rates come as fractions (0.0061 = 0,61 %); "." marks a month without a value.
 *
 * Stored units follow the rows already in `fipezap_series`: rates and yield in % with two decimals,
 * sale price in whole R$/m², rental price with one decimal.
 */

export type FipezapIndexType = "venda" | "locacao" | "yield";
export type FipezapMetric = "var_mensal" | "var_12m" | "preco_m2" | "yield_mensal";
export type FipezapDorm = "total" | "1" | "2" | "3" | "4";

export interface FipezapRecord {
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

/** Maps the sheet's columns from its four header rows. `grid[r][c]` is 0-based. */
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
        const m: FipezapMetric | null = /var\.?\s*mensal/i.test(metric[c]) ? "var_mensal" : /12\s*meses/i.test(metric[c]) ? "var_12m" : /pre[cç]o/i.test(metric[c]) ? "preco_m2" : null;
        if (indexType && m) columns.push({ col: c, index_type: indexType, metric: m, dormitorios: dorm });
    }
    return { headerRow, dateCol, columns };
}

/** Every value of the national sheet, oldest month first. Throws when the layout is not recognised. */
export function parseFipezapSheet(grid: SheetCell[][]): FipezapRecord[] {
    const map = mapFipezapColumns(grid);
    if (!map) throw new Error("Cabeçalho não encontrado (linha com “Data”)");
    // venda + locação: 3 metrics × 5 dormitórios each, plus 5 yield columns
    if (map.columns.length < 35) throw new Error(`Layout inesperado: ${map.columns.length} colunas reconhecidas (esperado 35)`);
    const out: FipezapRecord[] = [];
    let started = false;
    for (let r = map.headerRow + 1; r < grid.length; r++) {
        const month = cellMonth(grid[r]?.[map.dateCol]);
        if (!month) { if (started) break; continue; }   // footnotes after the last month
        started = true;
        for (const c of map.columns) {
            const raw = cellNumber(grid[r]?.[c.col]);
            if (raw === null) continue;
            const value = c.metric === "preco_m2" ? round(raw, c.index_type === "venda" ? 0 : 1) : round(raw * 100, 2);
            out.push({ reference_date: month, index_type: c.index_type, metric: c.metric, dormitorios: c.dormitorios, value });
        }
    }
    return out;
}

/** Guards against writing a half-read or reshaped file. Returns the problems found (empty = fine). */
export function validateFipezapRecords(records: FipezapRecord[], dbLatestMonth: string | null): string[] {
    const problems: string[] = [];
    if (records.length < 5000) problems.push(`poucos valores lidos (${records.length})`);
    const latest = records.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), "");
    if (dbLatestMonth && latest < dbLatestMonth) problems.push(`arquivo termina em ${latest}, antes do banco (${dbLatestMonth})`);
    const wild = records.find(r => (r.metric === "var_mensal" && Math.abs(r.value) > 15) || (r.metric === "var_12m" && Math.abs(r.value) > 80) || (r.metric === "yield_mensal" && (r.value <= 0 || r.value > 3)) || (r.metric === "preco_m2" && r.value <= 0));
    if (wild) problems.push(`valor fora da faixa: ${wild.reference_date} ${wild.index_type}/${wild.metric}/${wild.dormitorios} = ${wild.value}`);
    // FIPE releases sale and rental figures on different days, so a series may trail the newest month a little
    for (const t of ["venda", "locacao", "yield"] as const) {
        const last = records.reduce((a, r) => (r.index_type === t && r.reference_date > a ? r.reference_date : a), "");
        if (!last || (latest && last < shiftMonth(latest, -3))) problems.push(`série ${t} parada em ${last || "nenhum mês"}`);
    }
    return problems;
}

/** `YYYY-MM-01` shifted by whole months. */
export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
