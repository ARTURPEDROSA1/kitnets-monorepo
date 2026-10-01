import { NextResponse } from "next/server";
import { HttpError, readJsonBody, withAuth } from "@/lib/api-route";
import { listProfileDocuments, loadHolding } from "@/lib/company-import-server";
import { HOLDING_COLUMNS, holdingFromRow, sanitizeHoldingPatch } from "@/lib/profile-holding";

export const dynamic = "force-dynamic";

/**
 * GET /api/profiles/me
 * → { holding, documents }
 * The signed-in owner's holding record (lib/profile-holding.ts) and their documents, for /proprietario.
 */
export const GET = withAuth({ tag: "Profile Me GET" }, async ({ profileId, supabase }) => {
    const [holding, documents] = await Promise.all([loadHolding(supabase, profileId), listProfileDocuments(supabase, profileId)]);
    if (!holding) throw new HttpError(404, { error: "Perfil não encontrado." });
    return NextResponse.json({ holding, documents });
});

/**
 * PATCH /api/profiles/me
 * body: any of full_name, phone, cnpj, business_name, trade_name, registration_status_date, address, admin
 * → { holding }
 * Edits made by hand on /proprietario; the Cartão CNPJ import has its own route.
 */
export const PATCH = withAuth({ tag: "Profile Me PATCH" }, async ({ req, profileId, supabase }) => {
    const result = sanitizeHoldingPatch(await readJsonBody(req));
    if ("error" in result) throw new HttpError(400, { error: result.error });
    const { data, error } = await supabase.from("profiles").update(result.columns).eq("id", profileId).select(HOLDING_COLUMNS).single();
    if (error) {
        console.error("[Profile Me PATCH]", error.message);
        throw new HttpError(500, { error: "Erro ao salvar os dados do proprietário." });
    }
    return NextResponse.json({ holding: holdingFromRow(data as Record<string, unknown>) });
});
