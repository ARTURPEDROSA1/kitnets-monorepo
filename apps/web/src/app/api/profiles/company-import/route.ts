import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { HttpError, notFound, readJsonBody, withAuth } from "@/lib/api-route";
import { HOUR } from "@/lib/rate-limit";
import { applyCompanyCard, downloadProfileDocument, loadProfileDocument, readCompanyCard } from "@/lib/company-import-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/profiles/company-import
 * body { document_id } — a Cartão CNPJ already in the owner's files
 * → { holding, read_by, policies }
 *
 * Reads the stored card again (after a failed read, or to refresh the record from a newer card) and
 * fills the holding record and the accounting policies, as the upload does on the spot.
 */
export const POST = withAuth({ tag: "Company Card Import", limit: { scope: "ai:company-import", limit: 20, windowMs: HOUR } }, async ({ req, profileId, supabase }) => {
    const body = await readJsonBody(req);
    const id = typeof body.document_id === "string" ? body.document_id : "";
    const doc = UUID_REGEX.test(id) ? await loadProfileDocument(supabase, profileId, id) : null;
    if (!doc) throw notFound("Arquivo não encontrado.");

    const buffer = await downloadProfileDocument(supabase, doc.path);
    if (!buffer) throw notFound("Arquivo não encontrado no armazenamento.");

    const reading = await readCompanyCard(buffer, doc.mime_type || "application/pdf");
    if (!reading) throw new HttpError(422, { error: "Não encontrei um Cartão CNPJ neste arquivo. Confira se é o Comprovante de Inscrição e de Situação Cadastral." });

    const imported = await applyCompanyCard(supabase, profileId, reading, doc.path);
    return NextResponse.json({ holding: imported.holding, read_by: imported.readBy, policies: imported.policies });
});
