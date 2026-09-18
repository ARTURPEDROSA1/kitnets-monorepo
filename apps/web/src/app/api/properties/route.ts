import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { propertyInputSchema } from "@/lib/schemas/property";
import { createRentalProperty } from "@/lib/properties-server";

/**
 * POST /api/properties
 * Registers a rental property from its name and address (used by the lease
 * import when the contract's property is not registered yet). The rest of the
 * property's data is completed on the Imóveis page.
 */
export const POST = withAuth({ body: propertyInputSchema, tag: "Properties POST" }, async ({ body, profileId, supabase }) => {
    const property = await createRentalProperty(supabase, profileId, body);
    return NextResponse.json({ property }, { status: 201 });
});
