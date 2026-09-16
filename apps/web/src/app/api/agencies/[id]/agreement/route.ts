import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { AGENCY_EDIT_ROLES, currentAgreementPath, removeAgreementFile, requireAgencyRole, writeAgency } from "@/lib/agencies-server";
import { AGREEMENT_BUCKET } from "@/lib/agency-agreement";
import { signStorageUrl } from "@/lib/storage";

type Params = { id: string };

const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const EDIT_DENIED = "Sem permissão para editar esta imobiliária.";

/**
 * POST /api/agencies/[id]/agreement
 * multipart/form-data: "file" plus optional management_fee, agreement_start_date,
 * agreement_end_date. Stores the file in the private documents bucket and
 * returns a short-lived signed URL.
 */
export const POST = withAuth<undefined, Params>({ tag: "Agreement Upload" }, async ({ req, params, profileId, supabase }) => {
    await requireAgencyRole(supabase, params.id, profileId, AGENCY_EDIT_ROLES, EDIT_DENIED);

    const formData = await req.formData();
    const file = formData.get("file");
    const managementFee = formData.get("management_fee");
    const startDate = formData.get("agreement_start_date");
    const endDate = formData.get("agreement_end_date");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "Formato não suportado. Use PDF, DOC, DOCX, JPG, PNG ou WebP." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Arquivo muito grande. Máximo 15 MB." }, { status: 400 });
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `agencies/${params.id}/agreements/${Date.now()}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from(AGREEMENT_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
        console.error("[Agreement Upload] Storage error:", uploadError);
        return NextResponse.json({ error: "Erro ao fazer upload do documento no storage: " + uploadError.message }, { status: 500 });
    }

    // The bucket is private: persist the object path, hand back a signed URL.
    const patch: Record<string, unknown> = { service_agreement_url: path, service_agreement_filename: file.name };
    if (typeof managementFee === "string" && managementFee) {
        const fee = parseFloat(managementFee.replace(",", "."));
        if (Number.isFinite(fee)) patch.management_fee = fee;
    }
    if (typeof startDate === "string" && startDate) patch.agreement_start_date = startDate;
    if (typeof endDate === "string" && endDate) patch.agreement_end_date = endDate;

    const previous = await currentAgreementPath(supabase, params.id);

    const { error: dbError } = await writeAgency(supabase, patch, params.id);
    if (dbError) {
        console.error("[Agreement Upload] DB update error:", dbError);
        await removeAgreementFile(supabase, path); // don't leave an unreferenced upload behind
        return NextResponse.json({ error: "Erro ao salvar o contrato." }, { status: 500 });
    }

    // The bucket keeps only the current agreement.
    if (previous && previous !== path) await removeAgreementFile(supabase, previous);

    const signedUrl = (await signStorageUrl(supabase, AGREEMENT_BUCKET, path)) ?? path;
    return NextResponse.json({ success: true, agreement_url: signedUrl, filename: file.name });
});

/**
 * DELETE /api/agencies/[id]/agreement
 * Removes the agreement file from the bucket and clears the reference.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Agreement Delete" }, async ({ params, profileId, supabase }) => {
    await requireAgencyRole(supabase, params.id, profileId, AGENCY_EDIT_ROLES, EDIT_DENIED);

    const previous = await currentAgreementPath(supabase, params.id);

    const { error } = await writeAgency(supabase, { service_agreement_url: null, service_agreement_filename: null }, params.id);
    if (error) {
        console.error("[Agreement Delete] DB update error:", error);
        return NextResponse.json({ error: "Erro ao remover o contrato." }, { status: 500 });
    }

    await removeAgreementFile(supabase, previous);
    return NextResponse.json({ success: true });
});
