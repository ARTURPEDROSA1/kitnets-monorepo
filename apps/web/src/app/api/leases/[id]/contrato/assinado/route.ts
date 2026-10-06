import { NextResponse } from "next/server";
import { notFound, withAuth } from "@/lib/api-route";
import { loadOwnedLease } from "@/lib/leases-server";
import { contractView, fileFromForm, loadContractRow, receiveSignedCopy, referenceOf } from "@/lib/contract/document-server";

type Params = { id: string };

/**
 * POST /api/leases/[id]/contrato/assinado
 * multipart/form-data `file`: a copy signed on gov.br, with more signatures than the last one. With
 * every party's signature the contract is signed and becomes the lease's CONTRACT file.
 */
export const POST = withAuth<undefined, Params>(
    { tag: "Contract signed copy", limit: { scope: "contract-signed", limit: 20, windowMs: 60_000 } },
    async ({ req, params, profileId, supabase }) => {
        await loadOwnedLease(supabase, params.id, profileId);
        const row = await loadContractRow(supabase, params.id);
        if (!row) throw notFound("Este contrato ainda não foi gerado.");
        const reference = await referenceOf(supabase, params.id);
        const result = await receiveSignedCopy(supabase, row, await fileFromForm(req), "OWNER", reference);
        return NextResponse.json({ count: result.count, complete: result.complete, needsReview: result.needsReview, document: await contractView(supabase, result.row, reference) });
    },
);
