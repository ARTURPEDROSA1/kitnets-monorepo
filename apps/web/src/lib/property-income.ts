/**
 * Property income ledger — pure helpers shared by the API route, the UI
 * and (later) bank-statement integrations.
 *
 * Money model (what the bank shows is what we store):
 *   received_amount  total credited to the owner for the month
 *   energy_portion   part of it that pays for energy (solar cost centre)
 *   other_income     part of it that is not rent (parking, late fee…)
 *   agency_fee_pct   % the agency kept before crediting the owner
 *
 * Derived:
 *   net_rent   = received − energy − other
 *   gross_rent = net_rent ÷ (1 − pct/100)
 *   fee        = gross_rent − net_rent
 */

export type IncomeStatus = "EXPECTED" | "CONFIRMED";
export type IncomeSource = "MANUAL" | "IMPORT" | "BANK";

export const INCOME_STATUSES: IncomeStatus[] = ["EXPECTED", "CONFIRMED"];
export const INCOME_SOURCES: IncomeSource[] = ["MANUAL", "IMPORT", "BANK"];

/** Row as stored / returned by the API. `month` is ISO `YYYY-MM-DD` (first day). */
export interface PropertyIncomeRow {
    id: string;
    property_id: string;
    month: string;
    received_on: string | null;
    received_amount: number;
    energy_portion: number;
    other_income: number;
    agency_fee_pct: number;
    status: IncomeStatus;
    source: IncomeSource;
    bank_reference: string | null;
    notes: string | null;
    created_at?: string;
    updated_at?: string;
}

/** Partial row sent to PUT. Only the fields present are overwritten. `month` is `YYYY-MM`. */
export interface IncomeRowInput {
    month: string;
    received_amount?: number;
    /**
     * Not stored. When present and `received_amount` is absent, the server
     * derives `received_amount` from it using the (merged) fee, energy and
     * other values: received = gross × (1 − pct/100) + energy + other.
     * When both are sent, `received_amount` wins.
     */
    gross_rent?: number;
    energy_portion?: number;
    other_income?: number;
    agency_fee_pct?: number;
    status?: IncomeStatus;
    source?: IncomeSource;
    received_on?: string | null;
    bank_reference?: string | null;
    notes?: string | null;
}

export interface IncomeBreakdown {
    received: number;
    energy: number;
    other: number;
    netRent: number;
    grossRent: number;
    feeAmount: number;
    feePct: number;
}

export const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clampPct(pct: number): number {
    if (!Number.isFinite(pct) || pct < 0) return 0;
    return Math.min(pct, 99.99);
}

export function breakdown(
    row: Pick<PropertyIncomeRow, "received_amount" | "energy_portion" | "other_income" | "agency_fee_pct">
): IncomeBreakdown {
    const received = Number(row.received_amount) || 0;
    const energy = Number(row.energy_portion) || 0;
    const other = Number(row.other_income) || 0;
    const feePct = clampPct(Number(row.agency_fee_pct) || 0);
    const netRent = round2(received - energy - other);
    const grossRent = feePct > 0 ? round2(netRent / (1 - feePct / 100)) : netRent;
    return {
        received,
        energy,
        other,
        netRent,
        grossRent,
        feeAmount: round2(grossRent - netRent),
        feePct,
    };
}

/** Inverse of `breakdown`: what lands in the account for a given gross rent. */
export function receivedFromGross(grossRent: number, feePct: number, energy: number, other: number): number {
    const pct = clampPct(feePct);
    return round2((Number(grossRent) || 0) * (1 - pct / 100) + (Number(energy) || 0) + (Number(other) || 0));
}

/** `2026-09-01` or `2026-09` → `2026-09` */
export function monthKey(dateOrMonth: string): string {
    return dateOrMonth.slice(0, 7);
}

/** `2026-09` → `set/2026` */
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function formatMonthKey(key: string): string {
    const [y, m] = key.split("-");
    const idx = parseInt(m, 10) - 1;
    return MONTH_SHORT[idx] ? `${MONTH_SHORT[idx]}/${y}` : key;
}

export function currentMonthKey(now = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Spreadsheet import (TSV / CSV pasted or uploaded from Excel / Google Sheets)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parses "R$ 3,950.00", "-R$ 199,479.26", " R$  350.00 ", "3.950,00",
 * "1234.56", "(1.234,56)". Returns null for blank / dash-only cells
 * ("R$  -  ", "-", "").
 */
export function parseMoney(raw: string | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim();
    if (!s) return null;
    const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-\s*R?\$/.test(s);
    s = s.replace(/[R$()%\s]/gi, "").replace(/^-/, "");
    if (!s || /^-+$/.test(s)) return null;
    if (!/^[\d.,-]+$/.test(s)) return null;
    s = s.replace(/-/g, "");

    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    let normalized: string;
    if (lastComma >= 0 && lastDot >= 0) {
        // Both present: the later one is the decimal separator.
        normalized = lastComma > lastDot
            ? s.replace(/\./g, "").replace(",", ".")
            : s.replace(/,/g, "");
    } else if (lastComma >= 0) {
        const after = s.length - lastComma - 1;
        const commas = (s.match(/,/g) || []).length;
        normalized = commas === 1 && after !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
    } else if (lastDot >= 0) {
        const after = s.length - lastDot - 1;
        const dots = (s.match(/\./g) || []).length;
        normalized = dots === 1 && after !== 3 ? s : s.replace(/\./g, "");
    } else {
        normalized = s;
    }
    const n = parseFloat(normalized);
    if (!Number.isFinite(n)) return null;
    return round2(negative ? -n : n);
}

/** dd/mm/yyyy · yyyy-mm-dd · mm/yyyy · yyyy-mm → `YYYY-MM` (or null). */
export function parseMonthCell(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
        const month = parseInt(m[2], 10);
        if (month >= 1 && month <= 12) return `${m[3]}-${String(month).padStart(2, "0")}`;
        return null;
    }
    m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (m) {
        const month = parseInt(m[2], 10);
        if (month >= 1 && month <= 12) return `${m[1]}-${m[2]}`;
        return null;
    }
    m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
    if (m) {
        const month = parseInt(m[1], 10);
        if (month >= 1 && month <= 12) return `${m[2]}-${String(month).padStart(2, "0")}`;
    }
    return null;
}

/** Full date (dd/mm/yyyy or ISO) → `YYYY-MM-DD`, else null. */
export function parseDateCell(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
            return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
        return null;
    }
    m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

export interface ParsedSheet {
    delimiter: string;
    headers: string[];
    dateColumn: number;         // -1 when none detected
    rows: Array<{ line: number; cells: string[]; month: string | null; date: string | null }>;
}

function detectDelimiter(lines: string[]): string {
    const sample = lines.slice(0, 5).join("\n");
    const count = (ch: string) => (sample.split(ch).length - 1);
    if (count("\t") > 0) return "\t";
    return count(";") > count(",") ? ";" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
    if (delimiter === "\t") return line.split("\t").map(c => c.trim());
    // Minimal CSV splitter with quotes support
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
            out.push(cur.trim());
            cur = "";
        } else {
            cur += ch;
        }
    }
    out.push(cur.trim());
    return out;
}

export function parseSheet(text: string): ParsedSheet {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { delimiter: "\t", headers: [], dateColumn: -1, rows: [] };

    const delimiter = detectDelimiter(lines);
    const headers = splitLine(lines[0], delimiter);
    const body = lines.slice(1).map((line, i) => ({ line: i + 2, cells: splitLine(line, delimiter) }));

    // Date column: by header name first, then by content.
    let dateColumn = headers.findIndex(h => /^(data|date|m[eê]s|month|compet[eê]ncia)$/i.test(h.trim()));
    if (dateColumn < 0) {
        const width = Math.max(headers.length, ...body.map(r => r.cells.length));
        let best = -1;
        let bestHits = 0;
        for (let c = 0; c < width; c++) {
            const hits = body.reduce((acc, r) => acc + (parseMonthCell(r.cells[c]) ? 1 : 0), 0);
            if (hits > bestHits) { bestHits = hits; best = c; }
        }
        if (bestHits >= Math.max(1, Math.floor(body.length / 2))) dateColumn = best;
    }

    const rows = body.map(r => ({
        ...r,
        month: dateColumn >= 0 ? parseMonthCell(r.cells[dateColumn]) : null,
        date: dateColumn >= 0 ? parseDateCell(r.cells[dateColumn]) : null,
    }));

    return { delimiter, headers, dateColumn, rows };
}

export type IncomeField = "gross" | "fee_pct" | "received" | "energy" | "other" | "notes" | "ignore";

export const INCOME_FIELD_LABELS: Record<IncomeField, string> = {
    gross: "Aluguel bruto (contrato)",
    fee_pct: "Taxa da imobiliária (%)",
    received: "Valor recebido (líquido da imobiliária)",
    energy: "Parcela de energia",
    other: "Outras despesas",
    notes: "Observações",
    ignore: "Ignorar",
};

/**
 * Best-effort column → field suggestion from header names. Tuned for the
 * owner's spreadsheets ("Renda Aluguel" = received, "Renda Aluguel 1" =
 * energy charged to the tenant) but generic enough for bank exports.
 */
export function suggestMapping(headers: string[], dateColumn: number): IncomeField[] {
    return headers.map((raw, idx) => {
        if (idx === dateColumn) return "ignore";
        const h = raw.trim().toLowerCase();
        if (!h) return "ignore";
        if (/coment|observa|obs\b|notes?$|descri/.test(h)) return "notes";
        if (/acc|acum|saldo|investimento|total|custo|admin|prestac|amortiza|iptu|utilidade/.test(h)) return "ignore";
        if (/taxa|comiss|fee|%/.test(h)) return "fee_pct";
        if (/tarifa/.test(h)) return "ignore";
        if (/energia|energy|solar/.test(h)) return "energy";
        if (/^renda aluguel 1$/.test(h)) return "energy";
        if (/^renda aluguel 2$/.test(h)) return "ignore";
        if (/bruto|gross|contrat/.test(h)) return "gross";
        if (/l[ií]quido|\bnet\b/.test(h)) return "ignore";   // derived column, never imported
        if (/recebid|cr[eé]dito/.test(h)) return "received";
        if (/renda aluguel|aluguel|rent|receita/.test(h)) return "received";
        if (/outr|other/.test(h)) return "other";
        return "ignore";
    });
}

export interface BuildImportOptions {
    agencyFeePct: number;
    /** Months after this one are marked EXPECTED. Defaults to the current month. */
    todayMonth?: string;
}

export interface ImportPreviewRow extends IncomeRowInput {
    line: number;
}

/**
 * Turns a parsed sheet + column mapping into PUT rows. Rows whose mapped
 * money cells are all blank are skipped; an explicit "0,00" is kept
 * (vacancy). Duplicate months keep the row with more filled cells.
 */
export function buildImportRows(sheet: ParsedSheet, mapping: IncomeField[], opts: BuildImportOptions): ImportPreviewRow[] {
    const today = opts.todayMonth ?? currentMonthKey();
    const byMonth = new Map<string, { row: ImportPreviewRow; filled: number }>();

    for (const r of sheet.rows) {
        if (!r.month) continue;
        const row: ImportPreviewRow = {
            line: r.line,
            month: r.month,
            agency_fee_pct: opts.agencyFeePct,
            source: "IMPORT",
            status: r.month > today ? "EXPECTED" : "CONFIRMED",
        };
        if (r.date) row.received_on = r.date;
        let filled = 0;
        mapping.forEach((field, idx) => {
            const cell = r.cells[idx];
            if (field === "ignore" || cell === undefined) return;
            if (field === "notes") {
                const t = cell.trim();
                if (t) row.notes = t.slice(0, 500);
                return;
            }
            const value = parseMoney(cell);
            if (value === null) return;
            const abs = Math.max(0, value);
            if (field === "fee_pct") {
                // "10", "10%", "0,10" (fraction) → 10
                const pct = abs > 0 && abs < 1 ? round2(abs * 100) : abs;
                if (pct < 100) row.agency_fee_pct = pct;
                return;
            }
            filled++;
            if (field === "gross") row.gross_rent = abs;
            else if (field === "received") row.received_amount = abs;
            else if (field === "energy") row.energy_portion = abs;
            else if (field === "other") row.other_income = abs;
        });
        if (filled === 0) continue;
        const existing = byMonth.get(r.month);
        if (!existing || filled > existing.filled) byMonth.set(r.month, { row, filled });
    }

    return Array.from(byMonth.values())
        .map(v => v.row)
        .sort((a, b) => (a.month < b.month ? -1 : 1));
}

// ───────────────────────────────────────────────────────────────────────────
// Aggregations used by the dashboard
// ───────────────────────────────────────────────────────────────────────────

export interface IncomeSummary {
    latest: (PropertyIncomeRow & IncomeBreakdown) | null;   // latest CONFIRMED month
    confirmedMonths: number;
    expectedMonths: number;
    totalReceived: number;          // confirmed, all time
    totalNetRent: number;           // confirmed, all time
    totalEnergy: number;            // confirmed, all time
    netRent12m: number;             // last 12 confirmed months
    energy12m: number;
    received12m: number;
    firstMonth: string | null;
    lastMonth: string | null;
}

export function summarize(rows: PropertyIncomeRow[]): IncomeSummary {
    const confirmed = rows
        .filter(r => r.status === "CONFIRMED")
        .sort((a, b) => (a.month < b.month ? -1 : 1));
    const expected = rows.filter(r => r.status === "EXPECTED");
    const last12 = confirmed.slice(-12);
    const sum = (list: PropertyIncomeRow[], pick: (b: IncomeBreakdown) => number) =>
        round2(list.reduce((acc, r) => acc + pick(breakdown(r)), 0));

    const latestRow = confirmed.length ? confirmed[confirmed.length - 1] : null;
    return {
        latest: latestRow ? { ...latestRow, ...breakdown(latestRow) } : null,
        confirmedMonths: confirmed.length,
        expectedMonths: expected.length,
        totalReceived: sum(confirmed, b => b.received),
        totalNetRent: sum(confirmed, b => b.netRent),
        totalEnergy: sum(confirmed, b => b.energy),
        netRent12m: sum(last12, b => b.netRent),
        energy12m: sum(last12, b => b.energy),
        received12m: sum(last12, b => b.received),
        firstMonth: confirmed.length ? monthKey(confirmed[0].month) : null,
        lastMonth: latestRow ? monthKey(latestRow.month) : null,
    };
}
