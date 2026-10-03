/**
 * Competência e fechamento do mês (Contábil & Fiscal, Etapa 3) — server part.
 *
 * Loads what the month's automated entries come from (Receitas, the balances of the rented
 * properties, the valuations, the financing instalments paid from the bank), keeps those
 * entries in step with the records while the month is open (lib/accounting-accruals.ts),
 * builds the closing checklist, and closes / reopens months in order. Every query is scoped
 * to the owner.
 */
import type { AdminSupabase } from "./api-auth";
import type { AccountingAccount } from "./accounting-chart";
import { AUTO_SOURCES, formatMoney, monthStart, postingErrorMessage, type AccountingPeriod } from "./accounting-journal";
import type { AccountingSettings } from "./accounting-policies";
import {
    cardSurchargeEntry, checklistSummary, closeChecklist, depreciationEntry, diffEntries, fairValueEntry, financingEntry, lateFeeEntry, monthEnd, monthRange,
    pendingChanges, rentAccrual, resolveEntries, shiftMonth, sortChecklist,
    type AutoEntry, type CheckItem, type CloseFacts, type EntryDiff, type FinancingPayment, type IncomeRowForAccrual, type PaidInvoiceLateFee, type PostableEntry, type StoredEntry,
} from "./accounting-accruals";
import { bankBookBalance, bankContext, loadBankRowsForPosting, postBankRows, postedBankEntries, viewRows } from "./accounting-bank-server";
import { buildTrialBalance, type AccountSums, type TrialBalanceRow } from "./accounting-reports";
import { chunk, closedMonths, ensureChart, fetchAllPages, loadPeriods, loadSettings } from "./accounting-server";
import { INCOME_DIRECT_COLUMNS, round2 } from "./property-income";
import { estimateFinancingSplits, type PropertyInvestment, type PropertyTransaction } from "./property-investment";

const AUTO_AUTHOR = "Automação (competência)";
const LOAN_KINDS = ["PRESTACAO", "AMORTIZACAO", "QUITACAO"] as const;
const PPI_KEYS = ["PPI_TERRENOS", "PPI_EDIFICACOES", "PPI_BENFEITORIAS", "PPI_EM_ANDAMENTO", "PPI_DEPRECIACAO_ACUMULADA", "PPI_AJUSTE_VALOR_JUSTO", "PPI_A_CLASSIFICAR"] as const;
/** gross cost of the rented properties (what a property tag is needed for) */
const PPI_COST_KEYS = ["PPI_TERRENOS", "PPI_EDIFICACOES", "PPI_BENFEITORIAS", "PPI_EM_ANDAMENTO", "PPI_A_CLASSIFICAR"] as const;
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const todayIso = () => new Date().toISOString().slice(0, 10);

export interface CloseContext {
    ownerId: string;
    settings: AccountingSettings;
    accounts: AccountingAccount[];
    byKey: Map<string, AccountingAccount>;
    periods: AccountingPeriod[];
    closed: Set<string>;
    propertyNames: Map<string, string>;
}

export async function closeContext(supabase: AdminSupabase, ownerId: string): Promise<CloseContext> {
    const { settings } = await loadSettings(supabase, ownerId);
    const [accounts, periods, props] = await Promise.all([
        ensureChart(supabase, ownerId, settings.property_measurement),
        loadPeriods(supabase, ownerId),
        supabase.from("properties").select("id, name").eq("owner_id", ownerId),
    ]);
    if (props.error) throw new Error(props.error.message);
    return {
        ownerId,
        settings,
        accounts,
        byKey: new Map(accounts.filter(a => a.system_key).map(a => [a.system_key!, a])),
        periods,
        closed: closedMonths(periods),
        propertyNames: new Map(((props.data ?? []) as Array<{ id: string; name: string | null }>).map(p => [p.id, p.name || "Imóvel"])),
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Loaders
// ───────────────────────────────────────────────────────────────────────────

const INCOME_COLUMNS = `property_id, month, unit_id, unit_name, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, agency_fee_pct, status, ${INCOME_DIRECT_COLUMNS}`;

/** Charges paid by invoice that are neither rent, condominium nor energy: the ledger adds them into one figure, the books want them by kind. */
const OWN_COLUMN_KINDS = new Set(["RENT", "CONDOMINIUM", "ELECTRICITY"]);

/** `property|unit` → the other charges (IPTU, water, gas, internet…) on the invoices of the month that were paid. */
async function loadOtherChargeItems(supabase: AdminSupabase, ownerId: string, month: string): Promise<Map<string, Array<{ kind: string; amount: number }>>> {
    const invoices = await fetchAllPages<{ property_id: string; unit_id: string | null; invoice_items: Array<{ kind: string; amount: number | string }> | null }>((a, b) =>
        supabase.from("invoices").select("property_id, unit_id, invoice_items(kind, amount)")
            .eq("owner_id", ownerId).eq("reference_month", monthStart(month)).eq("status", "PAID").order("id").range(a, b));
    const out = new Map<string, Array<{ kind: string; amount: number }>>();
    for (const invoice of invoices) {
        const key = `${invoice.property_id}|${invoice.unit_id ?? ""}`;
        for (const item of invoice.invoice_items ?? []) {
            if (OWN_COLUMN_KINDS.has(item.kind)) continue;
            out.set(key, [...(out.get(key) ?? []), { kind: item.kind, amount: Number(item.amount) || 0 }]);
        }
    }
    return out;
}

/** Invoices paid in [from, to] with a late fee or a card fee passed on: revenue of the day they were paid. */
async function loadLateFees(supabase: AdminSupabase, ownerId: string, from: string, to: string): Promise<PaidInvoiceLateFee[]> {
    const rows = await fetchAllPages<Record<string, unknown>>((a, b) =>
        supabase.from("invoices").select("id, number, property_id, unit_id, paid_on, late_fee_amount, surcharge_amount")
            .eq("owner_id", ownerId).eq("status", "PAID").or("late_fee_amount.gt.0,surcharge_amount.gt.0").gte("paid_on", from).lte("paid_on", to).order("number").range(a, b));
    return rows.map(r => ({
        id: String(r.id), number: Number(r.number) || 0, property_id: String(r.property_id), unit_id: (r.unit_id as string | null) ?? null,
        paid_on: String(r.paid_on).slice(0, 10), late_fee_amount: Number(r.late_fee_amount) || 0, surcharge_amount: Number(r.surcharge_amount) || 0,
    }));
}

async function loadIncomeRows(supabase: AdminSupabase, ownerId: string, month: string): Promise<IncomeRowForAccrual[]> {
    const [rows, otherCharges] = await Promise.all([
        fetchAllPages<Record<string, unknown>>((a, b) => supabase.from("property_income_months").select(INCOME_COLUMNS)
            .eq("owner_id", ownerId).eq("month", monthStart(month)).order("property_id").order("unit_id", { nullsFirst: true }).range(a, b)),
        loadOtherChargeItems(supabase, ownerId, month),
    ]);
    const n = (v: unknown) => Number(v) || 0;
    return rows.map(r => ({
        condo_direct: r.condo_direct === true,
        direct_rent: n(r.direct_rent),
        direct_condo: n(r.direct_condo),
        direct_energy: n(r.direct_energy),
        direct_other: n(r.direct_other),
        direct_other_items: otherCharges.get(`${String(r.property_id)}|${(r.unit_id as string | null) ?? ""}`) ?? [],
        property_id: String(r.property_id),
        month: String(r.month),
        unit_id: (r.unit_id as string | null) ?? null,
        unit_name: (r.unit_name as string | null) ?? null,
        received_amount: n(r.received_amount),
        energy_portion: n(r.energy_portion),
        other_income: n(r.other_income),
        other_expenses: n(r.other_expenses),
        condo_amount: n(r.condo_amount),
        fee_on_condo: Boolean(r.fee_on_condo),
        agency_fee_pct: n(r.agency_fee_pct),
        status: r.status === "EXPECTED" ? "EXPECTED" : "CONFIRMED",
    }));
}

type RawLine = { account_id: string; debit: number | string; credit: number | string; property_id: string | null; unit_id: string | null; memo: string | null; line_no?: number };
type RawEntry = { id: string; source: string; source_ref: string | null; entry_date: string; description: string; journal_lines: RawLine[] };

const toLines = (lines: RawLine[]) => (lines ?? [])
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map(l => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, property_id: l.property_id, unit_id: l.unit_id, memo: l.memo }));

/** The automated entries dated in [from, to]. */
async function loadStoredAuto(supabase: AdminSupabase, ownerId: string, from: string, to: string): Promise<StoredEntry[]> {
    const data = await fetchAllPages<RawEntry>((a, b) => supabase.from("journal_entries")
        .select("id, source, source_ref, entry_date, description, journal_lines(account_id, debit, credit, property_id, unit_id, memo, line_no)")
        .eq("owner_id", ownerId).in("source", [...AUTO_SOURCES]).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b));
    return data.map(e => ({ id: e.id, source: e.source, source_ref: e.source_ref ?? "", entry_date: e.entry_date, description: e.description, lines: toLines(e.journal_lines) }));
}

/** Balance per account and property tag ("" = none) up to `asOf`, summed in the database. */
export async function balancesByProperty(supabase: AdminSupabase, ownerId: string, asOf: string, accountIds: string[]): Promise<Array<{ account_id: string; key: string; balance: number }>> {
    if (!accountIds.length) return [];
    const { data, error } = await supabase.rpc("accounting_balances_by_property", { p_owner: ownerId, p_as_of: asOf, p_accounts: accountIds });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ account_id: string; property_id: string | null; balance: number | string }>)
        .map(r => ({ account_id: r.account_id, key: r.property_id ?? "", balance: Number(r.balance) || 0 }));
}

/** Per analytic account: balance before `from`, debits and credits in [from, to]. */
export async function accountSums(supabase: AdminSupabase, ownerId: string, from: string, to: string): Promise<AccountSums[]> {
    const { data, error } = await supabase.rpc("accounting_trial_balance", { p_owner: ownerId, p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ account_id: string; opening: number | string; debit: number | string; credit: number | string }>)
        .map(r => ({ account_id: r.account_id, opening: Number(r.opening) || 0, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 }));
}

export async function trialBalance(supabase: AdminSupabase, ownerId: string, accounts: AccountingAccount[], from: string, to: string): Promise<TrialBalanceRow[]> {
    return buildTrialBalance(accounts, await accountSums(supabase, ownerId, from, to));
}

const idsOf = (ctx: CloseContext, keys: readonly string[]) => keys.map(k => ctx.byKey.get(k)?.id).filter((x): x is string => Boolean(x));

// ───────────────────────────────────────────────────────────────────────────
// Financing instalments paid from the bank
// ───────────────────────────────────────────────────────────────────────────

type TxRaw = Omit<PropertyTransaction, "amount" | "interest_part" | "principal_part" | "insurance_part"> & { amount: number | string; interest_part: number | string | null; principal_part: number | string | null; insurance_part: number | string | null };
const TX_COLUMNS = "id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference, created_at";
const part = (v: number | string | null) => (v === null || v === undefined ? null : Number(v) || 0);
const toTx = (t: TxRaw): PropertyTransaction => ({ ...t, amount: Number(t.amount) || 0, interest_part: part(t.interest_part), principal_part: part(t.principal_part), insurance_part: part(t.insurance_part) });

/**
 * BANK entries of the period that debit the loan, with the interest and insurance of each
 * instalment: the split stored on the linked investment row, or the estimate from the contract
 * terms (lib/property-investment.ts). An instalment with neither is reported.
 */
async function financingPayments(supabase: AdminSupabase, ctx: CloseContext, from: string, to: string): Promise<{ payments: FinancingPayment[]; withoutSplit: string[] }> {
    const loan = ctx.byKey.get("FINANCIAMENTOS_CP")?.id;
    if (!loan) return { payments: [], withoutSplit: [] };
    const bankEntries = await fetchAllPages<{ id: string; source_ref: string | null; entry_date: string; journal_lines: Array<{ account_id: string; debit: number | string }> }>((a, b) => supabase.from("journal_entries")
        .select("id, source_ref, entry_date, journal_lines(account_id, debit)")
        .eq("owner_id", ctx.ownerId).eq("source", "BANK").gte("entry_date", from).lte("entry_date", to).order("id").range(a, b));
    const paid = bankEntries
        .map(e => ({ rowId: e.source_ref ?? "", date: e.entry_date, amount: round2((e.journal_lines ?? []).filter(l => l.account_id === loan).reduce((s, l) => s + (Number(l.debit) || 0), 0)) }))
        .filter(p => p.rowId && p.amount > 0);
    if (!paid.length) return { payments: [], withoutSplit: [] };

    type BankRow = { id: string; memo: string; occurred_on: string; destination: string; kind: string | null; linked_id: string | null; property_id: string | null };
    const rows = new Map<string, BankRow>();
    for (const ids of chunk(paid.map(p => p.rowId))) {
        const { data, error } = await supabase.from("bank_transactions").select("id, memo, occurred_on, destination, kind, linked_id, property_id").eq("owner_id", ctx.ownerId).in("id", ids);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as BankRow[]) rows.set(r.id, r);
    }
    const linkedIds = [...rows.values()].filter(r => r.linked_id && r.destination === "INVESTMENT" && (LOAN_KINDS as readonly string[]).includes(r.kind ?? "")).map(r => r.linked_id!);
    const linked = new Map<string, PropertyTransaction>();
    for (const ids of chunk(linkedIds)) {
        const { data, error } = await supabase.from("property_transactions").select(TX_COLUMNS).eq("owner_id", ctx.ownerId).in("id", ids);
        if (error) throw new Error(error.message);
        for (const t of (data ?? []) as TxRaw[]) linked.set(t.id, toTx(t));
    }

    // the estimate walks the whole loan of each property
    const needEstimate = [...new Set([...linked.values()].filter(t => t.interest_part === null && t.insurance_part === null).map(t => t.property_id))];
    const estimates = new Map<string, Map<string, { interest: number; insurance: number }>>();
    if (needEstimate.length) {
        const [txs, invs] = await Promise.all([
            fetchAllPages<TxRaw>((a, b) => supabase.from("property_transactions").select(TX_COLUMNS).eq("owner_id", ctx.ownerId)
                .in("property_id", needEstimate).in("kind", [...LOAN_KINDS]).order("occurred_on").order("id").range(a, b)),
            supabase.from("property_investments").select("*").eq("owner_id", ctx.ownerId).in("property_id", needEstimate),
        ]);
        if (invs.error) throw new Error(invs.error.message);
        const invBy = new Map(((invs.data ?? []) as PropertyInvestment[]).map(i => [i.property_id, {
            ...i, purchase_price: Number(i.purchase_price) || 0, principal: i.principal === null ? null : Number(i.principal),
            annual_rate: i.annual_rate === null ? null : Number(i.annual_rate), term_months: i.term_months === null ? null : Number(i.term_months),
        } as PropertyInvestment]));
        for (const pid of needEstimate) {
            const est = estimateFinancingSplits(invBy.get(pid) ?? null, txs.filter(t => t.property_id === pid).map(toTx));
            estimates.set(pid, new Map(est.splits.map(s => [s.id, { interest: s.interest_part, insurance: s.insurance_part }])));
        }
    }

    const payments: FinancingPayment[] = [];
    const withoutSplit: string[] = [];
    for (const p of paid) {
        const row = rows.get(p.rowId);
        const label = `${dateBR(p.date)} ${formatMoney(p.amount)}${row?.memo ? ` (${row.memo.replace(/\s+/g, " ").trim().slice(0, 40)})` : ""}`;
        const tx = row?.linked_id ? linked.get(row.linked_id) : undefined;
        if (!tx) { withoutSplit.push(`${label}: sem vínculo com o financiamento de um imóvel`); continue; }
        let split: { interest: number; insurance: number } | undefined;
        if (tx.interest_part !== null || tx.insurance_part !== null) split = { interest: tx.interest_part ?? 0, insurance: tx.insurance_part ?? 0 };
        else split = estimates.get(tx.property_id)?.get(tx.id);
        if (!split) { withoutSplit.push(`${label}: preencha valor financiado, juros e prazo do financiamento de ${ctx.propertyNames.get(tx.property_id) ?? "imóvel"}`); continue; }
        payments.push({ bankRowId: p.rowId, date: p.date, amount: p.amount, propertyId: tx.property_id, interest: split.interest, insurance: split.insurance });
    }
    return { payments, withoutSplit };
}

// ───────────────────────────────────────────────────────────────────────────
// The month's automated entries
// ───────────────────────────────────────────────────────────────────────────

export interface MonthComputation {
    month: string;
    desired: PostableEntry[];
    stored: StoredEntry[];
    diff: EntryDiff;
    errors: string[];
    incomeRows: IncomeRowForAccrual[];
    rent: CloseFacts["rent"];
    depreciation: number | null;
    ppi: CloseFacts["ppi"];
    fairValue: CloseFacts["fairValue"];
    financing: CloseFacts["financing"];
}

export async function computeMonth(supabase: AdminSupabase, ctx: CloseContext, month: string): Promise<MonthComputation> {
    const from = monthStart(month), to = monthEnd(month);
    const s = ctx.settings;
    const decided = Boolean(s.policies_decided_on);
    const ppiIds = idsOf(ctx, PPI_KEYS);
    const auto: AutoEntry[] = [];

    const [incomeRows, stored, atStart, fin, lateFees] = await Promise.all([
        loadIncomeRows(supabase, ctx.ownerId, month),
        loadStoredAuto(supabase, ctx.ownerId, from, to),
        balancesByProperty(supabase, ctx.ownerId, from, ppiIds),
        financingPayments(supabase, ctx, from, to),
        loadLateFees(supabase, ctx.ownerId, from, to),
    ]);

    // rent by competência
    const rent: CloseFacts["rent"] = { rows: incomeRows.length, entries: 0, grossRent: 0, expected: 0, waitingPolicy: 0, invalid: [] };
    for (const row of incomeRows) {
        const name = ctx.propertyNames.get(row.property_id) ?? "Imóvel";
        const r = rentAccrual(row, { propertyName: name, policy: s.reimbursements_policy });
        if (r.invalid) rent.invalid.push(`${name}${row.unit_name ? ` · ${row.unit_name}` : ""}`);
        if (r.waitingPolicy) rent.waitingPolicy++;
        if (!r.entry) continue;
        auto.push(r.entry);
        rent.entries++;
        rent.grossRent = round2(rent.grossRent + r.grossRent);
        if (row.status === "EXPECTED") rent.expected++;
    }

    // the late fee and interest tenants paid on their invoices, and the card fee passed on (the ledger never carries them)
    for (const invoice of lateFees) {
        const name = ctx.propertyNames.get(invoice.property_id) ?? "Imóvel";
        const e = lateFeeEntry(invoice, name);
        if (e) auto.push(e);
        const s = cardSurchargeEntry(invoice, name);
        if (s) auto.push(s);
    }

    // the rented properties on the first day of the month
    const sumWhere = (rows: typeof atStart, keys: readonly string[], byKey = false) => {
        const want = new Set(idsOf(ctx, keys));
        const out = new Map<string, number>();
        let total = 0;
        for (const r of rows) {
            if (!want.has(r.account_id)) continue;
            total += r.balance;
            if (byKey) out.set(r.key, round2((out.get(r.key) ?? 0) + r.balance));
        }
        return { total: round2(total), byProperty: out };
    };
    const ppi: CloseFacts["ppi"] = {
        depreciable: sumWhere(atStart, ["PPI_EDIFICACOES", "PPI_BENFEITORIAS"]).total,
        toClassify: sumWhere(atStart, ["PPI_A_CLASSIFICAR"]).total,
        untagged: round2(atStart.filter(r => !r.key && idsOf(ctx, PPI_COST_KEYS).includes(r.account_id)).reduce((t, r) => t + r.balance, 0)),
    };

    let depreciation: number | null = null;
    if (s.property_measurement === "COST" && decided) {
        const cost = sumWhere(atStart, ["PPI_EDIFICACOES", "PPI_BENFEITORIAS"], true).byProperty;
        const acc = sumWhere(atStart, ["PPI_DEPRECIACAO_ACUMULADA"], true).byProperty;
        const accumulated = new Map([...acc].map(([k, v]) => [k, -v]));   // credit balance → positive
        const dep = depreciationEntry({ month, usefulLifeYears: s.building_useful_life_years, cost, accumulated, propertyNames: ctx.propertyNames });
        if (dep.entry) auto.push(dep.entry);
        depreciation = dep.total;
    }

    let fairValue: CloseFacts["fairValue"] = null;
    if (s.property_measurement === "FAIR_VALUE" && decided && month.endsWith("-12")) {
        const year = Number(month.slice(0, 4));
        const [atEnd, vals] = await Promise.all([
            balancesByProperty(supabase, ctx.ownerId, to, ppiIds),
            supabase.from("property_valuations").select("property_id, valued_on, amount").eq("owner_id", ctx.ownerId)
                .gte("valued_on", `${year}-01-01`).lte("valued_on", `${year}-12-31`).order("valued_on", { ascending: false }),
        ]);
        if (vals.error) throw new Error(vals.error.message);
        const carrying = sumWhere(atEnd, PPI_KEYS, true).byProperty;
        // the balances on 31/12 already hold this year's adjustment, if it was posted: take it out
        const ppiSet = new Set(ppiIds);
        for (const e of stored.filter(x => x.source === "FAIR_VALUE")) {
            for (const l of e.lines) if (ppiSet.has(l.account_id)) carrying.set(l.property_id ?? "", round2((carrying.get(l.property_id ?? "") ?? 0) - (l.debit - l.credit)));
        }
        const valuations = new Map<string, { amount: number; valued_on: string }>();
        for (const v of (vals.data ?? []) as Array<{ property_id: string; valued_on: string; amount: number | string }>) {
            if (!valuations.has(v.property_id)) valuations.set(v.property_id, { amount: Number(v.amount) || 0, valued_on: v.valued_on });
        }
        const fv = fairValueEntry({ year, carrying, valuations, propertyNames: ctx.propertyNames });
        if (fv.entry) auto.push(fv.entry);
        fairValue = { missing: fv.missing, untagged: fv.untagged, gain: fv.gain, loss: fv.loss };
    }

    for (const p of fin.payments) {
        const e = financingEntry(p, p.propertyId ? ctx.propertyNames.get(p.propertyId) ?? null : null);
        if (e) auto.push(e);
    }

    const resolved = resolveEntries(auto, ctx.byKey);
    return {
        month,
        desired: resolved.entries,
        stored,
        diff: diffEntries(resolved.entries, stored),
        errors: resolved.errors,
        incomeRows,
        rent,
        depreciation,
        ppi,
        fairValue,
        financing: { reclassified: fin.payments.length, withoutSplit: fin.withoutSplit },
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Keeping the month in step
// ───────────────────────────────────────────────────────────────────────────

export interface SyncResult {
    month: string;
    created: number;
    replaced: number;
    removed: number;
    unchanged: number;
    errors: string[];
    /** why nothing was done */
    skipped: "NO_START" | "BEFORE_OPENING" | "FUTURE" | "CLOSED" | null;
}

async function applyDiff(supabase: AdminSupabase, ownerId: string, diff: EntryDiff): Promise<Pick<SyncResult, "created" | "replaced" | "removed" | "errors">> {
    const out = { created: 0, replaced: 0, removed: 0, errors: [] as string[] };
    for (const s of diff.remove) {
        const { error } = await supabase.from("journal_entries").delete().eq("id", s.id).eq("owner_id", ownerId);
        if (error) out.errors.push(`${s.description}: ${postingErrorMessage(error.message)}`);
        else out.removed++;
    }
    const jobs = [...diff.create.map(entry => ({ old: null as string | null, entry })), ...diff.replace.map(r => ({ old: r.id, entry: r.entry }))];
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const { old, entry } = jobs[next++];
            const { error } = await supabase.rpc("accounting_replace_entry", {
                p_owner: ownerId,
                p_old: old,
                p_entry: { entry_date: entry.entry_date, description: entry.description, source: entry.source, source_ref: entry.source_ref, created_by: AUTO_AUTHOR },
                p_lines: entry.lines,
            });
            if (!error) { if (old) out.replaced++; else out.created++; continue; }
            if (!old && /journal_entries_owner_source_ref/.test(error.message)) continue;   // created by a concurrent run
            out.errors.push(`${entry.description}: ${postingErrorMessage(error.message)}`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
    return out;
}

function skipReason(ctx: CloseContext, month: string): SyncResult["skipped"] {
    const start = ctx.settings.opening_date?.slice(0, 7);
    if (!start) return "NO_START";
    if (month < start) return "BEFORE_OPENING";
    if (month > todayIso().slice(0, 7)) return "FUTURE";
    if (ctx.closed.has(month)) return "CLOSED";
    return null;
}

const emptySync = (month: string, skipped: SyncResult["skipped"]): SyncResult => ({ month, created: 0, replaced: 0, removed: 0, unchanged: 0, errors: [], skipped });

/** Brings the automated entries of an open month in step with the records. `postBank`: post the month's ready bank rows first. */
export async function syncMonth(supabase: AdminSupabase, ctx: CloseContext, month: string, opts: { postBank?: boolean } = {}): Promise<SyncResult> {
    const skipped = skipReason(ctx, month);
    if (skipped) return emptySync(month, skipped);
    const errors: string[] = [];
    if (opts.postBank !== false) {
        // the financing split reads the bank entries: the month's statement goes in first
        const ids = await fetchAllPages<{ id: string }>((a, b) => supabase.from("bank_transactions").select("id").eq("owner_id", ctx.ownerId)
            .gte("occurred_on", monthStart(month)).lte("occurred_on", monthEnd(month)).order("id").range(a, b));
        if (ids.length) errors.push(...(await postBankRows(supabase, ctx.ownerId, { ids: ids.map(r => r.id) })).errors);
    }
    const comp = await computeMonth(supabase, ctx, month);
    const applied = await applyDiff(supabase, ctx.ownerId, comp.diff);
    return { month, ...applied, unchanged: comp.diff.unchanged, errors: [...errors, ...comp.errors, ...applied.errors], skipped: null };
}

/** Every open month from the start of the books to the current one, in order (depreciation reads the previous months). */
export async function syncOpenMonths(supabase: AdminSupabase, ctx: CloseContext): Promise<SyncResult[]> {
    const start = ctx.settings.opening_date?.slice(0, 7);
    if (!start) return [];
    const bank = await postBankRows(supabase, ctx.ownerId);
    const out: SyncResult[] = [];
    for (const m of monthRange(start, todayIso().slice(0, 7))) {
        if (ctx.closed.has(m)) continue;
        out.push(await syncMonth(supabase, ctx, m, { postBank: false }));
    }
    if (bank.errors.length && out.length) out[0].errors.unshift(...bank.errors);
    return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Checklist and status of a month
// ───────────────────────────────────────────────────────────────────────────

export interface MonthStatus {
    month: string;
    status: "OPEN" | "CLOSED";
    period: AccountingPeriod | null;
    items: CheckItem[];
    summary: { errors: number; warnings: number; canClose: boolean };
    automated: {
        rentEntries: number;
        grossRent: number;
        depreciation: number | null;
        fairValue: CloseFacts["fairValue"];
        financing: number;
        pending: number;
        errors: string[];
    };
    /** revenue, expenses and result of the month from the books */
    result: { revenue: number; expenses: number; net: number };
}

type LeaseRow = { property_id: string | null; unit_id: string | null; unit_name: string | null; start_date: string | null; end_date: string | null; termination_date: string | null; status: string };

/** In force in the month: started, not terminated before it; an ACTIVE lease past its term is renewed. */
function leaseInForce(l: LeaseRow, from: string, to: string): boolean {
    if (l.status === "DRAFT" || l.status === "CANCELLED") return false;
    if (!l.start_date || l.start_date > to) return false;
    if (l.termination_date) return l.termination_date >= from;
    if (l.status === "EXPIRED" || l.status === "TERMINATED") return Boolean(l.end_date && l.end_date >= from);
    return true;
}

export async function monthStatus(supabase: AdminSupabase, ctx: CloseContext, month: string, computed?: MonthComputation): Promise<MonthStatus> {
    const from = monthStart(month), to = monthEnd(month);
    const comp = computed ?? await computeMonth(supabase, ctx, month);
    const period = ctx.periods.find(p => p.month.slice(0, 7) === month) ?? null;
    const status = ctx.closed.has(month) ? "CLOSED" : "OPEN";
    const openingMonth = ctx.settings.opening_date?.slice(0, 7) ?? null;
    const bank = ctx.byKey.get("BANCOS");
    const receivable = ctx.byKey.get("ALUGUEIS_A_RECEBER");
    const prev3From = monthStart(shiftMonth(month, -3)), prev3To = monthEnd(shiftMonth(month, -1));

    const [bankCtx, rows, rec, book, opening, leases, receivables, sums, prevSums] = await Promise.all([
        bankContext(supabase, ctx.ownerId),
        fetchAllPages<{ id: string }>((a, b) => supabase.from("bank_transactions").select("id").eq("owner_id", ctx.ownerId).gte("occurred_on", from).lte("occurred_on", to).order("id").range(a, b)),
        supabase.from("bank_reconciliations").select("as_of, statement_balance").eq("owner_id", ctx.ownerId).eq("as_of", to).maybeSingle(),
        bank ? bankBookBalance(supabase, ctx.ownerId, bank.id, to) : Promise.resolve(0),
        openingMonth === month
            ? supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("owner_id", ctx.ownerId).eq("source", "OPENING")
            : Promise.resolve({ count: 0 }),
        supabase.from("leases").select("property_id, unit_id, unit_name, start_date, end_date, termination_date, status").eq("user_id", ctx.ownerId).is("deleted_at", null).lte("start_date", to),
        receivable ? balancesByProperty(supabase, ctx.ownerId, to, [receivable.id]) : Promise.resolve([]),
        accountSums(supabase, ctx.ownerId, from, to),
        openingMonth && shiftMonth(month, -3) >= openingMonth ? accountSums(supabase, ctx.ownerId, prev3From, prev3To) : Promise.resolve(null),
    ]);

    // bank rows of the month as the posting engine sees them
    const bankRows = rows.length ? await loadBankRowsForPosting(supabase, ctx.ownerId, rows.map(r => r.id)) : [];
    const posted = bankRows.length ? await postedBankEntries(supabase, ctx.ownerId, bankCtx.bankAccountId, bankRows.map(r => r.id)) : new Map();
    const views = viewRows(bankRows, posted, bankCtx);

    // leases in force with no row in Receitas
    const withRows = new Set<string>(), wholeProperty = new Set<string>(), anyRow = new Set<string>();
    const unitRows = new Set<string>();
    for (const r of comp.incomeRows) {
        anyRow.add(r.property_id);
        if (r.unit_id) { withRows.add(`${r.property_id}|${r.unit_id}`); unitRows.add(r.property_id); } else wholeProperty.add(r.property_id);
    }
    const leasesWithoutIncome: string[] = [];
    const seen = new Set<string>();
    for (const l of ((leases.data ?? []) as LeaseRow[])) {
        if (!l.property_id || !leaseInForce(l, from, to)) continue;
        const covered = l.unit_id ? withRows.has(`${l.property_id}|${l.unit_id}`) || wholeProperty.has(l.property_id) : anyRow.has(l.property_id);
        const label = `${ctx.propertyNames.get(l.property_id) ?? "Imóvel"}${l.unit_name ? ` · ${l.unit_name}` : ""}`;
        if (!covered && !seen.has(label)) { seen.add(label); leasesWithoutIncome.push(label); }
    }
    const mixedRows = [...unitRows].filter(p => wholeProperty.has(p)).map(p => ctx.propertyNames.get(p) ?? "Imóvel");

    const receivablesCredit = (receivables as Array<{ key: string; balance: number }>)
        .filter(r => r.balance < -0.004)
        .map(r => ({ label: r.key ? ctx.propertyNames.get(r.key) ?? "Imóvel" : "sem imóvel", balance: round2(-r.balance) }));

    const byId = new Map(sums.map(s => [s.account_id, s]));
    const closing = (key: string) => { const x = byId.get(ctx.byKey.get(key)?.id ?? ""); return x ? round2(x.opening + x.debit - x.credit) : 0; };
    const moved = (key: string) => { const x = byId.get(ctx.byKey.get(key)?.id ?? ""); return x ? round2(x.debit + x.credit) : 0; };
    const loanBalance = round2(closing("FINANCIAMENTOS_CP") + closing("FINANCIAMENTOS_LP"));
    const rentId = ctx.byKey.get("RECEITA_ALUGUEL")?.id ?? "";
    const prevRent = prevSums ? prevSums.find(x => x.account_id === rentId) : undefined;

    const facts: CloseFacts = {
        month,
        today: todayIso(),
        openingDate: ctx.settings.opening_date,
        status,
        previousOpen: openingMonth ? monthRange(openingMonth, shiftMonth(month, -1)).filter(m => !ctx.closed.has(m)) : [],
        openingPosted: ((opening as { count: number | null }).count ?? 0) > 0,
        bank: { rows: bankRows.length, questions: views.filter(v => v.status === "QUESTION").length, ready: views.filter(v => v.status === "READY").length },
        reconciliation: rec.data ? { asOf: to, statement: Number((rec.data as { statement_balance: number | string }).statement_balance) || 0, book } : null,
        auto: { create: comp.diff.create.length, replace: comp.diff.replace.length, remove: comp.diff.remove.length, unchanged: comp.diff.unchanged, errors: comp.errors },
        rent: comp.rent,
        leasesWithoutIncome,
        mixedRows,
        receivablesCredit,
        measurement: ctx.settings.property_measurement,
        policiesDecided: Boolean(ctx.settings.policies_decided_on),
        depreciation: comp.depreciation,
        ppi: comp.ppi,
        fairValue: comp.fairValue,
        financing: comp.financing,
        financingDebitBalance: loanBalance > 0 ? loanBalance : 0,
        imob: { cost: round2(closing("IMOB_IMOVEIS_USO") + closing("IMOB_MOVEIS")), depreciatedInMonth: moved("DESP_DEPRECIACAO_IMOB") > 0 },
        revenue: { month: comp.rent.grossRent, average3: prevRent ? round2((prevRent.credit - prevRent.debit) / 3) : null },
    };
    const items = sortChecklist(closeChecklist(facts));

    let revenue = 0, expenses = 0;
    for (const a of ctx.accounts) {
        const x = byId.get(a.id);
        if (!x) continue;
        if (a.account_type === "RECEITA") revenue += x.credit - x.debit;
        else if (a.account_type === "DESPESA") expenses += x.debit - x.credit;
    }
    return {
        month,
        status,
        period,
        items,
        summary: checklistSummary(items),
        automated: {
            rentEntries: comp.rent.entries,
            grossRent: comp.rent.grossRent,
            depreciation: comp.depreciation,
            fairValue: comp.fairValue,
            financing: comp.financing.reclassified,
            pending: pendingChanges(comp.diff),
            errors: comp.errors,
        },
        result: { revenue: round2(revenue), expenses: round2(expenses), net: round2(revenue - expenses) },
    };
}

// ───────────────────────────────────────────────────────────────────────────
// Closing and reopening
// ───────────────────────────────────────────────────────────────────────────

export type CloseOutcome =
    | { ok: true; sync: SyncResult }
    | { ok: false; error: string; needsConfirmation?: boolean; status: MonthStatus | null };

/**
 * Closes a month: brings it up to date, checks it, and locks it. Errors block; warnings need
 * `confirmWarnings`. Months close in order, after they end.
 */
export async function closeMonth(supabase: AdminSupabase, ownerId: string, month: string, opts: { confirmWarnings?: boolean; note?: string | null } = {}): Promise<CloseOutcome> {
    const ctx = await closeContext(supabase, ownerId);
    if (ctx.closed.has(month)) return { ok: false, error: "O mês já está fechado", status: null };
    const sync = await syncMonth(supabase, ctx, month);
    const status = await monthStatus(supabase, ctx, month);
    if (status.summary.errors > 0) {
        return { ok: false, error: status.items.find(i => i.level === "error")?.title ?? "Há pendências que impedem o fechamento", status };
    }
    if (status.summary.warnings > 0 && !opts.confirmWarnings) {
        return { ok: false, error: "Confirme que está ciente dos avisos para fechar o mês", needsConfirmation: true, status };
    }
    const { error } = await supabase.from("accounting_periods").upsert({
        owner_id: ownerId, month: monthStart(month), status: "CLOSED", closed_at: new Date().toISOString(),
        closed_note: opts.note ? String(opts.note).trim().slice(0, 300) || null : null,
    }, { onConflict: "owner_id,month" });
    if (error) throw new Error(error.message);
    return { ok: true, sync };
}

/**
 * Reopens a closed month and every closed month after it (their balances start from it),
 * recording the reason. Returns the months reopened.
 */
export async function reopenFrom(supabase: AdminSupabase, ownerId: string, month: string, reason: string): Promise<{ reopened: string[] } | { error: string }> {
    const text = String(reason ?? "").trim();
    if (!text) return { error: "Informe o motivo da reabertura" };
    const periods = await loadPeriods(supabase, ownerId);
    const closedFrom = periods.filter(p => p.status === "CLOSED" && p.month.slice(0, 7) >= month).map(p => p.month.slice(0, 7)).sort();
    if (!closedFrom.includes(month)) return { error: "O mês não está fechado" };
    const { error } = await supabase.from("accounting_periods")
        .update({ status: "OPEN", reopened_at: new Date().toISOString(), reopen_reason: text.slice(0, 300) })
        .eq("owner_id", ownerId).eq("status", "CLOSED").gte("month", monthStart(month));
    if (error) throw new Error(error.message);
    return { reopened: closedFrom };
}

/** Months from the start of the books to the current one, with their status. */
export function monthsOverview(ctx: CloseContext): Array<{ month: string; status: "OPEN" | "CLOSED" }> {
    const start = ctx.settings.opening_date?.slice(0, 7);
    if (!start) return [];
    return monthRange(start, todayIso().slice(0, 7)).map(m => ({ month: m, status: ctx.closed.has(m) ? "CLOSED" : "OPEN" }));
}

/** The month to show first: the first open one that has already ended, else the last one. */
export function suggestedMonth(ctx: CloseContext): string {
    const current = todayIso().slice(0, 7);
    const months = monthsOverview(ctx);
    return months.find(m => m.status === "OPEN" && m.month < current)?.month ?? shiftMonth(current, -1);
}
