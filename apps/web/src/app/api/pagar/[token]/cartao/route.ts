import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { HttpError } from "@/lib/api-route";
import { env } from "@/lib/env";
import { rateLimitByIp, rateLimitResponse } from "@/lib/rate-limit";
import { PUBLIC_TOKEN_REGEX } from "@/lib/billing/public-invoice";
import { startCardPayment } from "@/lib/billing/card-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const page = (token: string, query: string) => NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "")}/pt/pagar/${token}?${query}`, { status: 303 });

/**
 * POST /api/pagar/[token]/cartao
 * The tenant chose the card on the invoice's page (a form POST, never a link: scanners that follow
 * links in e-mails would open sessions). Opens the Stripe Checkout Session on the owner's account and
 * sends the browser there (303). A refusal goes back to the page with the reason.
 */
export async function POST(_request: NextRequest, route: { params: Promise<{ token: string }> }) {
    const { token } = await route.params;
    if (!PUBLIC_TOKEN_REGEX.test(token)) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
    const limit = await rateLimitByIp("pagar-cartao", 10, 60_000);
    if (!limit.ok) return rateLimitResponse(limit);
    try {
        const { url } = await startCardPayment(createAdminClient(), token);
        return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    } catch (err) {
        if (err instanceof HttpError) {
            if (err.status === 404) return NextResponse.json(err.body, { status: 404 });
            return page(token, `cartao=erro&motivo=${encodeURIComponent(String((err.body as { error?: string }).error ?? "Não foi possível abrir o pagamento por cartão."))}`);
        }
        console.error("[Pagar cartão] failed:", err);
        return page(token, "cartao=erro");
    }
}
