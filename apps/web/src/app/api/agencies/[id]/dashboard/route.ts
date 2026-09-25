import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadAgencyDashboard } from "@/lib/agency-views-server";

type Params = { id: string };

/**
 * GET /api/agencies/[id]/dashboard
 * One agency with the caller's role, the leases it administers (newest first), the tenants it
 * looks after and the corretores who work for it. Same builder the Imobiliárias page preloads
 * with (lib/agency-views-server.ts).
 */
export const GET = withAuth<undefined, Params>({ tag: "Agency Dashboard GET" }, async ({ params, profileId, supabase }) => {
    return NextResponse.json(await loadAgencyDashboard(supabase, params.id, profileId));
});
