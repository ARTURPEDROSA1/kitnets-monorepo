import { NextResponse } from "next/server";
import { HttpError, notFound, withAuth } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { contractView, finishContract, loadContractRow, referenceOf } from "@/lib/contract/document-server";

type Params = { id: string };

/**
 * POST /api/leases/[id]/contrato/concluir
 * The owner says every party signed (a signature Kitnets could not count, a witness on paper…): the
 * latest signed copy becomes the lease's CONTRACT file.
 */
export const POST = withAuth<undefined, Params>({ tag: "Contract finish" }, async ({ params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);
    const row = await loadContractRow(supabase, params.id);
    if (!row) throw notFound("Este contrato ainda não foi gerado.");
    if (row.status !== "ACCEPTED") throw new HttpError(409, { error: row.status === "SIGNED" ? "Este contrato já está assinado." : "Aceite o contrato antes." });
    const reference = await referenceOf(supabase, params.id);
    const done = await finishContract(supabase, row, reference);
    return NextResponse.json({ document: await contractView(supabase, done, reference) });
});
