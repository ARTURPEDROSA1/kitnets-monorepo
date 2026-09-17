import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { leaseInputSchema } from "@/lib/schemas/lease";
import {
    LEASE_SELECT_WITH_NAMES,
    activeLeaseWarning,
    assertLeaseRelations,
    flattenLease,
    writeLeaseChildren,
} from "@/lib/leases-server";

/**
 * GET /api/leases
 * The account's leases (soft-deleted excluded) with property, tenant, agency and agent names.
 */
export const GET = withAuth({ tag: "Leases GET" }, async ({ profileId, supabase }) => {
    const { data: leases, error } = await supabase
        .from("leases")
        .select(LEASE_SELECT_WITH_NAMES)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[Leases GET] Error:", error);
        return NextResponse.json({ error: "Erro ao carregar contratos." }, { status: 500 });
    }

    return NextResponse.json({ leases: (leases || []).map((l) => flattenLease(l as Record<string, unknown>)) });
});

/**
 * POST /api/leases
 * Creates a lease with its additional tenants and charges. Validation: lib/schemas/lease.ts.
 */
export const POST = withAuth({ body: leaseInputSchema, tag: "Leases POST" }, async ({ body, profileId, supabase }) => {
    await assertLeaseRelations(supabase, profileId, body.lease);
    const warning = await activeLeaseWarning(supabase, profileId, body.lease);

    const { data: lease, error } = await supabase
        .from("leases")
        .insert({ user_id: profileId, ...body.lease })
        .select()
        .single();

    if (error) {
        console.error("[Leases POST] Insert error:", error);
        return NextResponse.json({ error: "Erro ao criar contrato." }, { status: 500 });
    }

    await writeLeaseChildren(supabase, profileId, lease.id, body, { tag: "Leases POST" });

    return NextResponse.json({ lease, warning }, { status: 201 });
});
