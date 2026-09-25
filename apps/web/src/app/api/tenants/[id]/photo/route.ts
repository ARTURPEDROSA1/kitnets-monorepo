import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { TENANT_PHOTO_BUCKET, loadOwnedTenant, removeTenantPhoto } from "@/lib/tenants-server";
import { signStorageUrl } from "@/lib/storage";

type Params = { id: string };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/tenants/[id]/photo
 * multipart/form-data with a "file" field → { success, photo_url }.
 * The photo goes to the private tenant-photos bucket (a tenant is a third party: no public URL);
 * the row keeps the object path and the answer carries a short-lived signed URL. Replaces the
 * previous photo.
 */
export const POST = withAuth<undefined, Params>({ tag: "Tenant Photo Upload" }, async ({ req, params, profileId, supabase }) => {
    const tenant = await loadOwnedTenant(supabase, params.id, profileId, "editar", "photo_path");

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG ou WebP." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande. Máximo 2 MB." }, { status: 400 });

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${params.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(TENANT_PHOTO_BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
        console.error("[Tenant Photo Upload] Storage error:", uploadError);
        return NextResponse.json({ error: "Erro ao enviar a foto." }, { status: 500 });
    }

    const { error: updateError } = await supabase.from("tenants").update({ photo_path: path }).eq("id", params.id);
    if (updateError) {
        console.error("[Tenant Photo Upload] DB update error:", updateError);
        await supabase.storage.from(TENANT_PHOTO_BUCKET).remove([path]);
        return NextResponse.json({ error: "Erro ao salvar a foto." }, { status: 500 });
    }
    await removeTenantPhoto(supabase, tenant.photo_path as string | null);

    return NextResponse.json({ success: true, photo_url: await signStorageUrl(supabase, TENANT_PHOTO_BUCKET, path) });
});

/**
 * DELETE /api/tenants/[id]/photo
 * Removes the tenant's photo from storage and clears the path.
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Tenant Photo Delete" }, async ({ params, profileId, supabase }) => {
    const tenant = await loadOwnedTenant(supabase, params.id, profileId, "editar", "photo_path");
    await removeTenantPhoto(supabase, tenant.photo_path as string | null);
    await supabase.from("tenants").update({ photo_path: null }).eq("id", params.id);
    return NextResponse.json({ success: true });
});
