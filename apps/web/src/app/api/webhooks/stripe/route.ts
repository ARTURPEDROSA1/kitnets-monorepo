import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp, rateLimitResponse } from "@/lib/rate-limit";
import { parseStripeEvent, stripeConfig, verifyStripeSignature } from "@/lib/billing/stripe-client";
import { handleStripeEvent } from "@/lib/billing/card-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/webhooks/stripe
 * The platform's Connect webhook ("listen to events on connected accounts"): Checkout Sessions
 * completed or expired on the owners' accounts, and accounts whose standing changed. The signature is
 * checked on the raw body; the payload only says which session or account to look at — it is read
 * back from Stripe before anything changes; an event seen before is ignored. 200 once verified, so
 * Stripe does not retry what we already have; 400 for a bad signature; 500 for a failure on our side
 * (Stripe retries).
 */
export async function POST(request: NextRequest) {
    const limit = await rateLimitByIp("stripe-webhook", 240, 60_000);
    if (!limit.ok) return rateLimitResponse(limit);
    const config = stripeConfig();
    if (!config) return NextResponse.json({ error: "Stripe não configurado" }, { status: 503 });
    const raw = await request.text();
    if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), config.webhookSecret)) {
        return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
    }
    let event;
    try {
        event = parseStripeEvent(JSON.parse(raw));
    } catch {
        event = null;
    }
    if (!event) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    try {
        const result = await handleStripeEvent(createAdminClient(), event);
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        console.error("[Stripe webhook] failed:", err);
        Sentry.captureException(err, { tags: { route: "Stripe webhook" } });
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
