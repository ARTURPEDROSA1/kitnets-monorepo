import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { AGENT_PHOTO_BUCKET, loadOwnedAgent, removeAgentPhoto } from "@/lib/agents-server";

type Params = { id: string };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/agents/[id]/photo
 * multipart/form-data with a "file" field → { success, photo_url }.
 * Replaces the previous photo in storage.
 */
export const POST = withAuth<undefined, Params>({ tag: "Agent Photo Upload" }, async ({ req, params, profileId, supabase }) => {
    const agent = await loadOwnedAgent(supabase, params.id, profileId, "editar", "photo_url");

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG ou WebP." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Arquivo muito grande. Máximo 2 MB." }, { status: 400 });
    }

    await removeAgentPhoto(supabase, agent.photo_url as string | null);

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${params.id}/${Date.now()}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from(AGENT_PHOTO_BUCKET)
        .upload(fileName, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
        console.error("[Agent Photo Upload] Storage error:", uploadError);
        return NextResponse.json({ error: "Erro ao fazer upload da foto." }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(AGENT_PHOTO_BUCKET).getPublicUrl(fileName);

    const { error: updateError } = await supabase.from("agents").update({ photo_url: publicUrl }).eq("id", params.id);
    if (updateError) {
        console.error("[Agent Photo Upload] DB update error:", updateError);
        return NextResponse.json({ error: "Erro ao salvar URL da foto." }, { status: 500 });
    }

    return NextResponse.json({ success: true, photo_url: publicUrl });
});

/**
 * DELETE /api/agents/[id]/photo
 * Removes the agent's photo from storage and clears the URL.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Agent Photo Delete" }, async ({ params, profileId, supabase }) => {
    const agent = await loadOwnedAgent(supabase, params.id, profileId, "editar", "photo_url");
    await removeAgentPhoto(supabase, agent.photo_url as string | null);
    await supabase.from("agents").update({ photo_url: null }).eq("id", params.id);
    return NextResponse.json({ success: true });
});
