import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { sellInputSchema } from "@/lib/schemas/new-investment";
import { loadOwnedInvestment } from "@/lib/new-investments-server";

type Params = { id: string };

/**
 * POST /api/investments/[id]/sell  { sold_on, sale_price, sale_costs_pct? }
 *
 * The other way a project ends: sold, before or after the keys. The row keeps everything and is
 * marked SOLD with the sale on it; the metrics then read the realized gain and TIR from what was
 * actually paid against the net sale. Undo is a PATCH back to ACTIVE with the sale fields cleared.
 */
export const POST = withAuth<typeof sellInputSchema, Params>(
    { body: sellInputSchema, tag: "Investment Sell" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);
        const { error } = await supabase
            .from("new_investments")
            .update({ status: "SOLD", sold_on: body.sold_on, sale_price: body.sale_price, sale_costs_pct: body.sale_costs_pct })
            .eq("id", params.id)
            .eq("owner_id", profileId);
        if (error) {
            console.error("[Investment Sell] update failed:", error.message);
            throw new Error(`investment sell failed: ${error.message}`);
        }
        return NextResponse.json({ ok: true });
    }
);
