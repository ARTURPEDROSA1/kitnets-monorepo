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
import { signStorageUrl, signStorageUrls } from "@/lib/storage";
import {
    CLASSIFIABLE_KINDS,
    CLASSIFY_MAX_BYTES,
    IMAGE_CLASSIFY_PROMPT,
    normalizeClassification,
    resolveKind,
    type ImageClassification,
} from "@/lib/new-investment-classify";
import type { ReadBy } from "@/lib/ai-reader-label";
import type { DocumentKind } from "@/lib/new-investments";
import type { AdminSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };
const TAG = "Investment Docs POST";

/**
 * GET  /api/investments/[id]/documents → the contract, marketing material, photos, floor plans and
 *                                        receipts, each with a signed URL (the bucket is private).
 * POST /api/investments/[id]/documents → adopts a staged upload (POST /api/investments/upload-url).
 *                                        A picture sent to Fotos, Plantas, Divulgação or Outros is
 *                                        looked at by the AI once; when it is sure the owner picked
 *                                        the wrong section, the file goes to the right one and the
 *                                        response says so (`classified`).
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

    // one storage call for every file, not one per file
    const signed = await signStorageUrls(supabase, INVESTMENT_DOCUMENTS_BUCKET, (data ?? []).map(doc => doc.storage_path as string));
    const documents = (data ?? []).map(doc => ({ ...doc, url: signed.get(doc.storage_path as string) ?? null }));
    return NextResponse.json({ documents });
});

/**
 * What the model thinks a picture is. Null whenever it cannot say — never a failed upload.
 *
 * The AI runner (Gemini and OpenAI SDKs, unpdf, sharp) is imported here, on demand, and not at
 * the top of the file: this route also serves the dashboard's GET, and loading those packages
 * on every cold start was most of the "Carregando projeto…" wait.
 */
async function classifyPicture(
    supabase: AdminSupabase,
    path: string,
    mimeType: string,
    size: number
): Promise<{ guess: ImageClassification; readBy: ReadBy } | null> {
    if (!mimeType.startsWith("image/") || size <= 0 || size > CLASSIFY_MAX_BYTES) return null;
    try {
        const { aiConfigured, runDocumentExtraction } = await import("@/lib/document-extract-server");
        if (!aiConfigured()) return null;
        const { data } = await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).download(path);
        if (!data) return null;
        const buffer = Buffer.from(await data.arrayBuffer());
        const result = await runDocumentExtraction({ prompt: IMAGE_CLASSIFY_PROMPT, buffer, mimeType, textContent: "", tag: TAG });
        if (!result) return null;
        const guess = normalizeClassification(result.data);
        return guess ? { guess, readBy: result.readBy } : null;
    } catch (err) {
        console.error(`[${TAG}] classification failed:`, err);
        return null;
    }
}

export const POST = withAuth<typeof documentInputSchema, Params>(
    { body: documentInputSchema, tag: TAG },
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

        const mimeType = body.mime_type ?? mimeTypeOfPath(adopted.path);
        const size = body.size_bytes ?? adopted.size ?? 0;

        // Where the file goes: the owner's section, unless the model is sure it belongs elsewhere.
        let kind: DocumentKind = body.payment_id ? "RECEIPT" : body.kind;
        let classified: { from: DocumentKind; to: DocumentKind; read_by: ReadBy; reason: string | null } | null = null;
        if (!body.payment_id && (CLASSIFIABLE_KINDS as readonly string[]).includes(kind)) {
            const seen = await classifyPicture(supabase, adopted.path, mimeType, size);
            const resolved = resolveKind(kind, seen?.guess ?? null);
            if (seen && resolved !== kind) {
                classified = { from: kind, to: resolved, read_by: seen.readBy, reason: seen.guess.reason };
                kind = resolved;
            }
        }

        const { data, error } = await supabase
            .from("new_investment_documents")
            .insert({
                investment_id: params.id,
                owner_id: profileId,
                payment_id: body.payment_id ?? null,
                kind,
                storage_path: adopted.path,
                file_name: body.file_name,
                mime_type: mimeType,
                size_bytes: size,
            })
            .select()
            .single();
        if (error || !data) {
            console.error(`[${TAG}] insert failed:`, error?.message);
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
        if (kind === "PHOTO") {
            await supabase
                .from("new_investments")
                .update({ cover_path: adopted.path })
                .eq("id", params.id)
                .eq("owner_id", profileId)
                .is("cover_path", null);
        }

        const url = await signStorageUrl(supabase, INVESTMENT_DOCUMENTS_BUCKET, adopted.path);
        return NextResponse.json({ document: { ...data, url }, classified }, { status: 201 });
    }
);
