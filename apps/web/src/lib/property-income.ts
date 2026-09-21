/**
 * Property income ledger — pure helpers shared by the API route, the UI
 * and (later) bank-statement integrations.
 *
 * Money model (what the bank shows is what we store):
 *   received_amount  total credited to the owner for the month
 *   energy_portion   part of it that pays for energy (solar cost centre)
 *   other_income     ENERGY COST: the electricity bill the owner pays for the
 *                    month, outside the agency transfer (column keeps its
 *                    historical name; it is a cost, stored ≥ 0)
 *   other_expenses   OTHER EXPENSES the owner pays for the month (repairs,
 *                    fees…), also outside the transfer (cost, ≥ 0)
 *   condo_amount     CONDOMINIUM due by the unit for the month (≥ 0). An expense of the property: it is due
 *                    even when the unit is vacant (it will be the revenue of the condominium cost centre).
 *                    While the unit is rented the tenant pays it: the agency collects rent + condominium in
 *                    one payment and forwards both in the same deposit, so it is part of `received_amount`.
 *   fee_on_condo     the agency charges its % on rent + condominium (true) or on the rent only (false, the
 *                    condominium is forwarded in full). Depends on the landlord's agreement with the agency.
 *   iptu_amount      legacy column, no longer used: IPTU comes from the taxes
 *                    register (Tributos do imóvel) in the month it was paid
 *   unit_id          sub-unit of a multi-unit property the row belongs to (NULL =
 *                    the whole property); a month can hold one row per unit
 *   agency_fee_pct   % the agency kept before crediting the owner
 *
 * Derived:
 *   condo_in   = the condominium inside the deposit: condominium × (1 − pct/100) when the fee applies to it,
 *                else the condominium in full; never more than received − energy (a vacant unit, with nothing
 *                received, has no tenant paying it)
 *   condo_paid = what the tenant paid as condominium = condo_in ÷ (1 − pct/100) when the fee applies, else condo_in
 *   net_rent   = received − energy − condo_in     (rent after the agency fee)
 *   gross_rent = net_rent ÷ (1 − pct/100)         (contract value)
 *   fee        = (gross_rent − net_rent) + (condo_paid − condo_in)   (everything the agency kept)
 *   revenue    = gross_rent + energy + condo_paid (everything the tenant pays)
 *   opex       = fee + energy cost + other expenses + condominium   (IPTU is added per month from the taxes register)
 *   noi        = revenue − opex = received − energy cost − other expenses − condominium
 *
 * Everything outside the ledger table (DRE, payback, yield, rent history) works on one figure per month:
 * `aggregateIncomeByMonth` adds a month's unit rows into one row.
 *
 * Costs never change received / net / gross rent — they are paid separately,
 * so they only lower NOI through OPEX.
 *
 * Example: gross 4.000, fee 10 %, energy 350, energy cost 109,80, other 50 →
 * received 3.950, net 3.600, fee 400, revenue 4.350, opex 559,80, noi 3.790,20.
 * With a condominium of 250, paid by the tenant: fee on the rent only → received 4.200, fee 400, noi 3.790,20
 * (the condominium comes in and goes out); fee on rent + condominium → received 4.175, fee 425, noi 3.765,20.
 * The same unit vacant: received 0, noi −250.
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
    /** energy cost (historical column name) */
    other_income: number;
    other_expenses: number;
    /** condominium due by the unit for the month (expense, ≥ 0); paid by the tenant inside the deposit while the unit is rented */
    condo_amount?: number;
    /** the agency's % applies to rent + condominium (true) or to the rent only (false) */
    fee_on_condo?: boolean;
    /**
     * Only on rows built by `aggregateIncomeByMonth`: the month's condominium inside the deposits and the
     * agency's cut of it, added unit by unit (units differ: one may be vacant, agreements may differ).
     */
    condo_split?: { in: number; fee: number };
    /** sub-unit of a multi-unit property (profile JSON id); null/undefined = the whole property */
    unit_id?: string | null;
    /** the unit's name when the row was saved */
    unit_name?: string | null;
    /** legacy, ignored by the money model (IPTU comes from the taxes register) */
    iptu_amount: number;
    agency_fee_pct: number;
    status: IncomeStatus;
    source: IncomeSource;
    bank_reference: string | null;
    notes: string | null;
    created_at?: string;
    updated_at?: string;
}

/** Partial row sent to PUT. Only the fields present are overwritten. `month` is `YYYY-MM`; a row is identified by month + unit. */
export interface IncomeRowInput {
    month: string;
    /** sub-unit the row belongs to; null/absent = the whole property */
    unit_id?: string | null;
    /** spreadsheet imports: the unit's name, resolved to `unit_id` by the server */
    unit_name?: string | null;
    condo_amount?: number;
    fee_on_condo?: boolean;
    received_amount?: number;
    /**
     * Not stored. When present and `received_amount` is absent, the server
     * derives `received_amount` from it using the (merged) fee, energy and
     * condominium values (`receivedFromGross`).
     * When both are sent, `received_amount` wins.
     */
    gross_rent?: number;
    energy_portion?: number;
    other_income?: number;
    other_expenses?: number;
    iptu_amount?: number;
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
    /** energy cost paid by the owner for the month (≥ 0) */
    other: number;
    /** other expenses paid by the owner for the month (≥ 0) */
    otherExpenses: number;
    /** condominium due for the month (expense, ≥ 0) */
    condo: number;
    /** the agency's % applies to the condominium too */
    feeOnCondo: boolean;
    /** condominium inside the deposit, after the agency's cut (0 when the unit is vacant) */
    condoIn: number;
    /** condominium the tenant paid (= condoIn + condoFee) */
    condoPaid: number;
    /** the agency's cut of the condominium (0 when the fee applies to the rent only) */
    condoFee: number;
    netRent: number;
    grossRent: number;
    /** the agency's cut of the rent (gross rent − net rent) */
    rentFee: number;
    /** everything the agency kept: rentFee + condoFee */
    feeAmount: number;
    feePct: number;
    /** gross rent + energy income + condominium paid by the tenant (everything the tenant pays for the month) */
    revenue: number;
    /** agency fee + energy cost + other expenses + condominium */
    opex: number;
    /** revenue − opex (= received − energy cost − other expenses − condominium) */
    noi: number;
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
    row: Pick<PropertyIncomeRow, "received_amount" | "energy_portion" | "other_income" | "agency_fee_pct"> & { other_expenses?: number; condo_amount?: number; fee_on_condo?: boolean; condo_split?: { in: number; fee: number } }
): IncomeBreakdown {
    const received = Number(row.received_amount) || 0;
    const energy = Number(row.energy_portion) || 0;
    const other = Number(row.other_income) || 0;
    const otherExpenses = Number(row.other_expenses) || 0;
    const condo = Number(row.condo_amount) || 0;
    const feePct = clampPct(Number(row.agency_fee_pct) || 0);
    const feeOnCondo = Boolean(row.fee_on_condo);
    const keep = 1 - feePct / 100;
    let condoIn: number, condoFee: number;
    if (row.condo_split) {
        condoIn = row.condo_split.in;
        condoFee = row.condo_split.fee;
    } else {
        // the deposit carries the condominium only while a tenant pays it: never more than what came in
        condoIn = Math.min(feeOnCondo ? round2(condo * keep) : condo, Math.max(0, round2(received - energy)));
        condoFee = feeOnCondo && feePct > 0 ? round2(condoIn / keep - condoIn) : 0;
    }
    const condoPaid = round2(condoIn + condoFee);
    const netRent = round2(received - energy - condoIn);
    const grossRent = feePct > 0 ? round2(netRent / keep) : netRent;
    const rentFee = round2(grossRent - netRent);
    const feeAmount = round2(rentFee + condoFee);
    return {
        received,
        energy,
        other,
        otherExpenses,
        condo,
        feeOnCondo,
        condoIn,
        condoPaid,
        condoFee,
        netRent,
        grossRent,
        rentFee,
        feeAmount,
        feePct,
        revenue: round2(grossRent + energy + condoPaid),
        opex: round2(feeAmount + other + otherExpenses + condo),
        noi: round2(received - other - otherExpenses - condo),
    };
}

/**
 * Inverse of `breakdown`: the deposit for a given gross rent (the energy cost is paid separately).
 * The tenant's condominium comes inside the deposit: in full when the fee applies to the rent only, less the
 * fee otherwise. Without rent there is no tenant (vacancy), so no condominium comes in: it is only a cost.
 */
export function receivedFromGross(grossRent: number, feePct: number, energy: number, condo = 0, feeOnCondo = false): number {
    const pct = clampPct(feePct);
    const k = 1 - pct / 100;
    const gross = Number(grossRent) || 0;
    const condoIn = gross > 0 ? (feeOnCondo ? round2((Number(condo) || 0) * k) : Number(condo) || 0) : 0;
    return round2(gross * k + (Number(energy) || 0) + condoIn);
}

/** `2026-09-01` or `2026-09` → `2026-09` */
export function monthKey(dateOrMonth: string): string {
    return dateOrMonth.slice(0, 7);
}

/** Identity of a ledger row: its month and its unit (`2026-09|` for the whole property). */
export function incomeRowKey(row: { month: string; unit_id?: string | null }): string {
    return `${monthKey(row.month)}|${row.unit_id ?? ""}`;
}

/**
 * One row per month: a month's unit rows added together. Everything outside the ledger table reads the
 * ledger through this, so a multi-unit property behaves like any other.
 *   • a month with confirmed rows counts only those (a unit still marked "previsto" has not paid yet);
 *     a month with no confirmed row is the sum of its expected rows, marked EXPECTED;
 *   • the fee % is the effective one (fee on the rent ÷ total gross rent), so `breakdown` of the result gives
 *     back the summed gross rent, fee and net rent exactly;
 *   • a month with a single row is returned as it is.
 * Order: months in the order they first appear.
 */
export function aggregateIncomeByMonth(rows: PropertyIncomeRow[]): PropertyIncomeRow[] {
    const groups = new Map<string, PropertyIncomeRow[]>();
    for (const r of rows) {
        const k = monthKey(r.month);
        const list = groups.get(k);
        if (list) list.push(r); else groups.set(k, [r]);
    }
    const out: PropertyIncomeRow[] = [];
    for (const [k, all] of groups) {
        if (all.length === 1) { out.push(all[0]); continue; }
        const confirmed = all.filter(r => r.status === "CONFIRMED");
        const list = confirmed.length > 0 ? confirmed : all;
        let received = 0, energy = 0, other = 0, otherExpenses = 0, condo = 0, condoIn = 0, condoFee = 0, gross = 0, fee = 0;
        for (const r of list) {
            const b = breakdown(r);
            received += b.received; energy += b.energy; other += b.other; otherExpenses += b.otherExpenses;
            condo += b.condo; condoIn += b.condoIn; condoFee += b.condoFee;
            gross += b.grossRent; fee += b.rentFee;
        }
        const dates = list.map(r => r.received_on).filter((d): d is string => Boolean(d)).sort();
        const sources = new Set(list.map(r => r.source));
        out.push({
            id: `month-${k}`,
            property_id: list[0].property_id,
            month: `${k}-01`,
            received_on: dates.length ? dates[dates.length - 1] : null,
            received_amount: round2(received),
            energy_portion: round2(energy),
            other_income: round2(other),
            other_expenses: round2(otherExpenses),
            condo_amount: round2(condo),
            fee_on_condo: condoFee > 0,
            // units differ (one may be vacant, agreements may differ): the month carries the condominium
            // that came inside the deposits and the agency's cut of it, added unit by unit
            condo_split: { in: round2(condoIn), fee: round2(condoFee) },
            unit_id: null,
            unit_name: null,
            iptu_amount: 0,
            agency_fee_pct: gross > 0 ? (fee / gross) * 100 : 0,
            status: confirmed.length > 0 ? "CONFIRMED" : "EXPECTED",
            source: sources.size === 1 ? list[0].source : "MANUAL",
            bank_reference: null,
            notes: null,
        });
    }
    return out;
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

/**
 * Header labels of the Excel template ("Exportar modelo"). A sheet whose
 * first columns carry exactly these headers is imported without the mapping
 * step. Keep in sync with `suggestMapping` (each maps to its field).
 */
export const INCOME_TEMPLATE_HEADERS = [
    "Mês (dd/mm/aaaa)",
    "Unidade",
    "Aluguel bruto (R$)",
    "Taxa imobiliária (%)",
    "Valor recebido (R$)",
    "Energia (R$)",
    "Custo de energia (R$)",
    "Outras despesas (R$)",
    "Condomínio (R$)",
    "Taxa sobre o condomínio (Sim/Não)",
    "Comentários",
] as const;

/** Columns added in 2026-09: templates exported before that do not have them and still import. */
const OPTIONAL_TEMPLATE_HEADERS = ["Unidade", "Condomínio (R$)", "Taxa sobre o condomínio (Sim/Não)"];

const normHeader = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** True when the sheet's headers are the Kitnets.com template headers (order and text). */
export function isIncomeTemplate(headers: string[]): boolean {
    // older templates carried an "IPTU (R$)" column (ignored on import) and lacked "Unidade" / "Condomínio (R$)" / "Taxa sobre o condomínio":
    // the columns every version has must be there, in order
    const optional = new Set(OPTIONAL_TEMPLATE_HEADERS.map(normHeader));
    const core = (list: readonly string[]) => list.map(normHeader).filter(h => !optional.has(h) && !/^iptu/.test(h));
    const got = core(headers), want = core(INCOME_TEMPLATE_HEADERS);
    return want.every((h, i) => got[i] === h);
}

export type IncomeField = "unit" | "gross" | "fee_pct" | "received" | "energy" | "other" | "other_expenses" | "condo" | "fee_on_condo" | "notes" | "ignore";

export const INCOME_FIELD_LABELS: Record<IncomeField, string> = {
    unit: "Unidade (nome da kitnet / apartamento)",
    condo: "Condomínio (despesa da unidade; o inquilino paga no depósito)",
    fee_on_condo: "Taxa incide sobre o condomínio? (Sim / Não)",
    gross: "Aluguel bruto (contrato)",
    fee_pct: "Taxa da imobiliária (%)",
    received: "Valor recebido (líquido da imobiliária)",
    energy: "Parcela de energia",
    other: "Custo de energia (conta paga)",
    other_expenses: "Outras despesas (pagas à parte)",
    notes: "Comentários",
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
        if (/condom/.test(h)) return /taxa|incide|fee/.test(h) ? "fee_on_condo" : "condo";
        if (/^unidade|^unit\b|kitnet|^apto|apartamento/.test(h)) return "unit";
        if (/custo de energia|custo energia|energy cost|conta de luz|conta de energia/.test(h)) return "other";
        if (/iptu/.test(h)) return "ignore";   // IPTU lives in Tributos do imóvel
        if (/acc|acum|saldo|investimento|total|custo|admin|prestac|amortiza|utilidade/.test(h)) return "ignore";
        if (/taxa|comiss|fee|%/.test(h)) return "fee_pct";
        if (/tarifa/.test(h)) return "ignore";
        if (/energia|energy|solar/.test(h)) return "energy";
        if (/^renda aluguel 1$/.test(h)) return "energy";
        if (/^renda aluguel 2$/.test(h)) return "ignore";
        if (/bruto|gross|contrat/.test(h)) return "gross";
        if (/l[ií]quido|\bnet\b/.test(h)) return "ignore";   // derived column, never imported
        if (/recebid|cr[eé]dito/.test(h)) return "received";
        if (/renda aluguel|aluguel|rent|receita/.test(h)) return "received";
        if (/outras despesas|outr|other exp|other/.test(h)) return "other_expenses";
        return "ignore";
    });
}

/** "Sim", "s", "yes", "x", "1", "true" → true · "Não", "n", "no", "0", "false" → false · anything else → null */
export function parseYesNo(raw: string | null | undefined): boolean | null {
    const t = String(raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^(sim|s|yes|y|x|1|true|verdadeiro)$/.test(t)) return true;
    if (/^(nao|n|no|0|false|falso)$/.test(t)) return false;
    return null;
}

export interface BuildImportOptions {
    agencyFeePct: number;
    /** for rows without a "Taxa sobre o condomínio" cell: the fee applies to the condominium too */
    feeOnCondo?: boolean;
    /** Months after this one are marked EXPECTED. Defaults to the current month. */
    todayMonth?: string;
}

export interface ImportPreviewRow extends IncomeRowInput {
    line: number;
}

/**
 * Turns a parsed sheet + column mapping into PUT rows. Rows whose mapped
 * money cells are all blank are skipped; an explicit "0,00" is kept
 * (vacancy). A row is a month + a unit (the "Unidade" column, when mapped); duplicates of the same
 * month and unit keep the row with more filled cells.
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
            ...(opts.feeOnCondo ? { fee_on_condo: true } : {}),
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
            if (field === "unit") {
                const t = cell.trim();
                if (t) row.unit_name = t.slice(0, 120);   // the server resolves the name to the unit
                return;
            }
            if (field === "fee_on_condo") {
                const yes = parseYesNo(cell);
                if (yes !== null) row.fee_on_condo = yes;
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
            else if (field === "other_expenses") row.other_expenses = abs;
            else if (field === "condo") row.condo_amount = abs;
        });
        if (filled === 0) continue;
        const key = `${r.month}|${(row.unit_name ?? "").trim().toLowerCase()}`;
        const existing = byMonth.get(key);
        if (!existing || filled > existing.filled) byMonth.set(key, { row, filled });
    }

    return Array.from(byMonth.values())
        .map(v => v.row)
        .sort((a, b) => (a.month !== b.month ? (a.month < b.month ? -1 : 1) : (a.unit_name ?? "").localeCompare(b.unit_name ?? "", "pt-BR", { numeric: true })));
}

// ───────────────────────────────────────────────────────────────────────────
// Aggregations used by the dashboard
// ───────────────────────────────────────────────────────────────────────────

/** Rows whose month falls inside an inclusive `YYYY-MM` range (null bound = open). */
export function filterRowsByPeriod<T extends { month: string }>(
    rows: T[],
    range: { start: string | null; end: string | null }
): T[] {
    return rows.filter(r => {
        const k = monthKey(r.month);
        if (range.start && k < range.start) return false;
        if (range.end && k > range.end) return false;
        return true;
    });
}

export interface IncomeSummary {
    latest: (PropertyIncomeRow & IncomeBreakdown) | null;   // latest CONFIRMED month
    confirmedMonths: number;
    expectedMonths: number;
    totalReceived: number;          // confirmed, all time
    totalNetRent: number;           // confirmed, all time
    totalEnergy: number;            // confirmed, all time
    totalFee: number;               // agency fees kept before crediting (on the rent and, when agreed, on the condominium), all time = potential saving of self-management
    fee12m: number;
    totalGross: number;             // gross rent (contract value), confirmed, all time
    totalOther: number;             // energy cost, all time
    other12m: number;
    totalOtherExpenses: number;     // other expenses, all time
    otherExpenses12m: number;
    totalCondo: number;             // condominium due (expense), all time
    totalCondoIn: number;           // condominium that came inside the deposits (after the agency's cut, when it applies), all time
    condo12m: number;
    totalNoi: number;               // revenue − opex (= received − energy cost − other expenses − condominium), all time
    noi12m: number;
    totalRevenue: number;           // gross rent + energy income, all time
    revenue12m: number;
    netRent12m: number;             // last 12 confirmed months
    energy12m: number;
    received12m: number;
    firstMonth: string | null;
    lastMonth: string | null;
}

export function summarize(allRows: PropertyIncomeRow[]): IncomeSummary {
    const rows = aggregateIncomeByMonth(allRows);   // months, not unit rows: "12 meses" and "latest" mean months
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
        totalFee: sum(confirmed, b => b.feeAmount),
        fee12m: sum(last12, b => b.feeAmount),
        totalGross: sum(confirmed, b => b.grossRent),
        totalOther: sum(confirmed, b => b.other),
        other12m: sum(last12, b => b.other),
        totalOtherExpenses: sum(confirmed, b => b.otherExpenses),
        otherExpenses12m: sum(last12, b => b.otherExpenses),
        totalCondo: sum(confirmed, b => b.condo),
        totalCondoIn: sum(confirmed, b => b.condoIn),
        condo12m: sum(last12, b => b.condo),
        totalNoi: sum(confirmed, b => b.noi),
        noi12m: sum(last12, b => b.noi),
        totalRevenue: sum(confirmed, b => b.revenue),
        revenue12m: sum(last12, b => b.revenue),
        netRent12m: sum(last12, b => b.netRent),
        energy12m: sum(last12, b => b.energy),
        received12m: sum(last12, b => b.received),
        firstMonth: confirmed.length ? monthKey(confirmed[0].month) : null,
        lastMonth: latestRow ? monthKey(latestRow.month) : null,
    };
}

// ── Rent history (Receita Bruta card → "Histórico do aluguel") ───────────
export interface RentPoint { key: string; month: string; bruto: number; liquido: number }
export interface RentAdjustment { month: string; from: number; to: number; pct: number }
export interface RentYearPoint {
    year: number;
    /** confirmed months with rent in the year */
    months: number;
    avgGross: number;
    /** gross rent of the last month recorded in the year */
    lastGross: number;
    /** lastGross vs the previous recorded year's lastGross, in %; null for the first year */
    growthPct: number | null;
}

/**
 * Gross-rent history from the confirmed months with rent (vacancy months are left out):
 * monthly points (oldest first), each change of the rent of 0.5 % or more, and one row per year.
 */
export function rentHistory(rows: PropertyIncomeRow[]): { points: RentPoint[]; adjustments: RentAdjustment[]; years: RentYearPoint[] } {
    const points: RentPoint[] = aggregateIncomeByMonth(rows)
        .filter(r => r.status === "CONFIRMED")
        .map(r => { const b = breakdown(r); const key = monthKey(r.month); return { key, month: formatMonthKey(key), bruto: round2(b.grossRent), liquido: round2(b.netRent) }; })
        .filter(p => p.bruto > 0)
        .sort((a, b) => (a.key < b.key ? -1 : 1));

    const adjustments: RentAdjustment[] = [];
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1].bruto, to = points[i].bruto;
        const pct = Math.round((to / from - 1) * 1000) / 10;
        if (Math.abs(pct) >= 0.5) adjustments.push({ month: points[i].key, from, to, pct });
    }

    const byYear = new Map<number, RentPoint[]>();
    for (const p of points) { const y = Number(p.key.slice(0, 4)); byYear.set(y, [...(byYear.get(y) ?? []), p]); }
    const ys = [...byYear.keys()].sort((a, b) => a - b);
    const years: RentYearPoint[] = ys.map((year, i) => {
        const ps = byYear.get(year)!;
        const lastGross = ps[ps.length - 1].bruto;
        const prev = i > 0 ? byYear.get(ys[i - 1])! : null;
        const prevLast = prev ? prev[prev.length - 1].bruto : 0;
        return {
            year, months: ps.length,
            avgGross: round2(ps.reduce((a, p) => a + p.bruto, 0) / ps.length),
            lastGross,
            growthPct: prev && prevLast > 0 ? Math.round((lastGross / prevLast - 1) * 1000) / 10 : null,
        };
    });
    return { points, adjustments, years };
}
