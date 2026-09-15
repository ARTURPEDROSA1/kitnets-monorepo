import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { tenantInputSchema } from "@/lib/schemas/tenant";
import { assertTenantRelations, cpfUniqueViolation } from "@/lib/tenants-server";

/**
 * GET /api/tenants
 * All of the account's tenants (soft-deleted excluded) with property, agency
 * and agent names flattened in.
 */
export const GET = withAuth({ tag: "Tenants GET" }, async ({ profileId, supabase }) => {
    const { data: tenants, error } = await supabase
        .from("tenants")
        .select(`
            *,
            properties!tenants_property_id_fkey ( name ),
            agencies!tenants_agency_id_fkey ( name ),
            agents!tenants_agent_id_fkey ( full_name )
        `)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[Tenants GET] Error:", error);
        return NextResponse.json({ tenants: [] });
    }

    const tenantsWithDetails = (tenants || []).map((t: Record<string, unknown>) => {
        const property = t.properties as { name: string } | null;
        const agency = t.agencies as { name: string } | null;
        const agent = t.agents as { full_name: string } | null;
        return {
            ...t,
            property_name: property?.name || null,
            agency_name: agency?.name || null,
            agent_name: agent?.full_name || null,
            properties: undefined,
            agencies: undefined,
            agents: undefined,
        };
    });

    return NextResponse.json({ tenants: tenantsWithDetails });
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
        tenant: { ...tenant, property_name: null, agency_name: null, agent_name: null },
    });
});
