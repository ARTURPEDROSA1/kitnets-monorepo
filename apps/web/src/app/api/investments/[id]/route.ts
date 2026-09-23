import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { investmentPatchSchema } from "@/lib/schemas/new-investment";
import {
    investmentRow,
    loadInvestmentBundle,
    loadOwnedInvestment,
    removeInvestmentFiles,
    replaceSchedules,
} from "@/lib/new-investments-server";
import { computeInvestmentMetrics } from "@/lib/new-investment-metrics";
import { loadInvestmentBenchmarks } from "@/lib/new-investment-benchmarks-server";
import type { AdminSupabase } from "@/lib/api-auth";

type Params = { id: string };

/** The whole dashboard: the bundle, the KPIs computed from it, and the market figures they are read against. */
async function dashboardPayload(supabase: AdminSupabase, id: string, profileId: string) {
    const [bundle, benchmarks] = await Promise.all([loadInvestmentBundle(supabase, id, profileId), loadInvestmentBenchmarks(supabase)]);
    return {
        ...bundle,
        metrics: computeInvestmentMetrics(bundle.investment, bundle.schedules, bundle.payments),
        benchmarks,
    };
}

/**
 * GET    /api/investments/[id]  → the whole dashboard: investment, quadro resumo, payments,
 *                                 documents, the KPIs computed from them and the benchmarks
 *                                 (CDI 12 m, FipeZap venda 12 m) they are compared with.
 * PATCH  /api/investments/[id]  → any subset of the fields; `schedules`, when present, replaces
 *                                 the quadro resumo as a block.
 * DELETE /api/investments/[id]  → the investment, its payments, its documents and their files.
 */
export const GET = withAuth<undefined, Params>({ tag: "Investment GET" }, async ({ params, profileId, supabase }) => {
    return NextResponse.json(await dashboardPayload(supabase, params.id, profileId));
});

export const PATCH = withAuth<typeof investmentPatchSchema, Params>(
    { body: investmentPatchSchema, tag: "Investment PATCH" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);

        const row = investmentRow(body);
        if (Object.keys(row).length > 0) {
            const { error } = await supabase
                .from("new_investments")
                .update(row)
                .eq("id", params.id)
                .eq("owner_id", profileId);
            if (error) {
                console.error("[Investment PATCH] update failed:", error.message);
                throw new Error(`investment update failed: ${error.message}`);
            }
        }
        if (body.schedules) {
            await replaceSchedules(supabase, params.id, profileId, body.schedules);
        }

        return NextResponse.json(await dashboardPayload(supabase, params.id, profileId));
    }
);

export const DELETE = withAuth<undefined, Params>({ tag: "Investment DELETE" }, async ({ params, profileId, supabase }) => {
    await loadOwnedInvestment(supabase, params.id, profileId);

    // Files first: a failed row delete leaves nothing behind, a failed file delete would.
    await removeInvestmentFiles(supabase, params.id);
    const { error } = await supabase.from("new_investments").delete().eq("id", params.id).eq("owner_id", profileId);
    if (error) {
        console.error("[Investment DELETE] delete failed:", error.message);
        throw new Error(`investment delete failed: ${error.message}`);
    }
    return NextResponse.json({ success: true });
});
