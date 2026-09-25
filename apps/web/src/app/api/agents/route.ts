import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { agentInputSchema } from "@/lib/schemas/agent";
import { agentUniqueViolation, assertAgentRelations } from "@/lib/agents-server";
import { loadAgentList } from "@/lib/agent-views-server";

/**
 * GET /api/agents
 * All of the account's agents (soft-deleted excluded) with the agency name flattened in, plus the
 * leases and tenants that name a corretor (`leases`, `tenants`). Same builder the Corretores
 * page preloads with (lib/agent-views-server.ts).
 */
export const GET = withAuth({ tag: "Agents GET" }, async ({ profileId, supabase }) => {
    try {
        return NextResponse.json(await loadAgentList(supabase, profileId));
    } catch (err) {
        console.error("[Agents GET] Error:", (err as Error).message);
        return NextResponse.json({ agents: [], leases: [], tenants: [] });
    }
});

/**
 * POST /api/agents
 * Creates an agent. Validation and normalisation: lib/schemas/agent.ts.
 */
export const POST = withAuth({ body: agentInputSchema, tag: "Agents POST" }, async ({ body, profileId, supabase }) => {
    await assertAgentRelations(supabase, body);

    const { data: agent, error } = await supabase
        .from("agents")
        .insert({ user_id: profileId, ...body })
        .select()
        .single();

    if (error) {
        console.error("[Agents POST] Insert error:", error);
        const dup = agentUniqueViolation(error);
        if (dup) return NextResponse.json({ errors: dup }, { status: 409 });
        return NextResponse.json({ error: "Erro ao cadastrar corretor." }, { status: 500 });
    }

    return NextResponse.json({ success: true, agent: { ...agent, agency_name: null } });
});
