import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadDashboard } from "@/lib/dashboard-views-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 * → the DashboardView bundle (lib/dashboard-views.ts): every module's figures, the map pins, the gateways
 *   for the pilot accounts. The page preloads the same bundle on the server; the client calls this when
 *   it was not seeded.
 */
export const GET = withAuth({ tag: "Dashboard GET" }, async ({ profileId, supabase, userId }) =>
    NextResponse.json(await loadDashboard(supabase, profileId, userId)));
