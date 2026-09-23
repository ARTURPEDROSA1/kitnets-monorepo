import { NextResponse } from "next/server";
import { badRequest, withAuth } from "@/lib/api-route";
import { documentInputSchema } from "@/lib/schemas/new-investment";
import {
    INVESTMENT_DOCUMENTS_BUCKET,
    adoptStagedUpload,
    loadOwnedInvestment,
    mimeTypeOfPath,
    ownStagedPath,
} from "@/lib/new-investments-server";
import { signStorageUrl } from "@/lib/storage";

type Params = { id: string };

/**
 * GET  /api/investments/[id]/documents → the contract, marketing material, photos, floor plans and
 *                                        receipts, each with a signed URL (the bucket is private).
 * POST /api/investments/[id]/documents → adopts a staged upload (POST /api/investments/upload-url).
 */
export const GET = withAuth<undefined, Params>({ tag: "Investment Docs GET" }, async ({ params, profileId, supabase }) => {
    await loadOwnedInvestment(supabase, params.id, profileId);
    const { data, error } = await supabase
        .from("new_investment_documents")
        .select("id, investment_id, payment_id, kind, storage_path, file_name, mime_type, size_bytes, created_at")
        .eq("investment_id", params.id)
        .eq("owner_id", profileId)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("[Investment Docs GET] load failed:", error.message);
        throw new Error(`documents load failed: ${error.message}`);
    }

    const documents = await Promise.all(
        (data ?? []).map(async doc => ({
            ...doc,
            url: await signStorageUrl(supabase, INVESTMENT_DOCUMENTS_BUCKET, doc.storage_path as string),
        }))
    );
    return NextResponse.json({ documents });
});

export const POST = withAuth<typeof documentInputSchema, Params>(
    { body: documentInputSchema, tag: "Investment Docs POST" },
    async ({ body, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);

        // A receipt points at its payment, which must be one of this investment's.
        if (body.payment_id) {
            const { data: payment } = await supabase
                .from("new_investment_payments")
                .select("id")
                .eq("id", body.payment_id)
                .eq("investment_id", params.id)
                .eq("owner_id", profileId)
                .maybeSingle();
            if (!payment) throw badRequest({ payment_id: "Pagamento não encontrado." });
        }

        const staged = ownStagedPath(profileId, body.storage_path);
        if (!staged) throw badRequest({ storage_path: "Arquivo não encontrado. Envie o documento novamente." });
        const adopted = await adoptStagedUpload(supabase, params.id, staged);
        if (!adopted) throw badRequest({ storage_path: "Arquivo não encontrado. Envie o documento novamente." });

        const { data, error } = await supabase
            .from("new_investment_documents")
            .insert({
                investment_id: params.id,
                owner_id: profileId,
                payment_id: body.payment_id ?? null,
                kind: body.payment_id ? "RECEIPT" : body.kind,
                storage_path: adopted.path,
                file_name: body.file_name,
                mime_type: body.mime_type ?? mimeTypeOfPath(adopted.path),
                size_bytes: body.size_bytes ?? adopted.size,
            })
            .select()
            .single();
        if (error || !data) {
            console.error("[Investment Docs POST] insert failed:", error?.message);
            await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).remove([adopted.path]);
            throw new Error(`document insert failed: ${error?.message}`);
        }

        // The payment keeps a mirror of its first receipt, for the rows that predate the link.
        if (body.payment_id) {
            await supabase
                .from("new_investment_payments")
                .update({ receipt_path: adopted.path, receipt_name: body.file_name })
                .eq("id", body.payment_id)
                .eq("owner_id", profileId)
                .is("receipt_path", null);
        }

        // The first photo becomes the card's cover unless one was chosen already.
        if (body.kind === "PHOTO") {
            await supabase
                .from("new_investments")
                .update({ cover_path: adopted.path })
                .eq("id", params.id)
                .eq("owner_id", profileId)
                .is("cover_path", null);
        }

        const url = await signStorageUrl(supabase, INVESTMENT_DOCUMENTS_BUCKET, adopted.path);
        return NextResponse.json({ document: { ...data, url } }, { status: 201 });
    }
);
