import { NextResponse } from "next/server";
import { readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { aiConfigured, pdfText, runDocumentExtraction } from "@/lib/document-extract-server";
import { downloadStagedUpload, loadOwnedInvestment, mimeTypeOfPath, ownStagedPath } from "@/lib/new-investments-server";
import { RECEIPT_EXTRACTION_PROMPT, isEmptyReceipt, normalizeReceiptExtraction } from "@/lib/new-investment-receipt";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { id: string };
const TAG = "Receipt Extract";

/**
 * POST /api/investments/[id]/receipts/extract   { storage_path }
 * → { receipt: { amount, paid_on, payer_name, payer_document, payer_type, payee_name, description } }
 *
 * Reads a payment receipt the browser already staged (POST /api/investments/upload-url): the amount,
 * the date, and — what decides the PF/PJ allocation — whose document paid. Read-only: the receipt is
 * attached and the row updated by the caller, once the owner has seen what was read.
 */
export const POST = withAuth<undefined, Params>(
    { tag: TAG, limit: { scope: "ai:extract-receipt", limit: 120, windowMs: HOUR } },
    async ({ req, params, profileId, supabase }) => {
        await loadOwnedInvestment(supabase, params.id, profileId);

        const path = ownStagedPath(profileId, (await readJsonBody(req)).storage_path);
        const buffer = path ? await downloadStagedUpload(supabase, path) : null;
        if (!path || !buffer) {
            return NextResponse.json({ error: "Comprovante não encontrado. Envie o arquivo novamente." }, { status: 400 });
        }
        if (!aiConfigured()) return NextResponse.json({ error: "Serviço de IA indisponível." }, { status: 503 });

        const mimeType = mimeTypeOfPath(path);
        const textContent = mimeType === "application/pdf" ? await pdfText(buffer, TAG) : "";

        let raw: unknown | null = null;
        try {
            raw = await runDocumentExtraction({ prompt: RECEIPT_EXTRACTION_PROMPT, buffer, mimeType, textContent, tag: TAG });
        } catch (err) {
            console.error(`[${TAG}] AI extraction failed:`, err);
        }
        if (!raw) return NextResponse.json({ error: "Não foi possível ler o comprovante." }, { status: 422 });

        const receipt = normalizeReceiptExtraction(raw);
        if (isEmptyReceipt(receipt)) {
            return NextResponse.json({ error: "Este arquivo não parece ser um comprovante de pagamento." }, { status: 422 });
        }
        return NextResponse.json({ success: true, receipt });
    }
);
