import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadAgentDashboard } from "@/lib/agent-views-server";

type Params = { id: string };

/**
 * GET /api/agents/[id]/dashboard
 * One corretor with the agency name, the leases that name them (newest first) and the tenants
 * they look after. Same builder the Corretores page preloads with (lib/agent-views-server.ts).
 */
export const GET = withAuth<undefined, Params>({ tag: "Agent Dashboard GET" }, async ({ params, profileId, supabase }) => {
    return NextResponse.json(await loadAgentDashboard(supabase, params.id, profileId));
});
