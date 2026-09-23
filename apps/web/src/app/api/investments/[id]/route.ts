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

type Params = { id: string };

/**
 * GET    /api/investments/[id]  → the whole dashboard: investment, quadro resumo, payments,
 *                                 documents and the KPIs computed from them.
 * PATCH  /api/investments/[id]  → any subset of the fields; `schedules`, when present, replaces
 *                                 the quadro resumo as a block.
 * DELETE /api/investments/[id]  → the investment, its payments, its documents and their files.
 */
export const GET = withAuth<undefined, Params>({ tag: "Investment GET" }, async ({ params, profileId, supabase }) => {
    const bundle = await loadInvestmentBundle(supabase, params.id, profileId);
    return NextResponse.json({
        ...bundle,
        metrics: computeInvestmentMetrics(bundle.investment, bundle.schedules, bundle.payments),
    });
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

        const bundle = await loadInvestmentBundle(supabase, params.id, profileId);
        return NextResponse.json({
            ...bundle,
            metrics: computeInvestmentMetrics(bundle.investment, bundle.schedules, bundle.payments),
        });
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
