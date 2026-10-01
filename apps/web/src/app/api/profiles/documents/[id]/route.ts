import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { PROFILE_DOCUMENTS_BUCKET, loadProfileDocument } from "@/lib/company-import-server";
import { signStorageUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/profiles/documents/[id]
 * → { url } — a short-lived signed URL of the owner's file (the bucket is private).
 */
export const GET = withAuth<undefined, Params>({ tag: "Profile Doc GET" }, async ({ params, profileId, supabase }) => {
    const doc = UUID_REGEX.test(params.id) ? await loadProfileDocument(supabase, profileId, params.id) : null;
    if (!doc) throw notFound("Arquivo não encontrado.");
    const url = await signStorageUrl(supabase, PROFILE_DOCUMENTS_BUCKET, doc.path);
    if (!url) throw notFound("Arquivo não encontrado no armazenamento.");
    return NextResponse.json({ url, document: doc });
});

/**
 * DELETE /api/profiles/documents/[id]
 * Removes the file from the bucket and the list. The holding record keeps what the file filled.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Profile Doc DELETE" }, async ({ params, profileId, supabase }) => {
    const doc = UUID_REGEX.test(params.id) ? await loadProfileDocument(supabase, profileId, params.id) : null;
    if (!doc) throw notFound("Arquivo não encontrado.");
    const { error } = await supabase.from("profile_documents").delete().eq("id", doc.id).eq("profile_id", profileId);
    if (error) {
        console.error("[Profile Doc DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir o arquivo." }, { status: 500 });
    }
    await supabase.storage.from(PROFILE_DOCUMENTS_BUCKET).remove([doc.path]);
    return NextResponse.json({ success: true });
});
