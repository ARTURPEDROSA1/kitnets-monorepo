/**
 * Balancete, razão and aluguéis a receber (Contábil & Fiscal, Etapa 3) — pure part.
 *
 * Amounts are signed debit − credit: a positive balance is a debit balance. `formatBalance`
 * shows it the way a balancete does ("1.234,56 D").
 */
import { compareCodes, parentCode, type AccountingAccount } from "./accounting-chart";
import { formatMoney, type JournalEntry } from "./accounting-journal";
import { round2 } from "./property-income";

export interface AccountSums {
    account_id: string;
    /** debit − credit before the period */
    opening: number;
    debit: number;
    credit: number;
}

export interface TrialBalanceRow {
    account_id: string;
    code: string;
    name: string;
    account_type: AccountingAccount["account_type"];
    analytic: boolean;
    level: number;
    opening: number;
    debit: number;
    credit: number;
    closing: number;
}

type ChartAccount = Pick<AccountingAccount, "id" | "code" | "name" | "account_type" | "analytic">;

/** One row per account with a balance or movement; groups carry the sum of their accounts. */
export function buildTrialBalance(accounts: ChartAccount[], sums: AccountSums[], opts: { includeZero?: boolean } = {}): TrialBalanceRow[] {
    const byId = new Map(sums.map(s => [s.account_id, s]));
    const totals = new Map<string, { opening: number; debit: number; credit: number }>();
    for (const a of accounts) {
        const s = byId.get(a.id);
        if (!s) continue;
        for (let code: string | null = a.code; code; code = parentCode(code)) {
            const t = totals.get(code) ?? { opening: 0, debit: 0, credit: 0 };
            t.opening += Number(s.opening) || 0;
            t.debit += Number(s.debit) || 0;
            t.credit += Number(s.credit) || 0;
            totals.set(code, t);
        }
    }
    return [...accounts]
        .sort((a, b) => compareCodes(a.code, b.code))
        .map(a => {
            const t = totals.get(a.code) ?? { opening: 0, debit: 0, credit: 0 };
            const opening = round2(t.opening), debit = round2(t.debit), credit = round2(t.credit);
            return {
                account_id: a.id, code: a.code, name: a.name, account_type: a.account_type, analytic: a.analytic,
                level: a.code.split(".").length, opening, debit, credit, closing: round2(opening + debit - credit),
            };
        })
        .filter(r => opts.includeZero || r.opening !== 0 || r.debit !== 0 || r.credit !== 0 || r.closing !== 0);
}

/** Totals of the analytic accounts: debits equal credits, and the balances add up to zero. */
export function trialBalanceTotals(rows: TrialBalanceRow[]): { debit: number; credit: number; opening: number; closing: number } {
    const leaf = rows.filter(r => r.analytic);
    const sum = (k: "debit" | "credit" | "opening" | "closing") => round2(leaf.reduce((s, r) => s + r[k], 0));
    return { debit: sum("debit"), credit: sum("credit"), opening: sum("opening"), closing: sum("closing") };
}

/** "1.234,56 D" / "1.234,56 C"; zero is "—". */
export function formatBalance(v: number): string {
    const r = round2(v);
    if (r === 0) return "—";
    return `${formatMoney(Math.abs(r))} ${r > 0 ? "D" : "C"}`;
}

export interface LedgerLine {
    date: string;
    entry_id: string;
    description: string;
    source: string;
    debit: number;
    credit: number;
    /** running balance after the line (debit − credit) */
    balance: number;
    property_id: string | null;
    memo: string | null;
}

export interface LedgerAccount {
    account_id: string;
    code: string;
    name: string;
    opening: number;
    lines: LedgerLine[];
    closing: number;
}

/** Razão: per analytic account, the opening balance and every line of the period in date order. */
export function buildLedger(accounts: ChartAccount[], opening: Map<string, number>, entries: JournalEntry[]): LedgerAccount[] {
    const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const byAccount = new Map<string, LedgerLine[]>();
    for (const e of sorted) {
        for (const l of e.lines) {
            const list = byAccount.get(l.account_id) ?? [];
            list.push({ date: e.entry_date, entry_id: e.id, description: e.description, source: e.source, debit: l.debit, credit: l.credit, balance: 0, property_id: l.property_id, memo: l.memo });
            byAccount.set(l.account_id, list);
        }
    }
    const out: LedgerAccount[] = [];
    for (const a of [...accounts].filter(x => x.analytic).sort((x, y) => compareCodes(x.code, y.code))) {
        const lines = byAccount.get(a.id) ?? [];
        const start = round2(opening.get(a.id) ?? 0);
        if (!lines.length && start === 0) continue;
        let running = start;
        for (const l of lines) {
            running = round2(running + l.debit - l.credit);
            l.balance = running;
        }
        out.push({ account_id: a.id, code: a.code, name: a.name, opening: start, lines, closing: running });
    }
    return out;
}

export interface ReceivableRow {
    property_id: string | null;
    opening: number;
    /** rent accrued in the period (debits) */
    accrued: number;
    /** deposits and other credits */
    received: number;
    closing: number;
}

/** Aluguéis a receber per property: opening, accrued, received, closing. */
export function receivablesByProperty(opening: Map<string, number>, entries: JournalEntry[], receivableAccountId: string): ReceivableRow[] {
    const rows = new Map<string, ReceivableRow>();
    const row = (key: string) => {
        let r = rows.get(key);
        if (!r) { r = { property_id: key || null, opening: round2(opening.get(key) ?? 0), accrued: 0, received: 0, closing: 0 }; rows.set(key, r); }
        return r;
    };
    for (const k of opening.keys()) row(k);
    for (const e of entries) {
        for (const l of e.lines) {
            if (l.account_id !== receivableAccountId) continue;
            const r = row(l.property_id ?? "");
            r.accrued = round2(r.accrued + l.debit);
            r.received = round2(r.received + l.credit);
        }
    }
    for (const r of rows.values()) r.closing = round2(r.opening + r.accrued - r.received);
    return [...rows.values()].filter(r => r.opening !== 0 || r.accrued !== 0 || r.received !== 0);
}
