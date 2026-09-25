import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { tenantInputSchema } from "@/lib/schemas/tenant";
import { assertTenantRelations, cpfUniqueViolation } from "@/lib/tenants-server";
import { loadTenantList } from "@/lib/tenant-views-server";

/**
 * GET /api/tenants
 * All of the account's tenants (soft-deleted excluded) with property, agency and agent names
 * flattened in and a signed photo URL, plus every lease of the account keyed by tenant
 * (`leases`, one entry per tenant on the lease). Same builder the Inquilinos page preloads
 * with (lib/tenant-views-server.ts).
 */
export const GET = withAuth({ tag: "Tenants GET" }, async ({ profileId, supabase }) => {
    try {
        return NextResponse.json(await loadTenantList(supabase, profileId));
    } catch (err) {
        console.error("[Tenants GET] Error:", (err as Error).message);
        return NextResponse.json({ tenants: [], leases: [] });
    }
});

/**
 * POST /api/tenants
 * Creates a tenant. Validation and normalisation: lib/schemas/tenant.ts.
 */
export const POST = withAuth({ body: tenantInputSchema, tag: "Tenants POST" }, async ({ body, profileId, supabase }) => {
    await assertTenantRelations(supabase, profileId, body);

    const { data: tenant, error } = await supabase
        .from("tenants")
        .insert({ user_id: profileId, ...body })
        .select()
        .single();

    if (error) {
        console.error("[Tenants POST] Insert error:", error);
        if (cpfUniqueViolation(error)) {
            return NextResponse.json({ errors: { cpf: "Este CPF já está cadastrado na sua conta." } }, { status: 409 });
        }
        return NextResponse.json({ error: "Erro ao cadastrar inquilino." }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        tenant: { ...tenant, property_name: null, agency_name: null, agent_name: null, photo_url: null },
    });
});
