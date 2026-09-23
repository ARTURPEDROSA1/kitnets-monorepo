import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import {
    INVESTMENT_DOCUMENTS_BUCKET,
    STAGED_UPLOAD_MAX_SIZE,
    STAGED_UPLOAD_MIME_TYPES,
    newStagedPath,
} from "@/lib/new-investments-server";

/**
 * POST /api/investments/upload-url   { mime_type, size }
 * → { path, signed_url }
 *
 * A one-off URL the browser PUTs a contract, receipt, photo or floor plan to, inside the account's
 * staging folder of the private bucket. The file never goes through a route body, which is what
 * makes uploads past Vercel's 4.5 MB limit work (see lib/new-investments-server.ts).
 */
export const POST = withAuth(
    { tag: "Investment Upload URL", limit: { scope: "investment-upload-url", limit: 120, windowMs: HOUR } },
    async ({ req, profileId, supabase }) => {
        const body = await readJsonBody(req);
        const mimeType = typeof body.mime_type === "string" ? body.mime_type : "";
        const size = typeof body.size === "number" ? body.size : 0;

        if (!STAGED_UPLOAD_MIME_TYPES.includes(mimeType)) {
            return NextResponse.json({ error: "Formato de arquivo não suportado. Use PDF, JPG, PNG ou WebP." }, { status: 400 });
        }
        if (size <= 0 || size > STAGED_UPLOAD_MAX_SIZE) {
            return NextResponse.json({ error: "Arquivo muito grande. O limite máximo é 20MB." }, { status: 400 });
        }

        const path = newStagedPath(profileId, mimeType);
        const { data, error } = await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
        if (error || !data?.signedUrl) {
            console.error("[Investment Upload URL] Storage error:", error);
            return NextResponse.json({ error: "Não foi possível preparar o envio do arquivo." }, { status: 500 });
        }

        return NextResponse.json({ path, signed_url: data.signedUrl });
    }
);
