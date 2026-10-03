/**
 * Competência e fechamento do mês (Contábil & Fiscal, Etapa 3) — pure part.
 *
 * The entries the books keep by themselves, recomputed from the owner's records while the
 * month is open (lib/accounting-close-server.ts). Each one has a stable source_ref, so a month
 * can be recomputed any number of times: what changed is replaced, what is no longer wanted
 * is removed, what is equal stays.
 *
 *   ACCRUAL  rent:{property}:{unit|-}:{YYYY-MM}  one per row of Receitas (the income ledger),
 *            dated the last day of the month: the rent is revenue of the month it refers to,
 *            paid or not.
 *              D Aluguéis a receber      what the agency deposits (rent after its fee + energy + condominium)
 *                                        plus what the tenant paid the owner directly, by invoice
 *              D Taxa de administração   everything the agency kept
 *              C Receita de aluguéis     the contract rent
 *              C energy, condominium and the other charges the tenant paid: Receita de reembolsos (policy
 *                RECEITA), or back against the expense the holding pays (REPASSE: Energia / Condomínio /
 *                IPTU / Outras despesas, by the kind of charge on the invoice)
 *            The deposit (and the invoice's payment), posted from the bank statement, settles Aluguéis a receber.
 *   ACCRUAL  fatura:{invoice}:encargos  the late fee and interest a tenant paid on an invoice, dated the
 *            payment: D Aluguéis a receber, C Juros e multas recebidos. The ledger never carries them.
 *   ACCRUAL  fin:{bank row}  the interest and the insurance/fees inside a financing instalment
 *            the bank engine posted in full against the loan, moved to expenses.
 *   DEPRECIATION  dep:{YYYY-MM}  cost model: buildings and improvements, straight line, per property.
 *   FAIR_VALUE    fv:{YYYY}      fair-value model: the December adjustment to the valuations of the year.
 *
 * What the holding pays (condomínio, energia, IPTU, manutenção) comes from the bank statement.
 */
import type { AccountingAccount, PropertyMeasurement } from "./accounting-chart";
import { formatMoney, type AutoSource } from "./accounting-journal";
import type { ReimbursementsPolicy } from "./accounting-policies";
import { breakdown, formatMonthKey, round2, type PropertyIncomeRow } from "./property-income";

/** A line by the account's system key; the server resolves the key to the owner's account. */
export interface AutoLine {
    key: string;
    debit: number;
    credit: number;
    property_id: string | null;
    unit_id: string | null;
    memo: string | null;
}

export interface AutoEntry {
    source: AutoSource;
    source_ref: string;
    entry_date: string;
    description: string;
    lines: AutoLine[];
}

const cents = (v: number) => Math.round((Number(v) || 0) * 100);
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const years = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} anos`;

/** Last day of `YYYY-MM`. */
export function monthEnd(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** `YYYY-MM` moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Every `YYYY-MM` from `from` to `to`, both included (empty when `to` < `from`). */
export function monthRange(from: string, to: string): string[] {
    const out: string[] = [];
    for (let m = from; m <= to && out.length < 1200; m = shiftMonth(m, 1)) out.push(m);
    return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Rent
// ───────────────────────────────────────────────────────────────────────────

export type IncomeRowForAccrual = Pick<PropertyIncomeRow, "property_id" | "month" | "received_amount" | "energy_portion" | "other_income" | "agency_fee_pct" | "status">
    & Partial<Pick<PropertyIncomeRow, "unit_id" | "unit_name" | "other_expenses" | "condo_amount" | "fee_on_condo" | "condo_direct" | "direct_rent" | "direct_condo" | "direct_energy" | "direct_other">>
    & {
        /** what makes up `direct_other`, by the kind of charge on the paid invoices (IPTU, WATER, GAS, INTERNET, OTHER) */
        direct_other_items?: Array<{ kind: string; amount: number }>;
    };

/** REPASSE: the expense a charge the tenant reimbursed by invoice goes back against. */
const REPASSE_ACCOUNT: Record<string, { key: string; label: string }> = {
    IPTU: { key: "DESP_IPTU", label: "IPTU" },
    WATER: { key: "DESP_UTILIDADES", label: "água" },
    GAS: { key: "DESP_UTILIDADES", label: "gás" },
    INTERNET: { key: "DESP_OUTRAS_IMOVEIS", label: "internet" },
    OTHER: { key: "DESP_OUTRAS_IMOVEIS", label: "outros encargos" },
};

/** `direct_other` split by expense account; what the items do not explain goes to "outras despesas". */
function otherChargesByAccount(row: IncomeRowForAccrual, total: number): Array<{ key: string; amount: number; memo: string }> {
    const byKey = new Map<string, { amount: number; labels: Set<string> }>();
    let explained = 0;
    for (const item of row.direct_other_items ?? []) {
        const amount = round2(Number(item.amount) || 0);
        if (amount <= 0) continue;
        const target = REPASSE_ACCOUNT[item.kind] ?? REPASSE_ACCOUNT.OTHER;
        const cur = byKey.get(target.key) ?? { amount: 0, labels: new Set<string>() };
        cur.amount = round2(cur.amount + amount);
        cur.labels.add(target.label);
        byKey.set(target.key, cur);
        explained = round2(explained + amount);
    }
    const rest = round2(total - explained);
    if (rest !== 0) {
        // never post more or less than the ledger says came in
        const cur = byKey.get("DESP_OUTRAS_IMOVEIS") ?? { amount: 0, labels: new Set<string>() };
        cur.amount = round2(cur.amount + rest);
        cur.labels.add("outros encargos");
        byKey.set("DESP_OUTRAS_IMOVEIS", cur);
    }
    return [...byKey].map(([key, v]) => ({ key, amount: v.amount, memo: `${[...v.labels].join(", ")} pagos pelo inquilino (repasse)` }));
}

export function rentRef(row: { property_id: string; unit_id?: string | null; month: string }): string {
    return `rent:${row.property_id}:${row.unit_id || "-"}:${row.month.slice(0, 7)}`;
}

export interface RentAccrual {
    entry: AutoEntry | null;
    grossRent: number;
    /** energy + condominium + the other charges the tenant paid */
    reimbursements: number;
    /** the row has reimbursements and the policy is not decided: only the rent is posted */
    waitingPolicy: boolean;
    /** the row does not add up (energy above what was received…): nothing is posted */
    invalid: boolean;
}

/** The month's rent of one ledger row (unit or whole property). Nothing when nothing was received. */
export function rentAccrual(row: IncomeRowForAccrual, opts: { propertyName: string; policy: ReimbursementsPolicy | null }): RentAccrual {
    const month = row.month.slice(0, 7);
    const b = breakdown(row);
    const reimbursements = round2(b.energy + b.condoPaid + b.directOther);
    const cameIn = b.direct <= 0 ? "valor repassado pela imobiliária"
        : b.deposit > 0 ? "repasse da imobiliária e faturas pagas pelo inquilino"
            : "faturas pagas pelo inquilino";
    const waitingPolicy = reimbursements > 0 && !opts.policy;
    const none: RentAccrual = { entry: null, grossRent: 0, reimbursements: 0, waitingPolicy: false, invalid: false };
    if (b.received <= 0) return none;
    if (b.netRent < 0 || b.grossRent < 0) return { ...none, reimbursements, invalid: true };

    const tag = { property_id: row.property_id, unit_id: row.unit_id || null };
    const lines: AutoLine[] = [];
    const add = (key: string, side: "D" | "C", value: number, memo: string | null = null) => {
        const v = round2(value);
        if (v > 0) lines.push({ key, debit: side === "D" ? v : 0, credit: side === "C" ? v : 0, ...tag, memo });
    };
    if (waitingPolicy) {
        add("ALUGUEIS_A_RECEBER", "D", b.netRent, "aluguel após a taxa da imobiliária; energia, condomínio e encargos aguardam a política de reembolsos");
        add("DESP_TAXA_ADM", "D", b.rentFee);
        add("RECEITA_ALUGUEL", "C", b.grossRent);
    } else {
        add("ALUGUEIS_A_RECEBER", "D", b.received, cameIn);
        add("DESP_TAXA_ADM", "D", b.feeAmount);
        add("RECEITA_ALUGUEL", "C", b.grossRent);
        if (opts.policy === "RECEITA") add("RECEITA_REEMBOLSOS", "C", reimbursements, b.directOther > 0 ? "energia, condomínio e encargos pagos pelo inquilino" : "energia e condomínio pagos pelo inquilino");
        else if (opts.policy === "REPASSE") {
            add("DESP_UTILIDADES", "C", b.energy, "energia paga pelo inquilino (repasse)");
            add("DESP_CONDOMINIO", "C", b.condoPaid, "condomínio pago pelo inquilino (repasse)");
            if (b.directOther > 0) for (const o of otherChargesByAccount(row, b.directOther)) add(o.key, "C", o.amount, o.memo);
        }
    }
    if (lines.length === 0) return { ...none, reimbursements, waitingPolicy };
    const debit = lines.reduce((s, l) => s + cents(l.debit), 0);
    const credit = lines.reduce((s, l) => s + cents(l.credit), 0);
    if (lines.length < 2 || debit !== credit) return { ...none, reimbursements, waitingPolicy, invalid: true };

    const unit = row.unit_id ? ` · ${row.unit_name || "unidade"}` : "";
    return {
        entry: {
            source: "ACCRUAL",
            source_ref: rentRef(row),
            entry_date: monthEnd(month),
            description: `Aluguel ${formatMonthKey(month)} — ${opts.propertyName}${unit}${row.status === "EXPECTED" ? " (previsto)" : ""}`.slice(0, 300).trim(),
            lines,
        },
        grossRent: b.grossRent,
        reimbursements,
        waitingPolicy,
        invalid: false,
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Late fees on invoices
// ───────────────────────────────────────────────────────────────────────────

export interface PaidInvoiceLateFee {
    id: string;
    number: number;
    property_id: string;
    unit_id: string | null;
    /** `YYYY-MM-DD` */
    paid_on: string;
    /** multa + juros the tenant paid above the invoice's amount */
    late_fee_amount: number;
    /** the card fee passed on to the tenant (paid by card) */
    surcharge_amount?: number;
}

export const lateFeeRef = (invoiceId: string) => `fatura:${invoiceId}:encargos`;
export const cardSurchargeRef = (invoiceId: string) => `fatura:${invoiceId}:tarifa-cartao`;

/**
 * The card fee the tenant paid on top of an invoice paid by card: the owner's processor keeps about
 * the same from the payout, so this is the reimbursement of a charge, posted on the day of the
 * payment (the fee itself reaches the books with the Stripe payout on the bank statement).
 */
export function cardSurchargeEntry(invoice: PaidInvoiceLateFee, propertyName: string): AutoEntry | null {
    const amount = round2(Number(invoice.surcharge_amount) || 0);
    if (amount <= 0) return null;
    const tag = { property_id: invoice.property_id, unit_id: invoice.unit_id || null };
    return {
        source: "ACCRUAL",
        source_ref: cardSurchargeRef(invoice.id),
        entry_date: invoice.paid_on.slice(0, 10),
        description: `Taxa do cartão repassada na fatura nº ${invoice.number} — ${propertyName}`.slice(0, 300),
        lines: [
            { key: "ALUGUEIS_A_RECEBER", debit: amount, credit: 0, ...tag, memo: "taxa do cartão paga pelo inquilino" },
            { key: "RECEITA_REEMBOLSOS", debit: 0, credit: amount, ...tag, memo: null },
        ],
    };
}

/**
 * The late fee and interest a tenant paid on an invoice: financial revenue of the day it was paid.
 * The income ledger never carries it (it is neither rent nor a charge), so it is posted from the invoice.
 */
export function lateFeeEntry(invoice: PaidInvoiceLateFee, propertyName: string): AutoEntry | null {
    const amount = round2(Number(invoice.late_fee_amount) || 0);
    if (amount <= 0) return null;
    const tag = { property_id: invoice.property_id, unit_id: invoice.unit_id || null };
    return {
        source: "ACCRUAL",
        source_ref: lateFeeRef(invoice.id),
        entry_date: invoice.paid_on.slice(0, 10),
        description: `Multa e juros da fatura nº ${invoice.number} — ${propertyName}`.slice(0, 300),
        lines: [
            { key: "ALUGUEIS_A_RECEBER", debit: amount, credit: 0, ...tag, memo: "multa e juros pagos com a fatura" },
            { key: "RECEITA_JUROS_MULTAS", debit: 0, credit: amount, ...tag, memo: null },
        ],
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Depreciation (cost model)
// ───────────────────────────────────────────────────────────────────────────

export interface DepreciationInput {
    month: string;
    usefulLifeYears: number;
    /** buildings + improvements per property ("" = not tied to one), on the first day of the month */
    cost: Map<string, number>;
    /** accumulated depreciation per property (positive), on the same day */
    accumulated: Map<string, number>;
    propertyNames: Map<string, string>;
}

/**
 * Straight line: cost ÷ useful life ÷ 12 per property, never more than what is left to
 * depreciate. Land is not depreciated; an acquisition starts on the month after it is posted
 * (the base is the balance on the first day of the month). Nothing until the life is set.
 */
export function depreciationEntry(input: DepreciationInput): { entry: AutoEntry | null; total: number } {
    const life = Number(input.usefulLifeYears);
    if (!(life > 0)) return { entry: null, total: 0 };
    const name = (k: string) => (k ? input.propertyNames.get(k) ?? "imóvel" : "");
    const keys = [...input.cost.keys()].sort((a, b) => name(a).localeCompare(name(b), "pt-BR"));
    const lines: AutoLine[] = [];
    let total = 0;
    for (const key of keys) {
        const cost = round2(input.cost.get(key) ?? 0);
        if (cost <= 0) continue;
        const monthly = round2(cost / life / 12);
        const left = round2(cost - (input.accumulated.get(key) ?? 0));
        const amount = round2(Math.min(monthly, left));
        if (amount <= 0) continue;
        const property_id = key || null;
        const memo = `${formatMoney(cost)} ÷ ${years(life)} ÷ 12${amount < monthly ? " (saldo final)" : ""}${key ? "" : " — sem imóvel identificado"}`;
        lines.push({ key: "DESP_DEPRECIACAO_PPI", debit: amount, credit: 0, property_id, unit_id: null, memo });
        lines.push({ key: "PPI_DEPRECIACAO_ACUMULADA", debit: 0, credit: amount, property_id, unit_id: null, memo: null });
        total = round2(total + amount);
    }
    if (!lines.length) return { entry: null, total: 0 };
    return {
        entry: {
            source: "DEPRECIATION",
            source_ref: `dep:${input.month}`,
            entry_date: monthEnd(input.month),
            description: `Depreciação ${formatMonthKey(input.month)} — edificações e benfeitorias das propriedades para investimento (${years(life)})`,
            lines,
        },
        total,
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Fair value (CPC 28, December)
// ───────────────────────────────────────────────────────────────────────────

export interface FairValueInput {
    year: number;
    /** carrying amount of the rented properties per property ("" = not tied to one) on 31/12, without this adjustment */
    carrying: Map<string, number>;
    /** the latest valuation of the year, per property */
    valuations: Map<string, { amount: number; valued_on: string }>;
    propertyNames: Map<string, string>;
}

export interface FairValueResult {
    entry: AutoEntry | null;
    gain: number;
    loss: number;
    /** properties on the books with no valuation in the year */
    missing: string[];
    /** carrying amount not tied to a property: cannot be compared with a valuation */
    untagged: number;
}

/** Valuation − carrying amount, per property; gains and losses go to the result (CPC 28 §35). */
export function fairValueEntry(input: FairValueInput): FairValueResult {
    const name = (k: string) => input.propertyNames.get(k) ?? "imóvel";
    const lines: AutoLine[] = [];
    const missing: string[] = [];
    let gain = 0, loss = 0;
    const keys = [...input.carrying.keys()].filter(Boolean).sort((a, b) => name(a).localeCompare(name(b), "pt-BR"));
    for (const key of keys) {
        const carrying = round2(input.carrying.get(key) ?? 0);
        if (carrying === 0) continue;
        const v = input.valuations.get(key);
        if (!v) { missing.push(name(key)); continue; }
        const diff = round2(v.amount - carrying);
        if (diff === 0) continue;
        const memo = `avaliação de ${dateBR(v.valued_on)}: ${formatMoney(v.amount)}; valor contábil ${formatMoney(carrying)}`;
        if (diff > 0) {
            lines.push({ key: "PPI_AJUSTE_VALOR_JUSTO", debit: diff, credit: 0, property_id: key, unit_id: null, memo });
            lines.push({ key: "GANHO_AVJ", debit: 0, credit: diff, property_id: key, unit_id: null, memo: null });
            gain = round2(gain + diff);
        } else {
            lines.push({ key: "PERDA_AVJ", debit: -diff, credit: 0, property_id: key, unit_id: null, memo });
            lines.push({ key: "PPI_AJUSTE_VALOR_JUSTO", debit: 0, credit: -diff, property_id: key, unit_id: null, memo: null });
            loss = round2(loss - diff);
        }
    }
    const untagged = round2(input.carrying.get("") ?? 0);
    return {
        entry: lines.length ? {
            source: "FAIR_VALUE",
            source_ref: `fv:${input.year}`,
            entry_date: `${input.year}-12-31`,
            description: `Ajuste a valor justo ${input.year} — propriedades para investimento (CPC 28)`,
            lines,
        } : null,
        gain, loss, missing, untagged,
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Financing instalments
// ───────────────────────────────────────────────────────────────────────────

export interface FinancingPayment {
    bankRowId: string;
    date: string;
    /** the instalment paid (positive) */
    amount: number;
    propertyId: string | null;
    interest: number;
    /** insurance (MIP/DFI) and fees inside the instalment */
    insurance: number;
}

export function financingRef(bankRowId: string): string {
    return `fin:${bankRowId}`;
}

/** Moves the interest and the insurance/fees of an instalment out of the loan, into expenses. */
export function financingEntry(p: FinancingPayment, propertyName: string | null): AutoEntry | null {
    const paid = round2(Math.abs(p.amount));
    const interest = round2(Math.min(Math.max(0, p.interest), paid));
    const insurance = round2(Math.min(Math.max(0, p.insurance), paid - interest));
    const total = round2(interest + insurance);
    if (total <= 0) return null;
    const tag = { property_id: p.propertyId, unit_id: null };
    const lines: AutoLine[] = [];
    if (interest > 0) lines.push({ key: "DESP_JUROS_FINANCIAMENTO", debit: interest, credit: 0, ...tag, memo: null });
    if (insurance > 0) lines.push({ key: "DESP_FINANCEIRAS_OUTRAS", debit: insurance, credit: 0, ...tag, memo: "seguros (MIP/DFI) e tarifas do financiamento" });
    lines.push({ key: "FINANCIAMENTOS_CP", debit: 0, credit: total, ...tag, memo: `parcela de ${formatMoney(paid)}; amortização ${formatMoney(round2(paid - total))}` });
    return {
        source: "ACCRUAL",
        source_ref: financingRef(p.bankRowId),
        entry_date: p.date,
        description: `Juros e encargos da parcela do financiamento de ${dateBR(p.date)}${propertyName ? ` — ${propertyName}` : ""}`.slice(0, 300).trim(),
        lines,
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Resolving and comparing
// ───────────────────────────────────────────────────────────────────────────

export interface PostableLine {
    account_id: string;
    debit: number;
    credit: number;
    property_id: string | null;
    unit_id: string | null;
    memo: string | null;
}

export interface PostableEntry {
    source: AutoSource;
    source_ref: string;
    entry_date: string;
    description: string;
    lines: PostableLine[];
}

/** An automated entry as stored in the journal. */
export interface StoredEntry extends Omit<PostableEntry, "source"> {
    id: string;
    source: string;
}

type KeyAccount = Pick<AccountingAccount, "id" | "code" | "name" | "analytic" | "active">;

/** System keys → the owner's accounts. An entry whose account is missing or inactive is not posted and says why. */
export function resolveEntries(entries: AutoEntry[], accountsByKey: Map<string, KeyAccount>): { entries: PostableEntry[]; errors: string[] } {
    const out: PostableEntry[] = [];
    const errors: string[] = [];
    for (const e of entries) {
        const lines: PostableLine[] = [];
        let problem: string | null = null;
        for (const l of e.lines) {
            const a = accountsByKey.get(l.key);
            if (!a) { problem = `a conta ${l.key} não existe no plano de contas`; break; }
            if (!a.analytic || !a.active) { problem = `a conta ${a.code} ${a.name} está inativa no plano de contas`; break; }
            lines.push({ account_id: a.id, debit: l.debit, credit: l.credit, property_id: l.property_id, unit_id: l.unit_id, memo: l.memo });
        }
        if (problem) errors.push(`${e.description}: ${problem}`);
        else out.push({ source: e.source, source_ref: e.source_ref, entry_date: e.entry_date, description: e.description, lines });
    }
    return { entries: out, errors };
}

const lineSignature = (l: PostableLine) =>
    [l.account_id, cents(l.debit), cents(l.credit), l.property_id ?? "", (l.unit_id ?? "").trim(), (l.memo ?? "").trim()].join("|");

/** Same date, description and lines (in any order). */
export function sameEntry(a: Pick<PostableEntry, "entry_date" | "description" | "lines">, b: Pick<PostableEntry, "entry_date" | "description" | "lines">): boolean {
    if (a.entry_date !== b.entry_date || a.description.trim() !== b.description.trim() || a.lines.length !== b.lines.length) return false;
    const x = a.lines.map(lineSignature).sort(), y = b.lines.map(lineSignature).sort();
    return x.every((s, i) => s === y[i]);
}

export interface EntryDiff {
    create: PostableEntry[];
    replace: Array<{ id: string; entry: PostableEntry }>;
    remove: StoredEntry[];
    unchanged: number;
}

/** What to do so that `stored` (the automated entries of a period) matches `desired`. */
export function diffEntries(desired: PostableEntry[], stored: StoredEntry[]): EntryDiff {
    const key = (source: string, ref: string) => `${source}|${ref}`;
    const byRef = new Map(stored.filter(s => s.source_ref).map(s => [key(s.source, s.source_ref!), s]));
    const diff: EntryDiff = { create: [], replace: [], remove: [], unchanged: 0 };
    const wanted = new Set<string>();
    for (const d of desired) {
        const k = key(d.source, d.source_ref);
        wanted.add(k);
        const s = byRef.get(k);
        if (!s) diff.create.push(d);
        else if (sameEntry(d, s)) diff.unchanged++;
        else diff.replace.push({ id: s.id, entry: d });
    }
    for (const s of stored) if (s.source_ref && !wanted.has(key(s.source, s.source_ref))) diff.remove.push(s);
    return diff;
}

export function pendingChanges(d: Pick<EntryDiff, "create" | "replace" | "remove">): number {
    return d.create.length + d.replace.length + d.remove.length;
}

// ───────────────────────────────────────────────────────────────────────────
// Closing checklist
// ───────────────────────────────────────────────────────────────────────────

export type CheckLevel = "error" | "warning" | "info" | "ok";

export interface CheckItem {
    id: string;
    level: CheckLevel;
    title: string;
    detail?: string;
    /** page that solves it (path without the language prefix) */
    href?: string;
}

export interface CloseFacts {
    month: string;
    /** today, `YYYY-MM-DD` */
    today: string;
    openingDate: string | null;
    status: "OPEN" | "CLOSED";
    /** months from the start of the books up to the previous one that are still open */
    previousOpen: string[];
    openingPosted: boolean;
    bank: { rows: number; questions: number; ready: number };
    /** the conferência registered for the last day of the month, against today's book balance */
    reconciliation: { asOf: string; statement: number; book: number } | null;
    auto: { create: number; replace: number; remove: number; unchanged: number; errors: string[] };
    rent: { rows: number; entries: number; grossRent: number; expected: number; waitingPolicy: number; invalid: string[] };
    leasesWithoutIncome: string[];
    /** properties with rows per unit and for the whole property in the month */
    mixedRows: string[];
    /** Aluguéis a receber with a credit balance at the end of the month, per property */
    receivablesCredit: Array<{ label: string; balance: number }>;
    measurement: PropertyMeasurement | null;
    policiesDecided: boolean;
    /** depreciation of the month; null when not computed (model not decided or fair value) */
    depreciation: number | null;
    ppi: { depreciable: number; toClassify: number; untagged: number };
    /** only in December under the fair-value model */
    fairValue: { missing: string[]; untagged: number; gain: number; loss: number } | null;
    financing: { reclassified: number; withoutSplit: string[] };
    /** debit balance of the loan accounts at the end of the month (> 0 = the books owe less than nothing) */
    financingDebitBalance: number;
    imob: { cost: number; depreciatedInMonth: boolean };
    revenue: { month: number; average3: number | null };
}

const listOf = (items: string[], max = 4) => (items.length <= max ? items.join("; ") : `${items.slice(0, max).join("; ")} e mais ${items.length - max}`);
const monthBR = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What stands between the month and its closing. Errors block the closing; warnings need the
 * owner to confirm they are aware; info and ok only inform.
 */
export function closeChecklist(f: CloseFacts): CheckItem[] {
    const items: CheckItem[] = [];
    const push = (i: CheckItem) => items.push(i);
    const end = monthEnd(f.month);
    const openingMonth = f.openingDate?.slice(0, 7) ?? null;

    if (!openingMonth) {
        push({ id: "start", level: "error", title: "Início da escrituração não definido", detail: "Escolha, com o contador, o mês em que os livros começam na Kitnets.com.", href: "/contabil/politicas" });
    } else if (f.month < openingMonth) {
        push({ id: "start", level: "error", title: `O mês é anterior ao início da escrituração (${monthBR(openingMonth)})`, detail: "Meses anteriores ficam com o contador anterior: o saldo de abertura resume o que veio antes.", href: "/contabil/politicas" });
    }
    if (f.month >= f.today.slice(0, 7)) {
        push({ id: "finished", level: "error", title: "O mês ainda não terminou", detail: "Dá para conferir e atualizar os lançamentos; o fechamento fica para depois do último dia." });
    }
    if (f.previousOpen.length) {
        push({ id: "previous", level: "error", title: `Feche antes ${f.previousOpen.length === 1 ? "o mês anterior" : "os meses anteriores"}: ${listOf(f.previousOpen.map(monthBR))}`, detail: "Os meses são fechados em ordem: o saldo de cada um é o ponto de partida do seguinte." });
    } else if (openingMonth && f.month > openingMonth) {
        push({ id: "previous", level: "ok", title: "Meses anteriores fechados" });
    }
    if (openingMonth && f.month === openingMonth) {
        push(f.openingPosted
            ? { id: "opening", level: "ok", title: "Saldo de abertura lançado" }
            : { id: "opening", level: "warning", title: "Saldo de abertura não lançado", detail: "Se a holding tinha saldos antes do início (banco, imóveis, financiamentos, capital), lance-os antes de fechar o primeiro mês.", href: "/contabil/saldo-de-abertura" });
    }

    // bank statement
    if (f.bank.rows === 0) {
        push({ id: "bank", level: "warning", title: "Nenhum lançamento de extrato no mês", detail: "Importe o extrato do banco do mês inteiro: é dele que vêm os pagamentos e os recebimentos.", href: "/contabil/contas-bancarias" });
    } else if (f.bank.questions > 0) {
        push({ id: "bank", level: "error", title: `${plural(f.bank.questions, "lançamento do extrato com dúvida", "lançamentos do extrato com dúvida")}`, detail: "Responda o que é cada um: sem isso o mês fica incompleto.", href: "/contabil/conciliacao" });
    } else if (f.bank.ready > 0) {
        push({ id: "bank", level: "info", title: `${plural(f.bank.ready, "lançamento do extrato pronto", "lançamentos do extrato prontos")} para contabilizar`, detail: "Entram ao atualizar ou ao fechar o mês." });
    } else {
        push({ id: "bank", level: "ok", title: `Extrato do mês contabilizado (${plural(f.bank.rows, "lançamento", "lançamentos")})` });
    }
    if (!f.reconciliation) {
        push({ id: "reconciliation", level: "warning", title: `Saldo do banco em ${dateBR(end)} não conferido`, detail: "Informe o saldo do extrato no último dia do mês para conferir com os livros.", href: "/contabil/conciliacao" });
    } else {
        const diff = round2(f.reconciliation.statement - f.reconciliation.book);
        push(diff === 0
            ? { id: "reconciliation", level: "ok", title: `Saldo do banco conferido em ${dateBR(f.reconciliation.asOf)}` }
            : { id: "reconciliation", level: "warning", title: `Diferença de ${formatMoney(diff)} entre o extrato e os livros em ${dateBR(f.reconciliation.asOf)}`, detail: `Extrato ${formatMoney(f.reconciliation.statement)}; livros ${formatMoney(f.reconciliation.book)}. Falta importar algum lançamento, ou o saldo de abertura não bate.`, href: "/contabil/conciliacao" });
    }

    // automated entries
    for (const [i, e] of f.auto.errors.slice(0, 3).entries()) push({ id: `auto-error-${i}`, level: "error", title: "Lançamento automático não gerado", detail: e, href: "/contabil/plano-de-contas" });
    const pending = f.auto.create + f.auto.replace + f.auto.remove;
    if (pending > 0) {
        push(f.status === "CLOSED"
            ? { id: "auto", level: "warning", title: `Os registros mudaram depois do fechamento: ${plural(pending, "lançamento automático difere", "lançamentos automáticos diferem")}`, detail: "Reabra o mês (e os seguintes) para atualizar a competência." }
            : { id: "auto", level: "info", title: `${plural(pending, "lançamento automático", "lançamentos automáticos")} a gerar ou atualizar`, detail: "Entram ao atualizar ou ao fechar o mês." });
    }

    // rent
    if (f.rent.rows === 0) {
        push({ id: "rent", level: "warning", title: "Nenhum aluguel registrado em Receitas no mês", detail: "A receita de aluguéis vem de Receitas de cada imóvel (a competência dos contratos).", href: "/imoveis" });
    } else {
        push({ id: "rent", level: "ok", title: `Aluguéis do mês: ${plural(f.rent.entries, "lançamento", "lançamentos")}, receita bruta ${formatMoney(f.rent.grossRent)}` });
    }
    if (f.rent.waitingPolicy > 0) {
        push({ id: "reimbursements", level: "error", title: "Defina se energia e condomínio pagos pelo inquilino são receita ou repasse", detail: `${plural(f.rent.waitingPolicy, "aluguel tem", "aluguéis têm")} esses valores; até a decisão só o aluguel é lançado.`, href: "/contabil/politicas" });
    }
    if (f.rent.invalid.length) {
        push({ id: "rent-invalid", level: "warning", title: "Registros de Receitas que não fecham (nada lançado)", detail: listOf(f.rent.invalid), href: "/imoveis" });
    }
    if (f.rent.expected > 0) {
        push({ id: "rent-expected", level: "warning", title: `${plural(f.rent.expected, "aluguel ainda está", "aluguéis ainda estão")} como previsto`, detail: "Confirme em Receitas o que foi pago; o previsto também é receita do mês (competência).", href: "/imoveis" });
    }
    if (f.leasesWithoutIncome.length) {
        push({ id: "leases", level: "warning", title: "Contratos em vigor sem aluguel em Receitas", detail: listOf(f.leasesWithoutIncome), href: "/contratos" });
    }
    if (f.mixedRows.length) {
        push({ id: "mixed", level: "warning", title: "Receitas com linhas por unidade e do imóvel inteiro no mesmo mês", detail: `Pode ser o mesmo aluguel duas vezes: ${listOf(f.mixedRows)}.`, href: "/imoveis" });
    }
    if (f.receivablesCredit.length) {
        push({ id: "receivables", level: "warning", title: "Recebido mais do que o registrado em Receitas", detail: `Aluguéis a receber com saldo credor em ${dateBR(end)}: ${listOf(f.receivablesCredit.map(r => `${r.label} ${formatMoney(r.balance)}`))}. Falta o aluguel em Receitas, ou o depósito não é aluguel.`, href: "/contabil/conciliacao" });
    }

    // properties: model, depreciation, fair value
    const hasProperties = f.ppi.depreciable > 0 || f.ppi.toClassify > 0;
    if (hasProperties && (!f.measurement || !f.policiesDecided)) {
        push({ id: "model", level: "warning", title: "Norma e modelo de mensuração dos imóveis a definir", detail: "Sem a decisão registrada do contador, a depreciação (custo) ou o ajuste a valor justo não são lançados.", href: "/contabil/politicas" });
    }
    if (f.depreciation !== null && f.depreciation > 0) push({ id: "depreciation", level: "ok", title: `Depreciação do mês: ${formatMoney(f.depreciation)}` });
    if (f.ppi.toClassify > 0) {
        push({ id: "classify", level: "warning", title: `${formatMoney(f.ppi.toClassify)} em aquisições a classificar (terreno × edificação)`, detail: "O contador separa terreno e edificação com um lançamento manual; sem isso, esse valor não é depreciado.", href: "/contabil/lancamentos" });
    }
    if (f.ppi.untagged !== 0 && !(f.fairValue && f.fairValue.untagged !== 0)) {
        push({ id: "untagged", level: "info", title: `${formatMoney(f.ppi.untagged)} das propriedades para investimento sem imóvel identificado`, detail: "Normalmente o saldo de abertura. Separe por imóvel com um lançamento manual: o ganho de capital numa venda é apurado imóvel a imóvel.", href: "/contabil/lancamentos" });
    }
    if (f.fairValue) {
        if (f.fairValue.missing.length) push({ id: "fv-missing", level: "error", title: "Avaliação do ano faltando para o ajuste a valor justo", detail: `Registre a avaliação de ${listOf(f.fairValue.missing)} (CPC 28: valor justo na data do balanço).`, href: "/imoveis" });
        if (f.fairValue.untagged !== 0) push({ id: "fv-untagged", level: "error", title: `${formatMoney(f.fairValue.untagged)} das propriedades para investimento sem imóvel identificado`, detail: "O valor justo é comparado imóvel a imóvel: separe esse saldo por imóvel com um lançamento manual.", href: "/contabil/lancamentos" });
        if (!f.fairValue.missing.length && f.fairValue.untagged === 0) {
            push({ id: "fv", level: "ok", title: `Ajuste a valor justo: ganho ${formatMoney(f.fairValue.gain)}, perda ${formatMoney(f.fairValue.loss)}` });
        }
    }
    if (f.imob.cost > 0 && !f.imob.depreciatedInMonth) {
        push({ id: "imob", level: "warning", title: "Imobilizado sem depreciação no mês", detail: "A depreciação do imobilizado de uso próprio ainda não é automática: lance-a em Lançamentos.", href: "/contabil/lancamentos" });
    }

    // financing
    if (f.financing.withoutSplit.length) {
        push({ id: "financing", level: "warning", title: "Parcelas de financiamento sem juros separados", detail: `${listOf(f.financing.withoutSplit)}. Enquanto isso, a parcela inteira abate a dívida.`, href: "/imoveis" });
    } else if (f.financing.reclassified > 0) {
        push({ id: "financing", level: "ok", title: `Juros e encargos separados em ${plural(f.financing.reclassified, "parcela", "parcelas")} de financiamento` });
    }
    if (f.financingDebitBalance > 0) {
        push({ id: "financing-balance", level: "warning", title: `Financiamentos com saldo devedor de ${formatMoney(f.financingDebitBalance)}`, detail: "Pago mais do que a dívida registrada: falta o saldo do financiamento no saldo de abertura (ou a contratação).", href: "/contabil/saldo-de-abertura" });
    }

    if (f.revenue.average3 && f.revenue.average3 > 0) {
        const change = (f.revenue.month - f.revenue.average3) / f.revenue.average3;
        if (Math.abs(change) > 0.25) {
            push({ id: "revenue", level: "info", title: `Receita de aluguéis ${Math.round(Math.abs(change) * 100)}% ${change > 0 ? "acima" : "abaixo"} da média dos 3 meses anteriores`, detail: `${formatMoney(f.revenue.month)} no mês; média ${formatMoney(f.revenue.average3)}. Confira reajustes, vagas e aluguéis faltando.` });
        }
    }
    return items;
}

const LEVEL_ORDER: Record<CheckLevel, number> = { error: 0, warning: 1, info: 2, ok: 3 };

export function sortChecklist(items: CheckItem[]): CheckItem[] {
    return [...items].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export function checklistSummary(items: CheckItem[]): { errors: number; warnings: number; canClose: boolean } {
    const errors = items.filter(i => i.level === "error").length;
    const warnings = items.filter(i => i.level === "warning").length;
    return { errors, warnings, canClose: errors === 0 };
}
