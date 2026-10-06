import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { HttpError } from "@/lib/api-route";
import { rateLimitByIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/utils/supabase/admin";
import { fileFromForm, referenceOf, receiveSignedCopy, rowByShareToken } from "@/lib/contract/document-server";

export const runtime = "nodejs";

/**
 * POST /api/assinar/[token] — the tenant sends back the contract signed on gov.br (multipart `file`).
 * No login: the signing link's token is the key. 10 uploads per IP per minute; each must add a
 * signature to the latest copy.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const limit = await rateLimitByIp("assinar-upload", 10, 60_000);
        if (!limit.ok) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
        const supabase = createAdminClient();
        const row = await rowByShareToken(supabase, token);
        if (!row) return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo ao proprietário." }, { status: 404 });
        const result = await receiveSignedCopy(supabase, row, await fileFromForm(req), "TENANT", await referenceOf(supabase, row.lease_id));
        return NextResponse.json({ count: result.count, required: result.row.required_signatures, complete: result.complete || result.row.status === "SIGNED" });
    } catch (err) {
        if (err instanceof HttpError) return NextResponse.json(err.body, { status: err.status });
        console.error("[Assinar upload] Unexpected error:", err);
        Sentry.captureException(err, { tags: { route: "Assinar upload" } });
        return NextResponse.json({ error: "Erro ao receber o arquivo. Tente novamente." }, { status: 500 });
    }
}
