/**
 * Motor de lançamentos do extrato (Contábil & Fiscal, Etapa 2) — server part.
 *
 * Turns bank_transactions rows into journal entries (source BANK, source_ref = row id), keeps
 * the questions for the owner, undoes an entry when its row is reclassified or deleted (only
 * in an open month) and computes the bank account's book balance for the reconciliation.
 * Every query is scoped to the owner.
 */
import type { AdminSupabase } from "./api-auth";
import type { AccountingAccount } from "./accounting-chart";
import { monthOf, postingErrorMessage } from "./accounting-journal";
import {
    answerHistory, bankEntryPayload, suggestCounterpart, type BankRowForPosting, type BankRowStatus, type CounterpartSource, type SuggestContext,
} from "./accounting-bank-posting";
import { chunk, closedMonths, ensureChart, fetchAllPages, loadPeriods, loadSettings } from "./accounting-server";
import type { AccountingSettings } from "./accounting-policies";

const TABLE = "bank_transactions";
const ROW_COLUMNS = "id, occurred_on, amount, memo, destination, property_id, kind, account_id, account_option";

export interface PostedBankEntry {
    entryId: string;
    entryDate: string;
    /** the line that is not the bank account */
    counterpartAccountId: string | null;
}

export interface BankContext {
    settings: AccountingSettings;
    accounts: AccountingAccount[];
    bankAccountId: string;
    closed: Set<string>;
    suggest: SuggestContext;
}

export interface BankRowView extends BankRowForPosting {
    status: BankRowStatus;
    entryId: string | null;
    counterpartAccountId: string | null;
    counterpartSource: CounterpartSource | null;
    suggestedOptionId: string | null;
}

/** Bank rows (all of them, or the given ids), newest first, paged past the API's 1000-row cap. */
export async function loadBankRowsForPosting(supabase: AdminSupabase, ownerId: string, ids?: string[]): Promise<BankRowForPosting[]> {
    let data: BankRowForPosting[];
    if (ids) {
        data = [];
        for (const part of chunk(ids)) {
            const { data: rows, error } = await supabase.from(TABLE).select(ROW_COLUMNS).eq("owner_id", ownerId).in("id", part);
            if (error) throw new Error(error.message);
            data.push(...((rows ?? []) as unknown as BankRowForPosting[]));
        }
        data.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1));
    } else {
        data = await fetchAllPages<BankRowForPosting>((a, b) => supabase.from(TABLE).select(ROW_COLUMNS).eq("owner_id", ownerId)
            .order("occurred_on", { ascending: false }).order("id").range(a, b));
    }
    return data.map(r => ({ ...r, amount: Number(r.amount) || 0 }));
}

type PostedRaw = { id: string; entry_date: string; source_ref: string; journal_lines: Array<{ account_id: string }> };

/** BANK entries by bank row id. */
export async function postedBankEntries(supabase: AdminSupabase, ownerId: string, bankAccountId: string, ids?: string[]): Promise<Map<string, PostedBankEntry>> {
    const select = "id, entry_date, source_ref, journal_lines(account_id)";
    let data: PostedRaw[];
    if (ids) {
        data = [];
        for (const part of chunk(ids)) {
            const { data: rows, error } = await supabase.from("journal_entries").select(select).eq("owner_id", ownerId).eq("source", "BANK").in("source_ref", part);
            if (error) throw new Error(error.message);
            data.push(...((rows ?? []) as unknown as PostedRaw[]));
        }
    } else {
        data = await fetchAllPages<PostedRaw>((a, b) => supabase.from("journal_entries").select(select).eq("owner_id", ownerId).eq("source", "BANK").order("id").range(a, b));
    }
    const out = new Map<string, PostedBankEntry>();
    for (const raw of data) {
        const cp = (raw.journal_lines ?? []).find(l => l.account_id !== bankAccountId);
        out.set(raw.source_ref, { entryId: raw.id, entryDate: raw.entry_date, counterpartAccountId: cp?.account_id ?? null });
    }
    return out;
}

export async function bankContext(supabase: AdminSupabase, ownerId: string): Promise<BankContext> {
    const { settings } = await loadSettings(supabase, ownerId);
    const [accounts, periods, answered] = await Promise.all([
        ensureChart(supabase, ownerId, settings.property_measurement),
        loadPeriods(supabase, ownerId),
        fetchAllPages<Pick<BankRowForPosting, "memo" | "account_id" | "account_option" | "occurred_on">>((a, b) => supabase.from(TABLE)
            .select("memo, account_id, account_option, occurred_on").eq("owner_id", ownerId).not("account_id", "is", null).order("id").range(a, b)),
    ]);
    const bank = accounts.find(a => a.system_key === "BANCOS");
    if (!bank) throw new Error("Conta Bancos não encontrada no plano de contas");
    const history = answerHistory(answered);
    return {
        settings,
        accounts,
        bankAccountId: bank.id,
        closed: closedMonths(periods),
        suggest: {
            accountsByKey: new Map(accounts.filter(a => a.system_key).map(a => [a.system_key!, a])),
            accountsById: new Map(accounts.map(a => [a.id, a])),
            history,
        },
    };
}

/** Status of each row: posted, a question for the owner, waiting for the start date, before it, or in a closed month. */
export function viewRows(rows: BankRowForPosting[], posted: Map<string, PostedBankEntry>, ctx: BankContext): BankRowView[] {
    const start = ctx.settings.opening_date;
    return rows.map(row => {
        const done = posted.get(row.id);
        const s = suggestCounterpart(row, ctx.suggest);
        let status: BankRowStatus;
        if (done) status = "POSTED";
        else if (!start) status = "NO_START";
        else if (row.occurred_on < start) status = "BEFORE_OPENING";
        else if (ctx.closed.has(monthOf(row.occurred_on))) status = "CLOSED_MONTH";
        else status = s.counterpart ? "READY" : "QUESTION";
        return {
            ...row,
            status,
            entryId: done?.entryId ?? null,
            counterpartAccountId: done?.counterpartAccountId ?? s.counterpart?.accountId ?? null,
            counterpartSource: row.account_id ? "ANSWER" : s.counterpart?.source ?? null,
            suggestedOptionId: s.suggestedOptionId,
        };
    });
}

export interface PostingSummary {
    posted: number;
    questions: number;
    closedMonth: number;
    beforeOpening: number;
    /** rows waiting because the owner has not chosen the start of the books yet */
    waitingStart: number;
    errors: string[];
}

export const EMPTY_POSTING_SUMMARY: PostingSummary = { posted: 0, questions: 0, closedMonth: 0, beforeOpening: 0, waitingStart: 0, errors: [] };

/** Posts every row (or the given ones) that has no entry yet and a counterpart. Idempotent. Posts nothing until the start of the books is chosen. */
export async function postBankRows(supabase: AdminSupabase, ownerId: string, opts: { ids?: string[] } = {}): Promise<PostingSummary> {
    const ctx = await bankContext(supabase, ownerId);
    const rows = await loadBankRowsForPosting(supabase, ownerId, opts.ids);
    const posted = await postedBankEntries(supabase, ownerId, ctx.bankAccountId, opts.ids);
    const summary: PostingSummary = { ...EMPTY_POSTING_SUMMARY, errors: [] };
    const start = ctx.settings.opening_date;

    const toPost: Array<{ row: BankRowForPosting; accountId: string }> = [];
    for (const row of rows) {
        if (posted.has(row.id) || !row.amount) continue;
        if (!start) { summary.waitingStart++; continue; }
        if (row.occurred_on < start) { summary.beforeOpening++; continue; }
        if (ctx.closed.has(monthOf(row.occurred_on))) { summary.closedMonth++; continue; }
        const s = suggestCounterpart(row, ctx.suggest);
        if (!s.counterpart) { summary.questions++; continue; }
        toPost.push({ row, accountId: s.counterpart.accountId });
    }

    // a few postings at a time: a year of statements is hundreds of rows, one transaction each
    const CONCURRENCY = 8;
    let next = 0;
    const worker = async () => {
        while (next < toPost.length) {
            const { row, accountId } = toPost[next++];
            const payload = bankEntryPayload(row, ctx.bankAccountId, accountId);
            const { error } = await supabase.rpc("accounting_post_entry", { p_owner: ownerId, p_entry: payload.entry, p_lines: payload.lines });
            if (!error) { summary.posted++; continue; }
            if (/journal_entries_owner_source_ref/.test(error.message)) continue;   // posted by a concurrent run
            summary.errors.push(`${row.occurred_on} ${row.memo.slice(0, 40)}: ${postingErrorMessage(error.message)}`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toPost.length) }, worker));
    return summary;
}

/**
 * Removes the entry of a bank row so it can be reclassified or deleted, with the interest split
 * of a financing instalment made from it (fin:{row}); refused in a closed month.
 */
export async function unpostBankRow(supabase: AdminSupabase, ownerId: string, rowId: string): Promise<{ ok: true } | { error: string }> {
    const { data } = await supabase.from("journal_entries").select("id, entry_date").eq("owner_id", ownerId).eq("source", "BANK").eq("source_ref", rowId).maybeSingle();
    if (!data) return { ok: true };
    const { count } = await supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("reverses_entry_id", data.id);
    if ((count ?? 0) > 0) return { error: "O lançamento deste extrato foi estornado: ajuste pelo livro de lançamentos" };
    const split = await supabase.from("journal_entries").delete().eq("owner_id", ownerId).eq("source", "ACCRUAL").eq("source_ref", `fin:${rowId}`);
    if (split.error) return { error: postingErrorMessage(split.error.message) };
    const { error } = await supabase.from("journal_entries").delete().eq("id", data.id).eq("owner_id", ownerId);
    if (error) return { error: postingErrorMessage(error.message) };
    return { ok: true };
}

/** Book balance of the bank account up to `asOf` (inclusive), opening balance included. */
export async function bankBookBalance(supabase: AdminSupabase, ownerId: string, bankAccountId: string, asOf: string): Promise<number> {
    const { data, error } = await supabase.rpc("accounting_account_balance", { p_owner: ownerId, p_account: bankAccountId, p_as_of: asOf });
    if (error) throw new Error(error.message);
    return Math.round(Number(data ?? 0) * 100) / 100;
}
