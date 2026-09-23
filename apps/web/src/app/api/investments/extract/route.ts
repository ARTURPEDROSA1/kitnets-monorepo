import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/session";
import { aiConfigured, pdfText, runDocumentExtraction } from "@/lib/document-extract-server";
import {
    STAGED_UPLOAD_MAX_SIZE,
    downloadStagedUpload,
    mimeTypeOfPath,
    ownStagedPath,
} from "@/lib/new-investments-server";
import {
    INVESTMENT_EXTRACTION_PROMPT,
    inferTotalPrice,
    isEmptyInvestmentExtraction,
    normalizeInvestmentExtraction,
} from "@/lib/new-investment-extract";

export const runtime = "nodejs";
// A long purchase contract on the OpenAI fallback takes minutes, and it only starts after Gemini times out.
export const maxDuration = 300;
const TAG = "Investment Extract";

/**
 * POST /api/investments/extract
 * JSON `{ storage_path }` — the contract the browser uploaded through POST
 * /api/investments/upload-url — or multipart/form-data with `file`.
 *
 * Reads the quadro resumo and the payment clause of an off-plan purchase contract. Read-only:
 * nothing is created here, the form shows what was found and the user confirms it.
 */
export const POST = withAuth(
    { tag: TAG, limit: { scope: "ai:extract-investment", limit: 30, windowMs: HOUR } },
    async ({ req, profileId, supabase }) => {
        let buffer: Buffer;
        let mimeType: string;
        if ((req.headers.get("content-type") || "").includes("application/json")) {
            const path = ownStagedPath(profileId, (await readJsonBody(req)).storage_path);
            const staged = path ? await downloadStagedUpload(supabase, path) : null;
            if (!path || !staged) {
                return NextResponse.json({ error: "Arquivo não encontrado. Envie o contrato novamente." }, { status: 400 });
            }
            buffer = staged;
            mimeType = mimeTypeOfPath(path);
        } else {
            const formData = await req.formData();
            const file = formData.get("file");
            if (!(file instanceof File)) {
                return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
            }
            const uploadError = validateUpload(file, STAGED_UPLOAD_MAX_SIZE, [
                "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp",
            ]);
            if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });

            buffer = Buffer.from(await file.arrayBuffer());
            mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
        }

        const textContent = mimeType === "application/pdf" ? await pdfText(buffer, TAG) : "";
        if (!aiConfigured()) return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });

        let raw: unknown | null = null;
        try {
            raw = await runDocumentExtraction({ prompt: INVESTMENT_EXTRACTION_PROMPT, buffer, mimeType, textContent, tag: TAG });
        } catch (err) {
            console.error(`[${TAG}] AI extraction failed:`, err);
        }
        if (!raw) {
            return NextResponse.json({ error: "Não foi possível ler o contrato. Tente outro arquivo ou preencha manualmente." }, { status: 422 });
        }

        const data = normalizeInvestmentExtraction(raw);
        if (isEmptyInvestmentExtraction(data)) {
            return NextResponse.json({ error: "Este arquivo não parece ser um contrato de compra de imóvel." }, { status: 422 });
        }

        return NextResponse.json({ success: true, data, inferred_total: inferTotalPrice(data) });
    }
);
