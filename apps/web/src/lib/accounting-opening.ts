/**
 * Saldo de abertura (Contábil & Fiscal, Etapa 2) — pure part.
 *
 * The balances of the balance-sheet accounts on the day before the books start on the
 * platform (the contador's balancete, e.g. 31/12/2025), posted as one OPENING entry dated
 * the opening date. Only asset, liability and equity accounts; debits must equal credits.
 * A difference is never absorbed silently: the owner may ask to put it in lucros or
 * prejuízos acumulados, visibly.
 */
import type { AccountingAccount } from "./accounting-chart";
import { entryTotals, toCents } from "./accounting-journal";

export const OPENING_SOURCE_REF = "opening";

export interface OpeningBalanceLine {
    account_id: string;
    debit: number;
    credit: number;
}

export type BalanceSheetAccount = Pick<AccountingAccount, "id" | "code" | "name" | "account_type" | "nature" | "analytic" | "active" | "system_key">;

export function isBalanceSheet(a: Pick<AccountingAccount, "account_type">): boolean {
    return a.account_type === "ATIVO" || a.account_type === "PASSIVO" || a.account_type === "PL";
}

export interface OpeningResult {
    lines: OpeningBalanceLine[];
    debit: number;
    credit: number;
    /** debit − credit before any plug */
    difference: number;
    plugged: boolean;
}

/**
 * Cleans the typed balances (drops zero lines, merges repeated accounts, nets a line typed
 * on both sides) and, when asked, closes the difference against lucros acumulados
 * (debits > credits) or prejuízos acumulados (credits > debits).
 */
export function buildOpening(
    input: OpeningBalanceLine[],
    opts: { plug?: boolean; lucrosAccountId?: string | null; prejuizosAccountId?: string | null } = {}
): OpeningResult {
    const net = new Map<string, number>();   // cents, debit positive
    for (const l of input) {
        if (!l.account_id) continue;
        const d = toCents(l.debit) || 0, c = toCents(l.credit) || 0;
        net.set(l.account_id, (net.get(l.account_id) ?? 0) + d - c);
    }
    const lines: OpeningBalanceLine[] = [];
    for (const [account_id, cents] of net) {
        if (cents > 0) lines.push({ account_id, debit: cents / 100, credit: 0 });
        else if (cents < 0) lines.push({ account_id, debit: 0, credit: -cents / 100 });
    }
    const t = entryTotals(lines);
    const diffCents = toCents(t.debit) - toCents(t.credit);
    let plugged = false;
    if (opts.plug && diffCents !== 0) {
        if (diffCents > 0 && opts.lucrosAccountId) {
            lines.push({ account_id: opts.lucrosAccountId, debit: 0, credit: diffCents / 100 });
            plugged = true;
        } else if (diffCents < 0 && opts.prejuizosAccountId) {
            lines.push({ account_id: opts.prejuizosAccountId, debit: -diffCents / 100, credit: 0 });
            plugged = true;
        }
    }
    const after = entryTotals(lines);
    return { lines, debit: after.debit, credit: after.credit, difference: diffCents / 100, plugged };
}

/** Problems with the opening lines, in Portuguese. */
export function validateOpening(lines: OpeningBalanceLine[], accounts: Map<string, BalanceSheetAccount>): string[] {
    const problems: string[] = [];
    if (lines.length < 2) problems.push("Informe os saldos de pelo menos duas contas");
    for (const l of lines) {
        const a = accounts.get(l.account_id);
        if (!a) { problems.push("Conta não encontrada"); continue; }
        if (!a.analytic) problems.push(`${a.code} é um grupo: use uma conta analítica`);
        else if (!isBalanceSheet(a)) problems.push(`${a.code} ${a.name}: o saldo de abertura só tem contas de ativo, passivo e patrimônio líquido`);
        else if (!a.active) problems.push(`${a.code} está inativa`);
    }
    const t = entryTotals(lines);
    if (lines.length >= 2 && !t.balanced) problems.push("Os saldos devedores e credores precisam ser iguais");
    return problems;
}
