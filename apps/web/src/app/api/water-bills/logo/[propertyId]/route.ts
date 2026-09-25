import { NextResponse } from "next/server";
import { getOwnedProperty } from "@/lib/api-auth";
import { withAuth } from "@/lib/api-route";
import { removeUtilityLogo, saveUtilityLogo, signWaterFiles } from "@/lib/water-bills-server";

type Params = { propertyId: string };

const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * POST /api/water-bills/logo/[propertyId]
 * multipart/form-data with a "file" field → { success, logo_url }. The water utility's logo by
 * hand (the bill import reads it from the PDF header when there is none); replaces the previous one.
 */
export const POST = withAuth<undefined, Params>({ tag: "Water Logo POST" }, async ({ req, params, profileId, supabase }) => {
    const property = await getOwnedProperty(supabase, profileId, params.propertyId);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WebP ou SVG." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande. Máximo 2 MB." }, { status: 400 });

    const path = await saveUtilityLogo(supabase, params.propertyId, Buffer.from(await file.arrayBuffer()), file.type, ext);
    if (!path) return NextResponse.json({ error: "Erro ao fazer upload do logo." }, { status: 500 });
    const { logoUrl } = await signWaterFiles(supabase, params.propertyId);
    return NextResponse.json({ success: true, logo_url: logoUrl });
});

/**
 * DELETE /api/water-bills/logo/[propertyId]
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Water Logo DELETE" }, async ({ params, profileId, supabase }) => {
    const property = await getOwnedProperty(supabase, profileId, params.propertyId);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    await removeUtilityLogo(supabase, params.propertyId);
    return NextResponse.json({ success: true });
});
