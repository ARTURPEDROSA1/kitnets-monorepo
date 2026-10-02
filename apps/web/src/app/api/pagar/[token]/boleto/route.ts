import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp, rateLimitResponse } from "@/lib/rate-limit";
import { PUBLIC_TOKEN_REGEX } from "@/lib/billing/public-invoice";
import { publicBoletoPdfUrl } from "@/lib/billing/public-invoice-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/pagar/[token]/boleto
 * The boleto's PDF for the tenant: a redirect to a short-lived URL of the private file. No login; the
 * token is the key. 404 for a token that leads nowhere or an invoice without a PDF yet.
 */
export async function GET(_request: NextRequest, route: { params: Promise<{ token: string }> }) {
    const { token } = await route.params;
    if (!PUBLIC_TOKEN_REGEX.test(token)) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
    const limit = await rateLimitByIp("pagar-pdf", 20, 60_000);
    if (!limit.ok) return rateLimitResponse(limit);
    try {
        const url = await publicBoletoPdfUrl(createAdminClient(), token);
        if (!url) return NextResponse.json({ error: "O PDF do boleto ainda não está disponível." }, { status: 404 });
        return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    } catch (err) {
        console.error("[Pagar PDF] failed:", err);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
