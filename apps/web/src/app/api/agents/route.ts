import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { agentInputSchema } from "@/lib/schemas/agent";
import { agentUniqueViolation, assertAgentRelations } from "@/lib/agents-server";

/**
 * GET /api/agents
 * All of the account's agents (soft-deleted excluded) with the agency name flattened in.
 */
export const GET = withAuth({ tag: "Agents GET" }, async ({ profileId, supabase }) => {
    const { data: agents, error } = await supabase
        .from("agents")
        .select(`
            *,
            agencies!agents_agency_id_fkey ( name )
        `)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[Agents GET] Error:", error);
        return NextResponse.json({ agents: [] });
    }

    const agentsWithAgency = (agents || []).map((a: Record<string, unknown>) => {
        const agencies = a.agencies as { name: string } | null;
        return { ...a, agency_name: agencies?.name || null, agencies: undefined };
    });

    return NextResponse.json({ agents: agentsWithAgency });
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
