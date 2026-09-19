import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { LEASE_DOCUMENTS_BUCKET } from "@/lib/leases-server";
import { STAGED_UPLOAD_MAX_SIZE, STAGED_UPLOAD_MIME_TYPES, newStagedPath } from "@/lib/lease-uploads-server";

/**
 * POST /api/leases/upload-url   { mime_type, size }
 * → { path, signed_url }
 *
 * A one-off URL the browser PUTs a lease agreement to, inside the account's staging folder of the
 * private bucket. The file never goes through a route body (see lib/lease-uploads-server.ts).
 */
export const POST = withAuth(
    { tag: "Lease Upload URL", limit: { scope: "lease-upload-url", limit: 60, windowMs: HOUR } },
    async ({ req, profileId, supabase }) => {
        const body = await readJsonBody(req);
        const mimeType = typeof body.mime_type === "string" ? body.mime_type : "";
        const size = typeof body.size === "number" ? body.size : 0;

        if (!STAGED_UPLOAD_MIME_TYPES.includes(mimeType)) {
            return NextResponse.json({ error: "Formato de arquivo não suportado. Use PDF, JPG, PNG ou WebP." }, { status: 400 });
        }
        if (size <= 0 || size > STAGED_UPLOAD_MAX_SIZE) {
            return NextResponse.json({ error: "Arquivo muito grande. O limite máximo é 10MB." }, { status: 400 });
        }

        const path = newStagedPath(profileId, mimeType);
        const { data, error } = await supabase.storage.from(LEASE_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
        if (error || !data?.signedUrl) {
            console.error("[Lease Upload URL] Storage error:", error);
            return NextResponse.json({ error: "Não foi possível preparar o envio do arquivo." }, { status: 500 });
        }

        return NextResponse.json({ path, signed_url: data.signedUrl });
    }
);
