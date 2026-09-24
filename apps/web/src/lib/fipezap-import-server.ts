/**
 * FipeZap import — server side: fetches FIPE's workbook and reads the sheets the app stores.
 *
 * The workbook has ~60 sheets (one per city) and weighs ~5 MB; loading it whole costs ~450 MB of memory.
 * The streaming reader hands over one sheet at a time; a sheet is recognised by its title cell (B1) as
 * soon as its first row arrives, and the ones the caller does not want are drained without being kept.
 */
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { cellText, type SheetCell } from "./fipezap-import";

export const FIPEZAP_WORKBOOK_URL = "https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; Kitnets/1.0; +https://kitnets.com)" };

export interface FipezapFileStamp { etag: string | null; lastModified: string | null }

/** Headers only: tells whether FIPE published a new file without downloading it. */
export async function fetchFipezapStamp(): Promise<FipezapFileStamp> {
    const res = await fetch(FIPEZAP_WORKBOOK_URL, { method: "HEAD", headers: HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error(`FIPE respondeu ${res.status} ao consultar o arquivo`);
    return { etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
}

export async function downloadFipezapWorkbook(): Promise<{ buffer: Buffer; stamp: FipezapFileStamp }> {
    const res = await fetch(FIPEZAP_WORKBOOK_URL, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error(`FIPE respondeu ${res.status} ao baixar o arquivo`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500_000) throw new Error(`Arquivo menor que o esperado (${buffer.length} bytes)`);
    return { buffer, stamp: { etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") } };
}

export interface FipezapSheetGrid {
    /** text of the title cell (B1): "Índice FipeZAP" or the city name */
    title: string;
    /** the sheet's name when exceljs exposes it */
    sheetName: string | null;
    /** 0-based grid, holes filled with empty rows */
    grid: SheetCell[][];
}

/**
 * The sheets `keep` accepts, in file order, as 0-based grids. `keep` is asked once per sheet with the
 * title cell and the sheet name; sheets without a title (Resumo, Aux) or with fewer than ten rows are dropped.
 */
export async function readFipezapGrids(buffer: Buffer, keep: (title: string, sheetName: string | null) => boolean): Promise<FipezapSheetGrid[]> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), { worksheets: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore", entries: "ignore" });
    const out: FipezapSheetGrid[] = [];
    for await (const sheet of reader) {
        const sheetName = String((sheet as unknown as { name?: string }).name ?? "") || null;
        const grid: SheetCell[][] = [];
        let title = "";
        let wanted: boolean | null = null;
        for await (const row of sheet) {
            if (wanted === false) continue;   // drain the sheet without keeping it
            const values = (row.values as SheetCell[]) ?? [];
            const cells = values.slice(1);   // exceljs rows are 1-based with an empty slot 0
            if (wanted === null) {
                title = cellText(cells[1]) || cellText(cells[0]);
                wanted = Boolean(title) && keep(title, sheetName);
                if (!wanted) continue;
            }
            grid[row.number - 1] = cells;
        }
        if (wanted && grid.length > 10) {
            for (let r = 0; r < grid.length; r++) if (!grid[r]) grid[r] = [];
            out.push({ title, sheetName, grid });
        }
    }
    return out;
}
