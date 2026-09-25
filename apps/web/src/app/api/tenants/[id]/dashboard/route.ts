import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadTenantDashboard } from "@/lib/tenant-views-server";

type Params = { id: string };

/**
 * GET /api/tenants/[id]/dashboard
 * Everything one tenant's dashboard shows, in one request: the tenant with names and a signed
 * photo URL, their contracts (newest first, with their role on each) and the property's income
 * ledger over the months of the contract in force (else the latest one). Same builder the page
 * preloads with (lib/tenant-views-server.ts); the client calls this to refresh after an edit.
 */
export const GET = withAuth<undefined, Params>({ tag: "Tenant Dashboard GET" }, async ({ params, profileId, supabase }) => {
    return NextResponse.json(await loadTenantDashboard(supabase, params.id, profileId));
});
