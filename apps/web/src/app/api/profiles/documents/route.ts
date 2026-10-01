import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";
import { PROFILE_DOCUMENTS_BUCKET, applyCompanyCard, listProfileDocuments, readCompanyCard } from "@/lib/company-import-server";
import { MAX_PROFILE_DOCUMENT_BYTES, isProfileDocCategory, type ProfileDocument } from "@/lib/profile-documents";

export const dynamic = "force-dynamic";

/**
 * GET /api/profiles/documents
 * → { documents }
 */
export const GET = withAuth({ tag: "Profile Docs GET" }, async ({ profileId, supabase }) => {
    return NextResponse.json({ documents: await listProfileDocuments(supabase, profileId) });
});

const extensionOf = (file: File) => {
    const fromName = file.name.split(".").pop()?.toLowerCase();
    if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
    return file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
};

/**
 * POST /api/profiles/documents
 * multipart/form-data: `file`, `category` (cnpj_card | social_contract | other), `import` ("0" skips the read)
 * → { document, holding?, read_by?, policies?, import_error? }
 *
 * Stores the file in the private documents bucket under <profile>/company/<category>/ and lists it.
 * A Cartão CNPJ is also read on the spot (lib/company-import-server.ts): the answer carries the
 * holding record it filled; a read that fails still leaves the file saved and says why.
 */
export const POST = withAuth({ tag: "Profile Docs POST", limit: { scope: "profile-docs", limit: 60, windowMs: HOUR } }, async ({ req, profileId, supabase }) => {
    const form = await req.formData();
    const file = form.get("file");
    const category = form.get("category");
    const wantsImport = form.get("import") !== "0";
    if (!(file instanceof File)) throw new HttpError(400, { error: "Nenhum arquivo enviado." });
    if (!isProfileDocCategory(category)) throw new HttpError(400, { error: "Tipo de documento inválido." });
    const invalid = validateUpload(file, MAX_PROFILE_DOCUMENT_BYTES);
    if (invalid) throw new HttpError(400, { error: invalid });

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${profileId}/company/${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(file)}`;
    const bucket = supabase.storage.from(PROFILE_DOCUMENTS_BUCKET);
    const { error: uploadError } = await bucket.upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
        console.error("[Profile Docs POST] Storage error:", uploadError);
        throw new HttpError(500, { error: "Erro ao enviar o arquivo." });
    }

    const { data: document, error: insertError } = await supabase
        .from("profile_documents")
        .insert({ profile_id: profileId, category, path, original_name: file.name.slice(0, 255), mime_type: file.type, file_size: file.size })
        .select("id, category, path, original_name, mime_type, file_size, created_at")
        .single();
    if (insertError || !document) {
        console.error("[Profile Docs POST] DB error:", insertError);
        await bucket.remove([path]);
        throw new HttpError(500, { error: "Erro ao registrar o arquivo." });
    }

    const answer: Record<string, unknown> = { document: document as unknown as ProfileDocument };
    if (category === "cnpj_card" && wantsImport) {
        try {
            const reading = await readCompanyCard(buffer, file.type);
            if (!reading) {
                answer.import_error = "Não encontrei um Cartão CNPJ neste arquivo. O arquivo ficou salvo; confira se é o Comprovante de Inscrição e de Situação Cadastral.";
            } else {
                const imported = await applyCompanyCard(supabase, profileId, reading, path);
                answer.holding = imported.holding;
                answer.read_by = imported.readBy;
                answer.policies = imported.policies;
            }
        } catch (err) {
            console.error("[Profile Docs POST] Card import failed:", err);
            answer.import_error = "O arquivo ficou salvo, mas a leitura do cartão falhou. Tente de novo em instantes ou preencha a ficha à mão.";
        }
    }
    return NextResponse.json(answer, { status: 201 });
});
