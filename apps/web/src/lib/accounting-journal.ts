/**
 * Holding journal (Contábil & Fiscal › Lançamentos): types and the checks the app runs
 * before posting. The database enforces the same rules (balanced entries, analytic and
 * active accounts, closed months) — see migration 20260928090000_accounting_base.sql —
 * so this module is about telling the user what is wrong before the round trip.
 */
import type { AccountingAccount } from "./accounting-chart";

export type EntrySource = "MANUAL" | "OPENING" | "BANK" | "ACCRUAL" | "DEPRECIATION" | "FAIR_VALUE" | "TAX" | "CLOSING" | "REVERSAL";

export const ENTRY_SOURCE_LABELS: Record<EntrySource, string> = {
    MANUAL: "Manual",
    OPENING: "Saldo de abertura",
    BANK: "Extrato bancário",
    ACCRUAL: "Competência",
    DEPRECIATION: "Depreciação",
    FAIR_VALUE: "Valor justo",
    TAX: "Tributos",
    CLOSING: "Encerramento",
    REVERSAL: "Estorno",
};

/** Sources a person may post by hand; the others come from the automation or from reversals. */
export const MANUAL_SOURCES: EntrySource[] = ["MANUAL", "OPENING"];

/**
 * Entries the monthly close keeps by itself (lib/accounting-accruals.ts): recomputed from the
 * records while the month is open, so they are not deleted or reversed by hand — the fix is
 * in the record they come from.
 */
export const AUTO_SOURCES = ["ACCRUAL", "DEPRECIATION", "FAIR_VALUE"] as const satisfies readonly EntrySource[];
export type AutoSource = (typeof AUTO_SOURCES)[number];

export function isAutoSource(source: string): source is AutoSource {
    return (AUTO_SOURCES as readonly string[]).includes(source);
}

/** A reversal is the correction of a closed month; reversals and automated entries are not reversed. */
export function canReverse(e: { source: string; reversed_by?: string | null }): boolean {
    return e.source !== "REVERSAL" && !isAutoSource(e.source) && !e.reversed_by;
}

export interface JournalLine {
    id: string;
    line_no: number;
    account_id: string;
    debit: number;
    credit: number;
    property_id: string | null;
    unit_id: string | null;
    memo: string | null;
}

export interface JournalEntry {
    id: string;
    entry_date: string;
    description: string;
    source: EntrySource;
    source_ref: string | null;
    reverses_entry_id: string | null;
    created_by: string | null;
    created_at: string;
    lines: JournalLine[];
    /** id of the entry that reversed this one, when there is one */
    reversed_by?: string | null;
}

export interface LineDraft {
    account_id: string;
    debit?: number | null;
    credit?: number | null;
    property_id?: string | null;
    unit_id?: string | null;
    memo?: string | null;
}

export interface EntryDraft {
    entry_date: string;
    description: string;
    source?: EntrySource;
    lines: LineDraft[];
}

export type PeriodStatus = "OPEN" | "CLOSED";

export interface AccountingPeriod {
    month: string;          // YYYY-MM-01
    status: PeriodStatus;
    closed_at: string | null;
    closed_note: string | null;
    reopened_at: string | null;
    reopen_reason: string | null;
}

export const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-09-17" → "2026-09". */
export function monthOf(date: string): string {
    return date.slice(0, 7);
}

/** "2026-09" → "2026-09-01". */
export function monthStart(monthKey: string): string {
    return `${monthKey}-01`;
}

export function toCents(v: number | null | undefined): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function isValidIsoDate(s: string): boolean {
    if (!ISO_DATE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function entryTotals(lines: Pick<LineDraft, "debit" | "credit">[]): { debit: number; credit: number; balanced: boolean } {
    let d = 0, c = 0;
    for (const l of lines) {
        const dc = toCents(l.debit ?? 0), cc = toCents(l.credit ?? 0);
        d += Number.isFinite(dc) ? dc : 0;
        c += Number.isFinite(cc) ? cc : 0;
    }
    return { debit: d / 100, credit: c / 100, balanced: d === c && d > 0 };
}

export interface ValidateOptions {
    accounts: Map<string, Pick<AccountingAccount, "id" | "code" | "name" | "analytic" | "active">>;
    /** months (`YYYY-MM`) closed for posting */
    closedMonths?: Set<string>;
    /** entries before this date belong to a previous system (the opening balance date) */
    openingDate?: string | null;
}

/** Problems with a draft entry, in Portuguese; empty when it can be posted. */
export function validateEntryDraft(draft: EntryDraft, opts: ValidateOptions): string[] {
    const problems: string[] = [];
    const date = String(draft.entry_date ?? "");
    if (!isValidIsoDate(date)) problems.push("Data inválida");
    else {
        if (opts.closedMonths?.has(monthOf(date))) problems.push(`O mês ${monthOf(date).split("-").reverse().join("/")} está fechado: lance em um mês aberto`);
        if (opts.openingDate && date < opts.openingDate) problems.push("A data é anterior ao início da escrituração na Kitnets.com");
    }
    const description = String(draft.description ?? "").trim();
    if (!description) problems.push("Informe o histórico do lançamento");
    else if (description.length > 300) problems.push("Histórico muito longo (máx. 300 caracteres)");
    if (draft.source && !MANUAL_SOURCES.includes(draft.source)) problems.push("Origem inválida para um lançamento manual");

    const lines = Array.isArray(draft.lines) ? draft.lines : [];
    if (lines.length < 2) problems.push("Um lançamento precisa de pelo menos duas linhas (débito e crédito)");
    if (lines.length > 200) problems.push("Lançamento com linhas demais (máx. 200)");
    lines.forEach((l, i) => {
        const n = i + 1;
        const acc = opts.accounts.get(l.account_id);
        if (!acc) problems.push(`Linha ${n}: escolha a conta`);
        else if (!acc.analytic) problems.push(`Linha ${n}: ${acc.code} é um grupo; use uma conta analítica`);
        else if (!acc.active) problems.push(`Linha ${n}: a conta ${acc.code} está inativa`);
        const d = toCents(l.debit ?? 0), c = toCents(l.credit ?? 0);
        if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) problems.push(`Linha ${n}: valor inválido`);
        else if ((d > 0) === (c > 0)) problems.push(`Linha ${n}: informe o valor só no débito ou só no crédito`);
        else if (Math.abs(Number(l.debit ?? 0) * 100 - d) > 1e-6 || Math.abs(Number(l.credit ?? 0) * 100 - c) > 1e-6) problems.push(`Linha ${n}: use no máximo duas casas decimais`);
    });
    const t = entryTotals(lines);
    if (lines.length >= 2 && !t.balanced) {
        problems.push(`Débitos (${formatMoney(t.debit)}) e créditos (${formatMoney(t.credit)}) precisam ser iguais`);
    }
    return problems;
}

/** Normalized payload for accounting_post_entry. */
export function toPostPayload(draft: EntryDraft, createdBy: string | null) {
    return {
        entry: {
            entry_date: draft.entry_date,
            description: String(draft.description).trim(),
            source: draft.source ?? "MANUAL",
            created_by: createdBy,
        },
        lines: draft.lines.map(l => ({
            account_id: l.account_id,
            debit: toCents(l.debit ?? 0) / 100,
            credit: toCents(l.credit ?? 0) / 100,
            property_id: l.property_id || null,
            unit_id: l.unit_id || null,
            memo: l.memo ? String(l.memo).trim().slice(0, 300) : null,
        })),
    };
}

/** Balance per account over a set of lines, signed by the account's nature (positive = normal side). */
export function balancesByAccount(lines: Pick<JournalLine, "account_id" | "debit" | "credit">[], accounts: Map<string, Pick<AccountingAccount, "nature">>): Map<string, number> {
    const cents = new Map<string, number>();
    for (const l of lines) {
        const nat = accounts.get(l.account_id)?.nature ?? "D";
        const delta = toCents(l.debit) - toCents(l.credit);
        cents.set(l.account_id, (cents.get(l.account_id) ?? 0) + (nat === "D" ? delta : -delta));
    }
    return new Map([...cents].map(([k, v]) => [k, v / 100]));
}

/** Typed amount → number: "1.500,50" / "1500,50" / "1500.50" / "1.500" / "R$ 10" (a lone dot with 1–2 decimals is the decimal point). */
export function parseAmountInput(s: string): number {
    const t = String(s ?? "").trim().replace(/\s|R\$/g, "");
    if (t === "") return 0;
    if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
    return /^-?\d+\.\d{1,2}$/.test(t) ? Number(t) : Number(t.replace(/\./g, ""));
}

export function formatMoney(v: number): string {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Postgres error text from the guards → the user-facing message (they are already in Portuguese). */
export function postingErrorMessage(raw: string | null | undefined): string {
    const msg = String(raw ?? "");
    if (/journal_entries_owner_source_ref/.test(msg)) return "Esse lançamento já foi gerado";
    if (/journal_lines_one_side/.test(msg)) return "Cada linha precisa de valor só no débito ou só no crédito";
    if (/journal_lines_account/.test(msg)) return "Conta contábil não encontrada";
    if (/invalid input syntax for type (date|uuid|numeric)/.test(msg)) return "Dados inválidos no lançamento";
    return msg || "Não foi possível gravar o lançamento";
}
