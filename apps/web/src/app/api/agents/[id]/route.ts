import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/lib/api-route";
import { agentInputSchema } from "@/lib/schemas/agent";
import { agentUniqueViolation, assertAgentRelations, loadOwnedAgent } from "@/lib/agents-server";

type Params = { id: string };

/**
 * PUT /api/agents/[id]
 * Updates an agent the account owns. Validation: lib/schemas/agent.ts.
 */
export const PUT = withAuth<typeof agentInputSchema, Params>(
    { body: agentInputSchema, tag: "Agents PUT" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedAgent(supabase, params.id, profileId, "editar", "deleted_at");
        await assertAgentRelations(supabase, body, {
            excludeAgentId: params.id,
            cpfConflictMessage: "Este CPF já está cadastrado por outro corretor.",
        });

        const { data: agent, error } = await supabase
            .from("agents")
            .update(body)
            .eq("id", params.id)
            .select()
            .single();

        if (error) {
            console.error("[Agents PUT] Update error:", error);
            const dup = agentUniqueViolation(error);
            if (dup) return NextResponse.json({ errors: dup }, { status: 409 });
            return NextResponse.json({ error: "Erro ao atualizar corretor." }, { status: 500 });
        }

        return NextResponse.json({ success: true, agent });
    }
);

/**
 * DELETE /api/agents/[id]
 * Soft-deletes an agent the account owns.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Agents DELETE" }, async ({ params, profileId, supabase }) => {
    const agent = await loadOwnedAgent(supabase, params.id, profileId, "excluir", "deleted_at", { includeDeleted: true });
    if (agent.deleted_at) throw new HttpError(409, { error: "Corretor já foi excluído." });

    const { error } = await supabase
        .from("agents")
        .update({ deleted_at: new Date().toISOString(), deleted_by: profileId })
        .eq("id", params.id);

    if (error) {
        console.error("[Agents DELETE] Error:", error);
        return NextResponse.json({ error: "Erro ao excluir corretor." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
});
