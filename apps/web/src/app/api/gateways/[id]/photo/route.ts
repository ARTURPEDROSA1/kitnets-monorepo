import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const BUCKET = "gateway-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

/**
 * POST /api/gateways/[id]/photo
 * multipart: file (jpeg/png/webp ≤ 5 MB), kind = "gateway" | "panel"
 * Uploads with the service role (the browser no longer talks to Storage for
 * this bucket) and stores the URL on the gateway row. Photos of a meter box
 * are not sensitive, so the bucket stays public.
 */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const { data: gateway } = await supabase
        .from("gateways")
        .select("id")
        .eq("id", id)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (!gateway) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    const kind = formData?.get("kind");

    if (!(file instanceof File)) {
        return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (kind !== "gateway" && kind !== "panel") {
        return NextResponse.json({ error: "kind deve ser 'gateway' ou 'panel'" }, { status: 400 });
    }
    const ext = MIME_TO_EXT[file.type];
    if (!ext) {
        return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Imagem muito grande. Máximo: 5MB." }, { status: 400 });
    }

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
        await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });
    }

    const path = `${id}/${kind === "gateway" ? "gateway-photo" : "panel-photo"}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
        console.error("[Gateway photo] Upload error:", uploadError.message);
        return NextResponse.json({ error: "Erro ao enviar imagem" }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const column = kind === "gateway" ? "photo_url" : "panel_photo_url";

    const { error: updateError } = await supabase
        .from("gateways")
        .update({ [column]: url })
        .eq("id", id)
        .eq("owner_id", profileId);

    if (updateError) {
        console.error("[Gateway photo] Update error:", updateError.message);
        return NextResponse.json({ error: "Erro ao salvar imagem" }, { status: 500 });
    }

    return NextResponse.json({ success: true, url, column });
}
