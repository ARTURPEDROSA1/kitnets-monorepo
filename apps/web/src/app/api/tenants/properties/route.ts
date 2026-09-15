import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";

/**
 * GET /api/tenants/properties
 * The account's rental properties (standalone consumer units excluded) for
 * the tenant form's dropdown.
 */
export const GET = withAuth({ tag: "Tenants Properties GET" }, async ({ profileId, supabase }) => {
    const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name, electronic_id")
        .eq("owner_id", profileId)
        .order("name", { ascending: true });

    if (error) {
        console.error("[Tenants Properties GET] Error:", error);
        return NextResponse.json({ properties: [] });
    }

    const rentalProperties = (properties || [])
        .filter((p) => {
            if (!p.electronic_id) return true;
            try {
                return !JSON.parse(p.electronic_id).isStandaloneUc;
            } catch {
                return true;
            }
        })
        .map(({ id, name }) => ({ id, name }));

    return NextResponse.json({ properties: rentalProperties });
});
