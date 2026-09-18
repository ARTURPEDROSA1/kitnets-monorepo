/**
 * FipeZap import — server side: fetches FIPE's workbook and reads only its national sheet.
 *
 * The workbook has ~60 sheets (one per city) and weighs ~5 MB; loading it whole costs ~450 MB of memory.
 * The streaming reader hands over one sheet at a time, so the function keeps only the national sheet's
 * ~230 rows and stops as soon as it has them.
 */
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { cellText, FIPEZAP_NATIONAL_TITLE, type SheetCell } from "./fipezap-import";

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

/** The national sheet as a 0-based grid. The sheet is recognised by its name or by its title cell (B1). */
export async function readFipezapNationalGrid(buffer: Buffer): Promise<SheetCell[][]> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), { worksheets: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore", entries: "ignore" });
    for await (const sheet of reader) {
        const name = String((sheet as unknown as { name?: string }).name ?? "");
        const grid: SheetCell[][] = [];
        let national: boolean | null = name ? name.trim() === FIPEZAP_NATIONAL_TITLE : null;
        for await (const row of sheet) {
            if (national === false) continue;   // drain the sheet without keeping it
            const values = (row.values as SheetCell[]) ?? [];
            grid[row.number - 1] = values.slice(1);   // exceljs rows are 1-based with an empty slot 0
            if (national === null && row.number >= 1) national = values.some(v => cellText(v) === FIPEZAP_NATIONAL_TITLE);
        }
        if (national && grid.length > 10) {
            for (let r = 0; r < grid.length; r++) if (!grid[r]) grid[r] = [];
            return grid;
        }
    }
    throw new Error(`Planilha “${FIPEZAP_NATIONAL_TITLE}” não encontrada no arquivo da FIPE`);
}
