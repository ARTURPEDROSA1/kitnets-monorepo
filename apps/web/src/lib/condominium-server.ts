import type { AdminSupabase } from "@/lib/api-auth";
import type { PropertyIncomeRow } from "@/lib/property-income";
import { buildCondominiumMonths, type CondominiumCostRow, type CondominiumMonth } from "@/lib/condominium";

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

/** One property's condominium months (revenue from the income ledger + its cost rows), newest first. */
export async function loadMonths(supabase: AdminSupabase, propertyId: string): Promise<{ months: CondominiumMonth[]; costs: CondominiumCostRow[] }> {
    const [{ data: income, error }, costs] = await Promise.all([
        supabase.from("property_income_months").select("month, condo_amount, received_amount, status").eq("property_id", propertyId),
        loadCosts(supabase, propertyId),
    ]);
    if (error) throw new Error(error.message);
    return { months: buildCondominiumMonths((income ?? []) as unknown as PropertyIncomeRow[], costs), costs };
}

/** The condominium months of several properties in two queries, keyed by property id (for the cards). */
export async function loadMonthsByProperty(supabase: AdminSupabase, profileId: string, propertyIds: string[]): Promise<Map<string, CondominiumMonth[]>> {
    const out = new Map<string, CondominiumMonth[]>();
    if (propertyIds.length === 0) return out;
    const [{ data: income, error: e1 }, { data: costs, error: e2 }] = await Promise.all([
        supabase.from("property_income_months").select("property_id, month, condo_amount, received_amount, status").in("property_id", propertyIds),
        supabase.from(CONDO_COSTS_TABLE).select(COST_COLUMNS).eq("owner_id", profileId).in("property_id", propertyIds),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    for (const id of propertyIds) {
        out.set(id, buildCondominiumMonths(
            ((income ?? []) as unknown as Array<PropertyIncomeRow & { property_id: string }>).filter(r => r.property_id === id),
            ((costs ?? []) as CostRecord[]).filter(c => c.property_id === id).map(toCostRow)
        ));
    }
    return out;
}
