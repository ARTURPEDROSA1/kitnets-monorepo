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

    // how many files each lease has, so the list can offer "open the contract" without loading them all
    const ids = (leases || []).map((l) => String((l as Record<string, unknown>).id));
    const counts = new Map<string, number>();
    if (ids.length > 0) {
        const { data: docs } = await supabase.from("lease_documents").select("lease_id").in("lease_id", ids);
        for (const d of docs || []) counts.set(d.lease_id, (counts.get(d.lease_id) ?? 0) + 1);
    }

    return NextResponse.json({
        leases: (leases || []).map((l) => {
            const flat = flattenLease(l as Record<string, unknown>);
            return { ...flat, document_count: counts.get(String(flat.id)) ?? 0 };
        }),
    });
});

/**
 * POST /api/leases
 * Creates a lease with its additional tenants and charges. Validation: lib/schemas/lease.ts.
 */
export const POST = withAuth({ body: leaseInputSchema, tag: "Leases POST" }, async ({ body, profileId, supabase }) => {
    const { unit_name } = await assertLeaseRelations(supabase, profileId, body.lease);
    const warning = await activeLeaseWarning(supabase, profileId, body.lease);

    const { data: lease, error } = await supabase
        .from("leases")
        .insert({ user_id: profileId, ...body.lease, unit_name })
        .select()
        .single();

    if (error) {
        console.error("[Leases POST] Insert error:", error);
        return NextResponse.json({ error: "Erro ao criar contrato." }, { status: 500 });
    }

    await writeLeaseChildren(supabase, profileId, lease.id, body, { tag: "Leases POST" });

    return NextResponse.json({ lease, warning }, { status: 201 });
});
