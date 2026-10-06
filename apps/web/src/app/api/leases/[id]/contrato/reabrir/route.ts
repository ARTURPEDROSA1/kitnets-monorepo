import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { contractView, referenceOf, reopenContract } from "@/lib/contract/document-server";

type Params = { id: string };

/**
 * POST /api/leases/[id]/contrato/reabrir
 * Back to editing an accepted contract: its PDF and any copy signed so far stop counting, the
 * tenant's link stops working. A signed contract changes only by addendum (409).
 */
export const POST = withAuth<undefined, Params>({ tag: "Contract reopen" }, async ({ params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);
    const row = await reopenContract(supabase, params.id);
    return NextResponse.json({ document: await contractView(supabase, row, await referenceOf(supabase, params.id)) });
});
