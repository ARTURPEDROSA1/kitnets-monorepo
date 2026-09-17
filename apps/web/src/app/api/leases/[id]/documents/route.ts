import { NextResponse } from "next/server";
import { notFound, withAuth } from "@/lib/api-route";
import { LEASE_DOCUMENT_TYPES } from "@/lib/schemas/lease";
import { LEASE_DOCUMENTS_BUCKET, loadOwnedLease } from "@/lib/leases-server";
import { extractStoragePath, signStorageUrl } from "@/lib/storage";

type Params = { id: string };

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/leases/[id]/documents
 * multipart/form-data with `file` and `document_type`. The bucket is private:
 * the row stores the object path and the response carries a signed URL.
 */
export const POST = withAuth<undefined, Params>({ tag: "Lease Doc Upload" }, async ({ req, params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);

    const formData = await req.formData();
    const file = formData.get("file");
    const rawType = formData.get("document_type");
    const documentType = typeof rawType === "string" && rawType ? rawType : "OTHER";

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
        return NextResponse.json({ error: "Tipo de arquivo não suportado. Use PDF, JPG ou PNG." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Arquivo muito grande. Máximo 5 MB." }, { status: 400 });
    }
    if (!(LEASE_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${params.id}/${Date.now()}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from(LEASE_DOCUMENTS_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
        console.error("[Lease Doc Upload] Storage error:", uploadError);
        return NextResponse.json({ error: "Erro ao fazer upload do documento." }, { status: 500 });
    }

    const { data: doc, error: insertError } = await supabase
        .from("lease_documents")
        .insert({
            lease_id: params.id,
            document_type: documentType,
            file_url: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
        })
        .select()
        .single();

    if (insertError) {
        console.error("[Lease Doc Upload] DB insert error:", insertError);
        await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).remove([path]);
        return NextResponse.json({ error: "Erro ao registrar documento." }, { status: 500 });
    }

    const signedUrl = await signStorageUrl(supabase, LEASE_DOCUMENTS_BUCKET, path);
    return NextResponse.json({ document: { ...doc, file_url: signedUrl ?? doc.file_url } }, { status: 201 });
});

/**
 * DELETE /api/leases/[id]/documents?doc_id=…
 * Removes the file from storage and its record.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Lease Doc Delete" }, async ({ req, params, profileId, supabase }) => {
    await loadOwnedLease(supabase, params.id, profileId);

    const docId = new URL(req.url).searchParams.get("doc_id");
    if (!docId) {
        return NextResponse.json({ error: "ID do documento é obrigatório." }, { status: 400 });
    }

    const { data: doc } = await supabase
        .from("lease_documents")
        .select("id, file_url")
        .eq("id", docId)
        .eq("lease_id", params.id)
        .maybeSingle();
    if (!doc) throw notFound("Documento não encontrado.");

    // file_url may be a legacy public URL or a bare path
    const storagePath = extractStoragePath(LEASE_DOCUMENTS_BUCKET, doc.file_url);
    if (storagePath) await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).remove([storagePath]);

    const { error } = await supabase.from("lease_documents").delete().eq("id", docId);
    if (error) {
        console.error("[Lease Doc Delete] DB error:", error);
        return NextResponse.json({ error: "Erro ao excluir documento." }, { status: 500 });
    }

    return NextResponse.json({ message: "Documento excluído com sucesso." });
});
