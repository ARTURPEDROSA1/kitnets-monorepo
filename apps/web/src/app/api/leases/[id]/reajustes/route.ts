import { NextResponse } from "next/server";
import { badRequest, withAuth } from "@/lib/api-route";
import { todayBRT } from "@/lib/lease-dashboard";
import { removeAddendum, saveAddendum } from "@/lib/lease-adjustments-server";
import { leaseAddendumSchema } from "@/lib/schemas/lease-adjustment";

type Params = { id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/leases/[id]/reajustes
 * `{ effective_date, new_rent, new_condo?, index_code?, index_pct?, document_id?, notes? }` — an addendum
 * (or an agreement without a file): the truth of that date, whatever the index says. It takes the place
 * of the calculated adjustment of its date, the calculated rows after it are chained again, and the
 * lease's rent and condominium become what the history ends with.
 */
export const POST = withAuth<typeof leaseAddendumSchema, Params>({ body: leaseAddendumSchema, tag: "Lease Adjustments POST" }, async ({ params, body, profileId, supabase }) => {
    if (!body) throw badRequest({ new_rent: "Informe o novo valor do aluguel." });
    await saveAddendum(supabase, params.id, profileId, body, todayBRT());
    return NextResponse.json({ ok: true }, { status: 201 });
});

/**
 * DELETE /api/leases/[id]/reajustes?id=…
 * Removes the lease's latest adjustment when it is an addendum; the amounts go back to what they were,
 * and the calculation takes that date again the next time the history is read.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Lease Adjustments DELETE" }, async ({ req, params, profileId, supabase }) => {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!UUID.test(id)) throw badRequest({ id: "Reajuste inválido." });
    await removeAddendum(supabase, params.id, profileId, id);
    return NextResponse.json({ ok: true });
});
