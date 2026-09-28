/**
 * Server-side helpers for the holding's books (Contábil & Fiscal): settings, the chart of
 * accounts (seeded from the template on first use), periods, journal entries and the
 * figures that pre-fill the measurement-model simulation. Every query is scoped to the
 * owner; the tables are service-role only (migration 20260928090000_accounting_base.sql).
 */
import type { AdminSupabase } from "./api-auth";
import { chartTemplate, compareCodes, modelAccountActivation, type AccountingAccount, type PropertyMeasurement } from "./accounting-chart";
import type { AccountingPeriod, JournalEntry, JournalLine } from "./accounting-journal";
import { DEFAULT_SETTINGS, type AccountingSettings } from "./accounting-policies";
import { breakdown, round2, type PropertyIncomeRow } from "./property-income";
import { landlordTaxesByMonth, type PropertyTax } from "./property-taxes";

export const ACCOUNT_COLUMNS = "id, code, name, account_type, nature, analytic, system_key, referential_code, active";
const SETTINGS_COLUMNS = "legal_nature, company_size, nire, tax_regime, tax_basis, accounting_standard, property_measurement, building_useful_life_years, useful_life_basis, reimbursements_policy, first_adoption_deemed_cost, opening_date, accountant_name, accountant_crc, accountant_crc_uf, accountant_email, policies_decided_by, policies_decided_on";

export interface HoldingIdentity {
    person_type: string | null;
    cnpj: string | null;
    business_name: string | null;
    trade_name: string | null;
}

export async function loadSettings(supabase: AdminSupabase, ownerId: string): Promise<{ settings: AccountingSettings; saved: boolean }> {
    const { data, error } = await supabase.from("accounting_settings").select(SETTINGS_COLUMNS).eq("owner_id", ownerId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { settings: { ...DEFAULT_SETTINGS }, saved: false };
    const row = data as unknown as AccountingSettings;
    return { settings: { ...DEFAULT_SETTINGS, ...row, building_useful_life_years: Number(row.building_useful_life_years) || DEFAULT_SETTINGS.building_useful_life_years }, saved: true };
}

export async function saveSettings(supabase: AdminSupabase, ownerId: string, settings: AccountingSettings): Promise<void> {
    const { error } = await supabase.from("accounting_settings").upsert({ owner_id: ownerId, ...settings }, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
}

export async function loadIdentity(supabase: AdminSupabase, ownerId: string): Promise<HoldingIdentity> {
    const { data } = await supabase.from("profiles").select("person_type, cnpj, business_name, trade_name").eq("id", ownerId).maybeSingle();
    const p = (data ?? {}) as Partial<HoldingIdentity>;
    return { person_type: p.person_type ?? null, cnpj: p.cnpj ?? null, business_name: p.business_name ?? null, trade_name: p.trade_name ?? null };
}

/** Name recorded as the author of entries and period changes. */
export async function actorName(supabase: AdminSupabase, ownerId: string): Promise<string | null> {
    const { data } = await supabase.from("profiles").select("full_name, email").eq("id", ownerId).maybeSingle();
    const p = (data ?? {}) as { full_name?: string | null; email?: string | null };
    return p.full_name || p.email || null;
}

function toAccount(r: Record<string, unknown>): AccountingAccount {
    return r as unknown as AccountingAccount;
}

export async function loadAccounts(supabase: AdminSupabase, ownerId: string): Promise<AccountingAccount[]> {
    const { data, error } = await supabase.from("accounting_accounts").select(ACCOUNT_COLUMNS).eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => toAccount(r as Record<string, unknown>)).sort((a, b) => compareCodes(a.code, b.code));
}

/**
 * The owner's chart, created from the template the first time. Accounts that depend on the
 * measurement model follow the current setting (only their `active` flag changes; lines
 * already posted stay where they are).
 */
export async function ensureChart(supabase: AdminSupabase, ownerId: string, measurement: PropertyMeasurement): Promise<AccountingAccount[]> {
    let accounts = await loadAccounts(supabase, ownerId);
    if (accounts.length === 0) {
        const rows = chartTemplate(measurement).map(a => ({
            owner_id: ownerId, code: a.code, name: a.name, account_type: a.type, nature: a.nature,
            analytic: a.analytic, system_key: a.systemKey, active: a.active,
        }));
        // ignoreDuplicates: two first loads racing each other must not fail
        const { error } = await supabase.from("accounting_accounts").upsert(rows, { onConflict: "owner_id,code", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        accounts = await loadAccounts(supabase, ownerId);
    }
    await syncModelAccounts(supabase, ownerId, measurement, accounts);
    return accounts;
}

/** Turns the depreciation / fair-value accounts on or off for the chosen model. Mutates `accounts`. */
export async function syncModelAccounts(supabase: AdminSupabase, ownerId: string, measurement: PropertyMeasurement, accounts: AccountingAccount[]): Promise<void> {
    const activation = modelAccountActivation(measurement);
    for (const a of accounts) {
        if (!a.system_key || !(a.system_key in activation) || a.active === activation[a.system_key]) continue;
        const { error } = await supabase.from("accounting_accounts").update({ active: activation[a.system_key] }).eq("id", a.id).eq("owner_id", ownerId);
        if (error) throw new Error(error.message);
        a.active = activation[a.system_key];
    }
}

export async function loadPeriods(supabase: AdminSupabase, ownerId: string): Promise<AccountingPeriod[]> {
    const { data, error } = await supabase.from("accounting_periods")
        .select("month, status, closed_at, closed_note, reopened_at, reopen_reason").eq("owner_id", ownerId).order("month");
    if (error) throw new Error(error.message);
    return (data ?? []) as AccountingPeriod[];
}

export function closedMonths(periods: AccountingPeriod[]): Set<string> {
    return new Set(periods.filter(p => p.status === "CLOSED").map(p => p.month.slice(0, 7)));
}

/** Entries dated in [from, to] (ISO dates), lines ordered, with who reversed each one. */
export async function loadEntries(supabase: AdminSupabase, ownerId: string, from: string, to: string): Promise<JournalEntry[]> {
    const { data, error } = await supabase.from("journal_entries")
        .select("id, entry_date, description, source, source_ref, reverses_entry_id, created_by, created_at, journal_lines(id, line_no, account_id, debit, credit, property_id, unit_id, memo)")
        .eq("owner_id", ownerId).gte("entry_date", from).lte("entry_date", to)
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    const entries = (data ?? []).map(raw => {
        const r = raw as unknown as Omit<JournalEntry, "lines"> & { journal_lines: JournalLine[] };
        const lines = (r.journal_lines ?? [])
            .map(l => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))
            .sort((a, b) => a.line_no - b.line_no);
        const { journal_lines: _lines, ...rest } = r;
        void _lines;
        return { ...rest, lines, reversed_by: null } as JournalEntry;
    });
    const ids = entries.map(e => e.id);
    if (ids.length) {
        const { data: rev } = await supabase.from("journal_entries").select("id, reverses_entry_id").eq("owner_id", ownerId).in("reverses_entry_id", ids);
        const by = new Map(((rev ?? []) as Array<{ id: string; reverses_entry_id: string }>).map(r => [r.reverses_entry_id, r.id]));
        for (const e of entries) e.reversed_by = by.get(e.id) ?? null;
    }
    return entries;
}

export interface SimulationDefaults {
    properties: number;
    /** Σ purchase price from the investment register */
    purchaseTotal: number;
    /** Σ latest valuation per property */
    marketValueTotal: number;
    /** last 12 complete months, all properties */
    grossRent12m: number;
    /** agency fee + energy net cost + other expenses + condominium net + landlord IPTU, last 12 months */
    expenses12m: number;
    /** months with income rows in the window */
    monthsWithIncome: number;
}

/** Figures that pre-fill the A × B simulation; the owner can change every one of them. */
export async function simulationDefaults(supabase: AdminSupabase, ownerId: string, today = new Date()): Promise<SimulationDefaults> {
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));        // first day of the current month (excluded)
    const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1));
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [props, inv, vals, income, taxes] = await Promise.all([
        supabase.from("properties").select("id").eq("owner_id", ownerId),
        supabase.from("property_investments").select("property_id, purchase_price").eq("owner_id", ownerId),
        supabase.from("property_valuations").select("property_id, valued_on, amount").eq("owner_id", ownerId).order("valued_on", { ascending: false }),
        supabase.from("property_income_months")
            .select("month, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, agency_fee_pct")
            .eq("owner_id", ownerId).gte("month", iso(start)).lt("month", iso(end)),
        supabase.from("property_taxes").select("id, property_id, year, kind, amount, paid_by, paid_on, installments").eq("owner_id", ownerId),
    ]);

    const purchaseTotal = round2(((inv.data ?? []) as Array<{ purchase_price: number | string }>).reduce((s, r) => s + (Number(r.purchase_price) || 0), 0));
    const latest = new Map<string, number>();
    for (const v of (vals.data ?? []) as Array<{ property_id: string; amount: number | string }>) {
        if (!latest.has(v.property_id)) latest.set(v.property_id, Number(v.amount) || 0);
    }
    const marketValueTotal = round2([...latest.values()].reduce((s, x) => s + x, 0));

    let gross = 0, expenses = 0;
    const months = new Set<string>();
    for (const row of (income.data ?? []) as Array<Pick<PropertyIncomeRow, "month" | "received_amount" | "energy_portion" | "other_income" | "agency_fee_pct" | "other_expenses" | "condo_amount" | "fee_on_condo">>) {
        const b = breakdown(row);
        gross += b.grossRent;
        expenses += b.grossRent - b.noi;
        months.add(String(row.month).slice(0, 7));
    }
    const startKey = iso(start).slice(0, 7), endKey = iso(end).slice(0, 7);
    let iptu = 0;
    for (const [m, amt] of landlordTaxesByMonth((taxes.data ?? []) as unknown as PropertyTax[], ["IPTU"])) {
        if (m >= startKey && m < endKey) iptu += amt;
    }

    return {
        properties: (props.data ?? []).length,
        purchaseTotal,
        marketValueTotal,
        grossRent12m: round2(gross),
        expenses12m: round2(Math.max(0, expenses) + iptu),
        monthsWithIncome: months.size,
    };
}
