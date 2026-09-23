import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { promoteInputSchema } from "@/lib/schemas/new-investment";
import { loadOwnedInvestment, promoteInvestment } from "@/lib/new-investments-server";

type Params = { id: string };

/**
 * POST /api/investments/[id]/promote  { name?, keys_delivered_on? }
 *
 * End of the incubation cycle: the unit is built and either paid off or already producing rent, so
 * it stops being a plan and becomes a property in Imóveis. The investment stays here as its
 * payment history, marked COMPLETED and pointing at the property it became.
 */
export const POST = withAuth<typeof promoteInputSchema, Params>(
    { body: promoteInputSchema, tag: "Investment Promote" },
    async ({ body, params, profileId, supabase }) => {
        const investment = await loadOwnedInvestment(supabase, params.id, profileId);
        if (investment.promoted_property_id) {
            return NextResponse.json({
                property: { id: investment.promoted_property_id, name: investment.name },
                already: true,
            });
        }

        const { propertyId, propertyName } = await promoteInvestment(supabase, profileId, investment, body);
        return NextResponse.json({ property: { id: propertyId, name: propertyName } }, { status: 201 });
    }
);
