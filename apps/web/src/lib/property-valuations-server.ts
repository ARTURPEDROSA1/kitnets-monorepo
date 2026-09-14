/**
 * Server-only helpers for property valuations (loading rows, FipeZap series).
 */
import type { AdminSupabase } from "./api-auth";
import type { MonthlyIndexPoint, PropertyValuation } from "./property-valuations";

export const VALUATIONS_TABLE = "property_valuations";
export const VALUATIONS_COLUMNS = "id, property_id, valued_on, amount, source, note, created_at, updated_at";

export async function loadValuations(supabase: AdminSupabase, propertyId: string): Promise<PropertyValuation[]> {
    const { data, error } = await supabase
        .from(VALUATIONS_TABLE).select(VALUATIONS_COLUMNS).eq("property_id", propertyId)
        .order("valued_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PropertyValuation[]).map(r => ({ ...r, amount: Number(r.amount) || 0 }));
}

/** FipeZap sale index, monthly variation in %, for a bedroom bucket ('total' | '1' | '2' | '3' | '4'). */
export async function loadFipezapSaleSeries(supabase: AdminSupabase, dormitorios: string): Promise<MonthlyIndexPoint[]> {
    const { data, error } = await supabase
        .from("fipezap_series")
        .select("reference_date, value")
        .eq("index_type", "venda")
        .eq("metric", "var_mensal")
        .eq("dormitorios", dormitorios)
        .order("reference_date", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ reference_date: string; value: number | null }>)
        .filter(r => r.value !== null && Number.isFinite(Number(r.value)))
        .map(r => ({ month: r.reference_date.slice(0, 7), value: Number(r.value) }));
}

/** Maps the property's bedroom count to a FipeZap bucket. */
export function fipezapBucket(bedrooms: string | number | null | undefined): string {
    const n = Number(bedrooms);
    if (!Number.isFinite(n) || n <= 0) return "total";
    return String(Math.min(4, Math.max(1, Math.round(n))));
}

/** IPCA monthly variations (%), oldest first, from the economic index tables. */
export async function loadIpcaSeries(supabase: AdminSupabase): Promise<MonthlyIndexPoint[]> {
    const { data: idx } = await supabase.from("economic_indexes").select("id").eq("code", "IPCA").maybeSingle();
    if (!idx?.id) return [];
    const out: MonthlyIndexPoint[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
            .from("economic_index_values")
            .select("year, month, value_percent")
            .eq("index_id", idx.id)
            .eq("is_projection", false)
            .order("reference_date", { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error || !data?.length) break;
        for (const r of data) out.push({ month: `${r.year}-${String(r.month).padStart(2, "0")}`, value: Number(r.value_percent) });
        if (data.length < pageSize) break;
    }
    return out;
}
