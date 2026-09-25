import type { AdminSupabase } from "@/lib/api-auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api-route";
import type { TenantInput } from "@/lib/schemas/tenant";

/** The tenant row (the given columns) if it exists, is not deleted and belongs to the account; 404/403 otherwise. */
export async function loadOwnedTenant(supabase: AdminSupabase, tenantId: string, profileId: string, action: string, columns = "id, user_id, cpf, status") {
    const { data } = await supabase
        .from("tenants")
        .select(`id, user_id, ${columns}` as "*")
        .eq("id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
    const tenant = data as (Record<string, unknown> & { id: string; user_id: string }) | null;
    if (!tenant) throw notFound("Inquilino não encontrado.");
    if (tenant.user_id !== profileId) throw forbidden(`Sem permissão para ${action} este inquilino.`);
    return tenant;
}

/** Private bucket of the tenants' photos (signed URLs; the routes upload with the service role). */
export const TENANT_PHOTO_BUCKET = "tenant-photos";

/** Removes a tenant's stored photo, if there is one. */
export async function removeTenantPhoto(supabase: AdminSupabase, photoPath: string | null | undefined): Promise<void> {
    if (!photoPath) return;
    await supabase.storage.from(TENANT_PHOTO_BUCKET).remove([photoPath]);
}

/**
 * Cross-record checks shared by tenant create and update: CPF unique within
 * the account, property owned by the account, agency and agent consistent.
 * Throws HttpErrors in the `{ errors: { field } }` shape the form expects.
 */
export async function assertTenantRelations(
    supabase: AdminSupabase,
    profileId: string,
    data: TenantInput,
    opts: { excludeTenantId?: string; previousCpf?: string | null } = {}
): Promise<void> {
    if (data.cpf !== opts.previousCpf) {
        let q = supabase
            .from("tenants")
            .select("id")
            .eq("user_id", profileId)
            .eq("cpf", data.cpf)
            .is("deleted_at", null);
        if (opts.excludeTenantId) q = q.neq("id", opts.excludeTenantId);
        const { data: dup } = await q.maybeSingle();
        if (dup) throw conflict({ cpf: "Este CPF já está cadastrado na sua conta." });
    }

    const { data: property } = await supabase
        .from("properties")
        .select("id")
        .eq("id", data.property_id)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (!property) throw badRequest({ property_id: "Imóvel não encontrado ou não pertence à sua conta." });

    if (data.management_type === "AGENCY" && data.agency_id) {
        const { data: agency } = await supabase
            .from("agencies")
            .select("id")
            .eq("id", data.agency_id)
            .is("deleted_at", null)
            .maybeSingle();
        if (!agency) throw badRequest({ agency_id: "Imobiliária não encontrada." });
    }

    if (data.agent_id && data.agency_id) {
        const { data: agent } = await supabase
            .from("agents")
            .select("id, agency_id")
            .eq("id", data.agent_id)
            .is("deleted_at", null)
            .maybeSingle();
        if (!agent) throw badRequest({ agent_id: "Corretor não encontrado." });
        if (agent.agency_id !== data.agency_id) {
            throw badRequest({ agent_id: "Corretor não pertence à imobiliária selecionada." });
        }
    }
}

/** Postgres unique-violation on the CPF column, mapped to the form's message. */
export function cpfUniqueViolation(error: { code?: string; message?: string } | null): boolean {
    return !!error && error.code === "23505" && !!error.message?.includes("cpf");
}
