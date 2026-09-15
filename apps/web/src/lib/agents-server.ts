import type { AdminSupabase } from "@/lib/api-auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api-route";
import type { AgentInput } from "@/lib/schemas/agent";

/**
 * Shared server-side pieces for the agents (corretores) routes.
 */

/** The agent row if it exists (optionally including soft-deleted) and belongs to the account. */
export async function loadOwnedAgent<T extends string>(
    supabase: AdminSupabase,
    agentId: string,
    profileId: string,
    action: string,
    columns: T,
    opts: { includeDeleted?: boolean } = {}
) {
    let q = supabase.from("agents").select(`id, user_id, ${columns}` as "*").eq("id", agentId);
    if (!opts.includeDeleted) q = q.is("deleted_at", null);
    const { data } = await q.maybeSingle();
    const agent = data as (Record<string, unknown> & { id: string; user_id: string }) | null;

    if (!agent) throw notFound("Corretor não encontrado.");
    if (agent.user_id !== profileId) throw forbidden(`Sem permissão para ${action} este corretor.`);
    return agent;
}

/**
 * CRECI and CPF are unique across the whole table (a corretor is a person);
 * the agency must exist for agency-based agents.
 */
export async function assertAgentRelations(
    supabase: AdminSupabase,
    data: AgentInput,
    opts: { excludeAgentId?: string; cpfConflictMessage?: string } = {}
): Promise<void> {
    let creci = supabase
        .from("agents")
        .select("id")
        .eq("creci_number", data.creci_number)
        .eq("creci_state", data.creci_state)
        .is("deleted_at", null);
    if (opts.excludeAgentId) creci = creci.neq("id", opts.excludeAgentId);
    const { data: creciDup } = await creci.maybeSingle();
    if (creciDup) {
        throw conflict({ creci_number: `CRECI-${data.creci_state} ${data.creci_number} já está cadastrado.` });
    }

    if (data.cpf) {
        let cpf = supabase.from("agents").select("id").eq("cpf", data.cpf).is("deleted_at", null);
        if (opts.excludeAgentId) cpf = cpf.neq("id", opts.excludeAgentId);
        const { data: cpfDup } = await cpf.maybeSingle();
        if (cpfDup) throw conflict({ cpf: opts.cpfConflictMessage ?? "Este CPF já está cadastrado." });
    }

    if (data.agent_type === "IMOBILIARIA" && data.agency_id) {
        const { data: agency } = await supabase
            .from("agencies")
            .select("id")
            .eq("id", data.agency_id)
            .is("deleted_at", null)
            .maybeSingle();
        if (!agency) throw badRequest({ agency_id: "Imobiliária não encontrada." });
    }
}

/** Maps a Postgres unique violation to the form's field message, or null. */
export function agentUniqueViolation(error: { code?: string; message?: string } | null): Record<string, string> | null {
    if (!error || error.code !== "23505") return null;
    if (error.message?.includes("creci")) return { creci_number: "Este CRECI já está cadastrado." };
    if (error.message?.includes("cpf")) return { cpf: "Este CPF já está cadastrado." };
    return null;
}

const PHOTO_BUCKET = "agent-photos";
const PHOTO_PUBLIC_SEGMENT = `/storage/v1/object/public/${PHOTO_BUCKET}/`;

/** Removes the stored object behind a public agent-photo URL, if it is one of ours. */
export async function removeAgentPhoto(supabase: AdminSupabase, photoUrl: string | null | undefined): Promise<void> {
    if (!photoUrl) return;
    const idx = photoUrl.indexOf(PHOTO_PUBLIC_SEGMENT);
    if (idx === -1) return;
    await supabase.storage.from(PHOTO_BUCKET).remove([photoUrl.substring(idx + PHOTO_PUBLIC_SEGMENT.length)]);
}

export const AGENT_PHOTO_BUCKET = PHOTO_BUCKET;
