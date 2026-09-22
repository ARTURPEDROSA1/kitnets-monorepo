import { createClient } from "@supabase/supabase-js";
import { getOwnerPropertiesSummary } from "./energy-properties-server";

/**
 * Rental properties whose main water meter is paid by the landlord ("Água" under
 * "Medidores Principais do Imóvel"), with the latest utility bill figures for the
 * /dashboard/water cards. Source of truth is the water utility's bill (water_bills);
 * gateway readings are a founder-only tool and are not part of this summary.
 */
export interface WaterPropertySummary {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    /** utility connection code ("Ligação") */
    connectionCode: string | null;
    meterNumber: string | null;
    billsCount: number;
    /** `YYYY-MM` of the latest bill */
    latestMonth: string | null;
    latestConsumptionM3: number | null;
    latestTotalAmount: number | null;
    latestDueDate: string | null;
    latestRatePerM3: number | null;
    /** averages over the last 12 bills */
    avgConsumptionM3: number | null;
    avgTotalAmount: number | null;
}

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service credentials");
    return createClient(url, key);
}

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export async function getOwnerWaterPropertiesSummary(userId: string): Promise<WaterPropertySummary[]> {
    if (!userId) return [];
    try {
        // Reuses the profile ↔ properties matching (and row creation) of the energy hub
        const all = await getOwnerPropertiesSummary(userId);
        const withWater = all.filter(p => !p.isStandaloneUc && !p.isOrphaned && p.hasWaterMeter);
        if (withWater.length === 0) return [];

        const supabase = getServiceSupabase();
        const ids = withWater.map(p => p.id);
        const [{ data: rows }, { data: bills }] = await Promise.all([
            supabase.from("properties").select("id, connection_code").in("id", ids),
            supabase
                .from("water_bills")
                .select("property_id, reference_month, consumption_m3, total_amount, due_date, effective_rate_per_m3, meter_number")
                .in("property_id", ids)
                .order("reference_month", { ascending: false }),
        ]);

        const connectionById = new Map<string, string | null>();
        for (const r of rows ?? []) connectionById.set(r.id as string, (r.connection_code as string | null) ?? null);

        const billsByProperty = new Map<string, NonNullable<typeof bills>>();
        for (const b of bills ?? []) {
            const list = billsByProperty.get(b.property_id as string) ?? [];
            list.push(b);
            billsByProperty.set(b.property_id as string, list);
        }

        return withWater.map(p => {
            const list = billsByProperty.get(p.id) ?? [];
            const latest = list[0] ?? null;
            const last12 = list.slice(0, 12);
            const avg = (pick: (b: (typeof list)[number]) => number | null) => {
                const vals = last12.map(pick).filter((v): v is number => v !== null);
                return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
            };
            return {
                id: p.id,
                name: p.name,
                address: p.address,
                city: p.city,
                state: p.state,
                zip: p.zip,
                connectionCode: connectionById.get(p.id) ?? null,
                meterNumber: latest ? ((latest.meter_number as string | null) ?? null) : null,
                billsCount: list.length,
                latestMonth: latest ? String(latest.reference_month) : null,
                latestConsumptionM3: latest ? num(latest.consumption_m3) : null,
                latestTotalAmount: latest ? num(latest.total_amount) : null,
                latestDueDate: latest ? ((latest.due_date as string | null) ?? null) : null,
                latestRatePerM3: latest ? num(latest.effective_rate_per_m3) : null,
                avgConsumptionM3: avg(b => num(b.consumption_m3)),
                avgTotalAmount: avg(b => num(b.total_amount)),
            };
        });
    } catch (err) {
        console.error("[getOwnerWaterPropertiesSummary] Error:", err);
        return [];
    }
}
