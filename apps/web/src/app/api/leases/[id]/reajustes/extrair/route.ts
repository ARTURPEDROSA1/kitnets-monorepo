import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { aiAvailable, extractJsonFromDocument, pdfTextOf } from "@/lib/document-ai-server";
import { ADDENDUM_EXTRACTION_PROMPT, isEmptyAddendum, normalizeAddendumExtraction } from "@/lib/lease-addendum-extract";
import { loadOwnedLease } from "@/lib/leases-server";
import { downloadStagedUpload, mimeTypeOfStagedPath, ownStagedPath } from "@/lib/lease-uploads-server";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";

export const runtime = "nodejs";
// the OpenAI fallback may only start after Gemini timed out
export const maxDuration = 300;

type Params = { id: string };

const TAG = "Lease Addendum Extract";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/leases/[id]/reajustes/extrair
 * JSON `{ storage_path }` (the file the browser uploaded through POST /api/leases/upload-url) or
 * multipart/form-data with `file`.
 *
 * Reads an addendum ("aditivo") with AI: the date the new value applies from, the new rent, the new
 * condominium when it changes, the index and percentage it names. Read-only: the owner reviews what
 * was read and saves it with POST /api/leases/[id]/reajustes.
 */
export const POST = withAuth<undefined, Params>(
    { tag: TAG, limit: { scope: "ai:extract-lease", limit: 30, windowMs: HOUR } },
    async ({ req, params, profileId, supabase }) => {
        await loadOwnedLease(supabase, params.id, profileId);

        let buffer: Buffer;
        let mimeType: string;
        if ((req.headers.get("content-type") || "").includes("application/json")) {
            const path = ownStagedPath(profileId, (await readJsonBody(req)).storage_path);
            const staged = path ? await downloadStagedUpload(supabase, path) : null;
            if (!path || !staged) return NextResponse.json({ error: "Arquivo não encontrado. Envie o aditivo novamente." }, { status: 400 });
            buffer = staged;
            mimeType = mimeTypeOfStagedPath(path);
        } else {
            const file = (await req.formData()).get("file");
            if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
            const uploadError = validateUpload(file, MAX_FILE_SIZE, ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
            if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });
            buffer = Buffer.from(await file.arrayBuffer());
            mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
        }

        if (!aiAvailable()) return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });

        let raw: unknown | null = null;
        try {
            raw = await extractJsonFromDocument({
                prompt: ADDENDUM_EXTRACTION_PROMPT,
                contentLabel: "Conteúdo do aditivo",
                textContent: await pdfTextOf(buffer, mimeType, TAG),
                buffer,
                mimeType,
                tag: TAG,
            });
        } catch (err) {
            console.error(`[${TAG}] AI extraction failed:`, err);
        }
        if (!raw) return NextResponse.json({ error: "Não foi possível ler o aditivo. Preencha os valores manualmente." }, { status: 422 });

        const data = normalizeAddendumExtraction(raw);
        if (isEmptyAddendum(data)) {
            return NextResponse.json({ error: "Não encontrei um novo valor de aluguel neste arquivo. Confira se é o aditivo e preencha os valores manualmente." }, { status: 422 });
        }
        return NextResponse.json({ success: true, data });
    }
);
