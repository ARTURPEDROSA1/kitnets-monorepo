import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { leaseInputSchema } from "@/lib/schemas/lease";
import { activeLeaseWarning, assertLeaseRelations, writeLeaseChildren } from "@/lib/leases-server";
import { loadLeaseRows, loadPropertyKinds, withRealizedMonths } from "@/lib/lease-views-server";

/**
 * GET /api/leases
 * The account's leases (soft-deleted excluded) with property, tenant, agency and agent names, their
 * charges and how many files each has (so the list can offer "open the contract" without loading
 * them all) and the months the ledger confirmed for each (the totals' "executado"), plus each
 * property's kind (single/multi) for the hub's cards.
 * Same builders the Contratos page preloads with (lib/lease-views-server.ts).
 */
export const GET = withAuth({ tag: "Leases GET" }, async ({ profileId, supabase }) => {
    try {
        const [rows, propertyKinds] = await Promise.all([loadLeaseRows(supabase, profileId), loadPropertyKinds(supabase, profileId)]);
        return NextResponse.json({ leases: await withRealizedMonths(supabase, rows), propertyKinds });
    } catch (err) {
        console.error("[Leases GET] Error:", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar contratos." }, { status: 500 });
    }
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
