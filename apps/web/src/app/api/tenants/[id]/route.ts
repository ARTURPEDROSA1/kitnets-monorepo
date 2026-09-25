import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { tenantInputSchema } from "@/lib/schemas/tenant";
import { assertTenantRelations, cpfUniqueViolation, loadOwnedTenant } from "@/lib/tenants-server";

type Params = { id: string };

/**
 * PUT /api/tenants/[id]
 * Updates a tenant the account owns. Validation: lib/schemas/tenant.ts.
 */
export const PUT = withAuth<typeof tenantInputSchema, Params>(
    { body: tenantInputSchema, tag: "Tenants PUT" },
    async ({ body, params, profileId, supabase }) => {
        const existing = await loadOwnedTenant(supabase, params.id, profileId, "editar");
        await assertTenantRelations(supabase, profileId, body, { excludeTenantId: params.id, previousCpf: existing.cpf as string });

        const { data: tenant, error } = await supabase
            .from("tenants")
            .update(body)
            .eq("id", params.id)
            .select()
            .single();

        if (error) {
            console.error("[Tenants PUT] Update error:", error);
            if (cpfUniqueViolation(error)) {
                return NextResponse.json({ errors: { cpf: "Este CPF já está cadastrado na sua conta." } }, { status: 409 });
            }
            return NextResponse.json({ error: "Erro ao atualizar inquilino." }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tenant: { ...tenant, property_name: null, agency_name: null, agent_name: null, photo_url: null },
        });
    }
);

/**
 * DELETE /api/tenants/[id]
 * Soft-deletes a tenant the account owns.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Tenants DELETE" }, async ({ params, profileId, supabase }) => {
    await loadOwnedTenant(supabase, params.id, profileId, "excluir");

    const { error } = await supabase
        .from("tenants")
        .update({ deleted_at: new Date().toISOString(), deleted_by: profileId })
        .eq("id", params.id);

    if (error) {
        console.error("[Tenants DELETE] Error:", error);
        return NextResponse.json({ error: "Erro ao excluir inquilino." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
});
