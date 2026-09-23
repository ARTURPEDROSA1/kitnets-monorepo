import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndexMetadata, getIndexValues } from "@/lib/indexes";

/**
 * The market figures a Novo Investimento is read against, from the series the app already syncs:
 *
 *   cdi12mPct          the CDI accumulated over the last twelve months — what the money would have
 *                      earned sitting still; the TIR of the simulator is compared with it
 *   fipezapSale12mPct  FipeZap's national sale-price variation over twelve months — the trend
 *                      behind "valorização"; the app has no per-city series, so it is a reference,
 *                      never a price for the unit's street
 *
 * Every figure is best-effort: a missing series is null, never an error on the dashboard.
 */
export interface InvestmentBenchmarks {
    cdi12mPct: number | null;
    cdiAsOf: string | null;
    fipezapSale12mPct: number | null;
    fipezapAsOf: string | null;
}

export const EMPTY_BENCHMARKS: InvestmentBenchmarks = { cdi12mPct: null, cdiAsOf: null, fipezapSale12mPct: null, fipezapAsOf: null };

async function cdi12m(): Promise<Pick<InvestmentBenchmarks, "cdi12mPct" | "cdiAsOf">> {
    try {
        const meta = await getIndexMetadata("CDI");
        const [latest] = meta ? await getIndexValues(meta.id, 1) : [];
        return latest && latest.accumulated_12m !== null
            ? { cdi12mPct: latest.accumulated_12m, cdiAsOf: latest.reference_date }
            : { cdi12mPct: null, cdiAsOf: null };
    } catch (err) {
        console.error("[Investment benchmarks] CDI failed:", (err as Error).message);
        return { cdi12mPct: null, cdiAsOf: null };
    }
}

async function fipezapSale12m(supabase: SupabaseClient): Promise<Pick<InvestmentBenchmarks, "fipezapSale12mPct" | "fipezapAsOf">> {
    try {
        const { data } = await supabase
            .from("fipezap_series")
            .select("reference_date, value")
            .eq("index_type", "venda")
            .eq("metric", "var_12m")
            .eq("dormitorios", "total")
            .order("reference_date", { ascending: false })
            .limit(1)
            .maybeSingle();
        return data ? { fipezapSale12mPct: Number(data.value), fipezapAsOf: data.reference_date as string } : { fipezapSale12mPct: null, fipezapAsOf: null };
    } catch (err) {
        console.error("[Investment benchmarks] FipeZap failed:", (err as Error).message);
        return { fipezapSale12mPct: null, fipezapAsOf: null };
    }
}

export async function loadInvestmentBenchmarks(supabase: SupabaseClient): Promise<InvestmentBenchmarks> {
    const [cdi, fipezap] = await Promise.all([cdi12m(), fipezapSale12m(supabase)]);
    return { ...cdi, ...fipezap };
}
