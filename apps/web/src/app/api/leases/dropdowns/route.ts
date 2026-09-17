import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";

/**
 * GET /api/leases/dropdowns
 * Properties, tenants, agencies and agents for the lease form's selects.
 * Agencies come through the membership table, not a direct owner column.
 */
export const GET = withAuth({ tag: "Leases Dropdowns GET" }, async ({ profileId, supabase }) => {
    const [propertiesRes, tenantsRes, membershipsRes, agentsRes] = await Promise.all([
        supabase.from("properties").select("id, name, electronic_id").eq("owner_id", profileId).order("name", { ascending: true }),
        supabase.from("tenants").select("id, full_name").eq("user_id", profileId).is("deleted_at", null).order("full_name", { ascending: true }),
        supabase.from("agency_members").select("agency_id").eq("user_id", profileId),
        supabase.from("agents").select("id, full_name, agency_id").eq("user_id", profileId).is("deleted_at", null).order("full_name", { ascending: true }),
    ]);

    let agencies: { id: string; name: string }[] = [];
    const agencyIds = (membershipsRes.data || []).map((m) => m.agency_id as string);
    if (agencyIds.length > 0) {
        const { data } = await supabase
            .from("agencies")
            .select("id, name")
            .in("id", agencyIds)
            .is("deleted_at", null)
            .order("name", { ascending: true });
        agencies = (data as { id: string; name: string }[] | null) || [];
    }

    // Standalone consumer units are energy-only records, not rentable properties.
    const properties = (propertiesRes.data || [])
        .filter((p) => {
            if (!p.electronic_id) return true;
            try {
                return !JSON.parse(p.electronic_id as string).isStandaloneUc;
            } catch {
                return true;
            }
        })
        .map(({ id, name }) => ({ id, name }));

    return NextResponse.json({
        properties,
        tenants: tenantsRes.data || [],
        agencies,
        agents: agentsRes.data || [],
    });
});
