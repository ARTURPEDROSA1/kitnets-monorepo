/**
 * The dashboard's bundle, built on the server: the leases, the income ledger of the last twelve months
 * (plus the agencies' fee over every confirmed month), the invoices, the bills, the project instalments,
 * the taxes register and how many people the contracts house. Each loader runs on its own; one that fails
 * is reported in `failed` and its figures show as unavailable, the page never blanks. Shared by the page
 * preload and GET /api/dashboard.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/accounting-server";
import { DASHBOARD_MONTHS, type DashboardLedger, type DashboardLoader, type DashboardView } from "@/lib/dashboard-views";
import { addMonths } from "@/lib/energy-hub";
import { getOwnerPropertiesSummary } from "@/lib/energy-properties-server";
import { IN_FORCE } from "@/lib/lease-dashboard";
import { loadLeaseRows } from "@/lib/lease-views-server";
import { computeInvestmentMetrics, toCardSummary, type InvestmentCardSummary } from "@/lib/new-investment-metrics";
import { loadInvestmentList } from "@/lib/new-investments-server";
import { loadPropertyEntries } from "@/lib/property-entries-server";
import { INCOME_DIRECT_COLUMNS, currentMonthKey, normalizeIncomeRow, round2, summarize, type PropertyIncomeRow } from "@/lib/property-income";
import { normalizeInstallments, type PropertyTax } from "@/lib/property-taxes";
import { loadTenantList } from "@/lib/tenant-views-server";
import { getOwnerWaterPropertiesSummary } from "@/lib/water-properties-server";
import { loadInvoiceRows } from "@/lib/invoice-views-server";

const TAX_COLUMNS = "id, property_id, year, kind, amount, paid_by, paid_on, installments";
const INCOME_COLUMNS = `id, property_id, month, unit_id, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, iptu_amount, agency_fee_pct, status, source, updated_at, ${INCOME_DIRECT_COLUMNS}`;

/** Runs a loader, recording its failure instead of throwing. */
async function settle<T>(failed: DashboardLoader[], name: DashboardLoader, run: () => Promise<T>): Promise<T | null> {
    try {
        return await run();
    } catch (err) {
        console.error(`[Dashboard] ${name} failed:`, err);
        failed.push(name);
        return null;
    }
}

export async function loadTaxRowsByOwner(supabase: AdminSupabase, profileId: string): Promise<PropertyTax[]> {
    const { data, error } = await supabase.from("property_taxes").select(TAX_COLUMNS).eq("owner_id", profileId);
    if (error) throw new Error(`taxes: ${error.message}`);
    return ((data ?? []) as unknown as PropertyTax[]).map(t => ({ ...t, amount: Number(t.amount) || 0, installments: normalizeInstallments(t.installments) }));
}

/**
 * The ledger the board reads: every row of the last twelve months (confirmed and expected), and the agencies'
 * fee over each property's confirmed months, all time and the last twelve, the way the property cards add it.
 * Months after the current one are left out. Paged: a large portfolio has more than a thousand rows.
 */
export async function loadDashboardLedger(supabase: AdminSupabase, profileId: string, now = new Date()): Promise<DashboardLedger> {
    const to = currentMonthKey(now);
    const from = addMonths(to, -(DASHBOARD_MONTHS - 1));
    const query = () => supabase.from("property_income_months").select(INCOME_COLUMNS).eq("owner_id", profileId).lte("month", `${to}-01`);
    const [confirmed, expected] = await Promise.all([
        fetchAllPages<PropertyIncomeRow>((a, b) => query().eq("status", "CONFIRMED").order("id").range(a, b)),
        fetchAllPages<PropertyIncomeRow>((a, b) => query().eq("status", "EXPECTED").gte("month", `${from}-01`).order("id").range(a, b)),
    ]);
    const rows = confirmed.map(normalizeIncomeRow);
    const byProperty = new Map<string, PropertyIncomeRow[]>();
    for (const r of rows) byProperty.set(r.property_id, [...(byProperty.get(r.property_id) ?? []), r]);
    let feeAllTime = 0;
    let fee12m = 0;
    for (const list of byProperty.values()) {
        const s = summarize(list);
        feeAllTime += s.totalFee;
        fee12m += s.fee12m;
    }
    return {
        from,
        to,
        rows: [...rows.filter(r => r.month.slice(0, 7) >= from), ...expected.map(normalizeIncomeRow)],
        feeAllTime: round2(feeAllTime),
        fee12m: round2(fee12m),
    };
}

export async function loadDashboard(supabase: AdminSupabase, profileId: string, userId: string): Promise<DashboardView> {
    const failed: DashboardLoader[] = [];
    // The energy loader creates the `properties` rows still missing for profile entries; the water loader
    // builds on it. They run one after the other on a single energy result: two concurrent runs would both
    // see the row missing and insert it twice.
    const energyThenWater = (async () => {
        const energy = await settle(failed, "energy", () => getOwnerPropertiesSummary(userId));
        const water = await settle(failed, "water", () => getOwnerWaterPropertiesSummary(userId, energy ?? undefined));
        return { energy, water };
    })();
    const [entriesResult, taxes, leases, tenants, { energy, water }, investments, invoices, ledger] = await Promise.all([
        settle(failed, "properties", () => loadPropertyEntries(supabase, profileId)),
        settle(failed, "taxes", () => loadTaxRowsByOwner(supabase, profileId)),
        settle(failed, "leases", () => loadLeaseRows(supabase, profileId)),
        settle(failed, "tenants", () => loadTenantList(supabase, profileId)),
        energyThenWater,
        settle(failed, "projects", () => loadInvestmentList(supabase, profileId)),
        settle(failed, "invoices", () => loadInvoiceRows(supabase, profileId)),
        settle(failed, "income", () => loadDashboardLedger(supabase, profileId)),
    ]);

    // The projects' figures without signing their photos (the cards do that on their own hub).
    let projects: DashboardView["projects"] = null;
    if (investments) {
        const asOf = new Date();
        const summaries: Record<string, InvestmentCardSummary> = {};
        for (const inv of investments.investments) {
            const own = investments.schedules.filter(s => s.investment_id === inv.id);
            const ownPayments = investments.payments.filter(p => p.investment_id === inv.id);
            summaries[inv.id] = toCardSummary(inv.id, computeInvestmentMetrics(inv, own, ownPayments, asOf), investments.documentCounts.get(inv.id) ?? 0, []);
        }
        projects = { investments: investments.investments, summaries };
    }

    return {
        profile: entriesResult?.profile ?? { fullName: null, email: null },
        properties: entriesResult?.entries ?? [],
        leases,
        ledger,
        // each person once: the titular, the co-tenants and the occupants of the contracts in force
        housed: tenants ? new Set(tenants.leases.filter(e => IN_FORCE.has(e.status)).map(e => e.tenant_id)).size : null,
        invoices,
        energy,
        water,
        projects,
        taxes,
        failed,
    };
}
