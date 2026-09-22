import type { AdminSupabase } from "@/lib/api-auth";
import type { PropertyIncomeRow } from "@/lib/property-income";
import { buildCondominiumMonths, type CondominiumAutoCosts, type CondominiumCostRow, type CondominiumMonth } from "@/lib/condominium";
import { condominiumIptuByMonth } from "@/lib/property-taxes";
import { loadTaxRows } from "@/lib/property-taxes-server";

/** Server-side readers of the condominium cost centre (lib/condominium.ts holds the pure maths). */

export const CONDO_COSTS_TABLE = "condominium_months";
export const CONDOMINIUMS_TABLE = "condominiums";
const COST_COLUMNS = "id, property_id, month, energy_cost, internet_cost, water_cost, iptu_amount, maintenance_cost, notes, updated_at";

type CostRecord = { id: string; property_id: string; month: string; energy_cost: unknown; internet_cost: unknown; water_cost: unknown; iptu_amount: unknown; maintenance_cost: unknown; notes: string | null; updated_at: string | null };

const toCostRow = (r: CostRecord): CondominiumCostRow => ({
    id: r.id, property_id: r.property_id, month: r.month,
    energy_cost: Number(r.energy_cost) || 0, internet_cost: Number(r.internet_cost) || 0, water_cost: Number(r.water_cost) || 0,
    iptu_amount: Number(r.iptu_amount) || 0, maintenance_cost: Number(r.maintenance_cost) || 0,
    notes: r.notes ?? null, updated_at: r.updated_at ?? undefined,
});

export async function loadCosts(supabase: AdminSupabase, propertyId: string): Promise<CondominiumCostRow[]> {
    const { data, error } = await supabase.from(CONDO_COSTS_TABLE).select(COST_COLUMNS).eq("property_id", propertyId).order("month", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCostRow);
}

type BillRecord = { property_id: string | null; reference_month: string; total_amount: unknown };

/** "Valor a pagar" of the energy bills (full bills, not the history-only rows) by reference month, per property. */
function energyByMonth(bills: BillRecord[], propertyId: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const b of bills) {
        if (b.property_id !== propertyId) continue;
        const m = String(b.reference_month).slice(0, 7);
        out.set(m, Math.round(((out.get(m) ?? 0) + (Number(b.total_amount) || 0)) * 100) / 100);
    }
    return out;
}

const BILL_COLUMNS = "property_id, reference_month, total_amount";

/** The costs that come from other registers: energy bills ("Valor a pagar") and the landlord's IPTU (Tributos do imóvel). */
export async function loadAutoCosts(supabase: AdminSupabase, propertyId: string): Promise<CondominiumAutoCosts> {
    const [{ data: bills, error }, taxes] = await Promise.all([
        supabase.from("energy_bills").select(BILL_COLUMNS).eq("property_id", propertyId).eq("is_historical_only", false),
        loadTaxRows(supabase, propertyId),
    ]);
    if (error) throw new Error(error.message);
    return { energy: energyByMonth((bills ?? []) as BillRecord[], propertyId), iptu: condominiumIptuByMonth(taxes) };
}

/** One property's condominium months (revenue from the income ledger, energy and IPTU from their registers, its cost rows), newest first. */
export async function loadMonths(supabase: AdminSupabase, propertyId: string): Promise<{ months: CondominiumMonth[]; costs: CondominiumCostRow[] }> {
    const [{ data: income, error }, costs, auto] = await Promise.all([
        supabase.from("property_income_months").select("month, condo_amount, received_amount, status").eq("property_id", propertyId),
        loadCosts(supabase, propertyId),
        loadAutoCosts(supabase, propertyId),
    ]);
    if (error) throw new Error(error.message);
    return { months: buildCondominiumMonths((income ?? []) as unknown as PropertyIncomeRow[], costs, auto), costs };
}

/** The condominium months of several properties in two queries, keyed by property id (for the cards). */
export async function loadMonthsByProperty(supabase: AdminSupabase, profileId: string, propertyIds: string[]): Promise<Map<string, CondominiumMonth[]>> {
    const out = new Map<string, CondominiumMonth[]>();
    if (propertyIds.length === 0) return out;
    const [{ data: income, error: e1 }, { data: costs, error: e2 }, { data: bills, error: e3 }, taxes] = await Promise.all([
        supabase.from("property_income_months").select("property_id, month, condo_amount, received_amount, status").in("property_id", propertyIds),
        supabase.from(CONDO_COSTS_TABLE).select(COST_COLUMNS).eq("owner_id", profileId).in("property_id", propertyIds),
        supabase.from("energy_bills").select(BILL_COLUMNS).in("property_id", propertyIds).eq("is_historical_only", false),
        Promise.all(propertyIds.map(id => loadTaxRows(supabase, id))),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);
    propertyIds.forEach((id, i) => {
        out.set(id, buildCondominiumMonths(
            ((income ?? []) as unknown as Array<PropertyIncomeRow & { property_id: string }>).filter(r => r.property_id === id),
            ((costs ?? []) as CostRecord[]).filter(c => c.property_id === id).map(toCostRow),
            { energy: energyByMonth((bills ?? []) as BillRecord[], id), iptu: condominiumIptuByMonth(taxes[i]) }
        ));
    });
    return out;
}
