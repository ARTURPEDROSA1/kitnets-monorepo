import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { AGENCY_EDIT_ROLES, AGENCY_LOGO_BUCKET, removeAgencyLogo, requireAgencyRole } from "@/lib/agencies-server";

type Params = { id: string };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const EDIT_DENIED = "Sem permissão para editar esta imobiliária.";

/**
 * POST /api/agencies/[id]/logo
 * multipart/form-data with a "file" field → { success, logo_url }. Replaces the previous logo.
 */
export const POST = withAuth<undefined, Params>({ tag: "Logo Upload" }, async ({ req, params, profileId, supabase }) => {
    await requireAgencyRole(supabase, params.id, profileId, AGENCY_EDIT_ROLES, EDIT_DENIED);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WebP ou SVG." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Arquivo muito grande. Máximo 2 MB." }, { status: 400 });
    }

    const { data: existing } = await supabase.from("agencies").select("logo_url").eq("id", params.id).maybeSingle();
    await removeAgencyLogo(supabase, existing?.logo_url);

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${params.id}/${Date.now()}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from(AGENCY_LOGO_BUCKET)
        .upload(fileName, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
        console.error("[Logo Upload] Storage error:", uploadError);
        return NextResponse.json({ error: "Erro ao fazer upload do logo." }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(AGENCY_LOGO_BUCKET).getPublicUrl(fileName);

    const { error: updateError } = await supabase.from("agencies").update({ logo_url: publicUrl }).eq("id", params.id);
    if (updateError) {
        console.error("[Logo Upload] DB update error:", updateError);
        return NextResponse.json({ error: "Erro ao salvar URL do logo." }, { status: 500 });
    }

    return NextResponse.json({ success: true, logo_url: publicUrl });
});

/**
 * DELETE /api/agencies/[id]/logo
 * Removes the logo from storage and clears the URL.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Logo Delete" }, async ({ params, profileId, supabase }) => {
    await requireAgencyRole(supabase, params.id, profileId, AGENCY_EDIT_ROLES, EDIT_DENIED);

    const { data: agency } = await supabase.from("agencies").select("logo_url").eq("id", params.id).maybeSingle();
    await removeAgencyLogo(supabase, agency?.logo_url);
    await supabase.from("agencies").update({ logo_url: null }).eq("id", params.id);

    return NextResponse.json({ success: true });
});
