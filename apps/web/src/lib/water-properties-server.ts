import { createClient } from "@supabase/supabase-js";
import type { AdminSupabase } from "@/lib/api-auth";
import { getOwnerPropertiesSummary } from "./energy-properties-server";
import { listWaterFiles, signWaterFiles } from "./water-bills-server";
import { EMPTY_WATER_PERIOD, summarizeWaterBills, type WaterBillLike, type WaterLatest, type WaterPeriod } from "./water-hub";

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
    /** signed URL of the current bill's PDF kept in the water-bills bucket */
    latestBillPdfUrl?: string | null;
    /** signed URL of the water utility's logo (the card's cover) */
    logoUrl?: string | null;
    /** the newest bill's figures (the hub's tiles and KPIs); null without bills */
    latest?: WaterLatest | null;
    /** the twelve months up to the newest bill */
    last12?: WaterPeriod;
}

function getServiceSupabase(): AdminSupabase {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service credentials");
    return createClient(url, key);
}

export async function getOwnerWaterPropertiesSummary(userId: string): Promise<WaterPropertySummary[]> {
    if (!userId) return [];
    try {
        // Reuses the profile ↔ properties matching (and row creation) of the energy hub
        const all = await getOwnerPropertiesSummary(userId);
        const withWater = all.filter(p => !p.isStandaloneUc && !p.isOrphaned && p.hasWaterMeter);
        if (withWater.length === 0) return [];

        const supabase = getServiceSupabase();
        const ids = withWater.map(p => p.id);
        const [{ data: rows }, { data: bills }, files] = await Promise.all([
            supabase.from("properties").select("id, connection_code").in("id", ids),
            supabase
                .from("water_bills")
                .select("property_id, reference_month, consumption_m3, billed_consumption_m3, total_amount, due_date, reading_date, effective_rate_per_m3, meter_number, occurrence_code")
                .in("property_id", ids)
                .order("reference_month", { ascending: false }),
            // the current PDF and the utility's logo, per property
            Promise.all(ids.map(async id => [id, await signWaterFiles(supabase, id, await listWaterFiles(supabase, id))] as const)),
        ]);
        const urlsById = new Map(files);

        const connectionById = new Map<string, string | null>();
        for (const r of rows ?? []) connectionById.set(r.id as string, (r.connection_code as string | null) ?? null);

        const billsByProperty = new Map<string, WaterBillLike[]>();
        for (const b of bills ?? []) {
            const list = billsByProperty.get(b.property_id as string) ?? [];
            list.push(b as WaterBillLike);
            billsByProperty.set(b.property_id as string, list);
        }

        return withWater.map(p => {
            const list = billsByProperty.get(p.id) ?? [];
            const { latest, last12 } = summarizeWaterBills(list);
            const urls = urlsById.get(p.id);
            return {
                id: p.id,
                name: p.name,
                address: p.address,
                city: p.city,
                state: p.state,
                zip: p.zip,
                connectionCode: connectionById.get(p.id) ?? null,
                meterNumber: latest?.meterNumber ?? null,
                billsCount: list.length,
                latestMonth: latest?.month ?? null,
                latestConsumptionM3: latest ? latest.consumptionM3 : null,
                latestTotalAmount: latest ? latest.total : null,
                latestDueDate: latest?.dueDate ?? null,
                latestRatePerM3: latest?.ratePerM3 ?? null,
                avgConsumptionM3: last12.months > 0 ? Math.round(last12.avgConsumptionM3 * 100) / 100 : null,
                avgTotalAmount: last12.months > 0 ? Math.round(last12.avgAmount * 100) / 100 : null,
                latestBillPdfUrl: urls?.currentPdfUrl ?? null,
                logoUrl: urls?.logoUrl ?? null,
                latest,
                last12: last12 ?? EMPTY_WATER_PERIOD,
            };
        });
    } catch (err) {
        console.error("[getOwnerWaterPropertiesSummary] Error:", err);
        return [];
    }
}
