import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadLeaseDashboard } from "@/lib/lease-views-server";

type Params = { id: string };

/**
 * GET /api/leases/[id]/dashboard
 * Everything one contract's dashboard shows, in one request: the lease with names, additional
 * tenants, charges and documents (signed URLs), the tenant's contact, the property's income
 * ledger over the lease's months and the lease's index series. Same builder the page preloads
 * with (lib/lease-views-server.ts); the client calls this to refresh after an edit.
 */
export const GET = withAuth<undefined, Params>({ tag: "Lease Dashboard GET" }, async ({ params, profileId, supabase }) => {
    return NextResponse.json(await loadLeaseDashboard(supabase, params.id, profileId));
});
