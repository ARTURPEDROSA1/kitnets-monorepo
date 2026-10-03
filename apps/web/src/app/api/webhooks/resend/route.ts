import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp, rateLimitResponse } from "@/lib/rate-limit";
import { parseResendEvent, verifySvixSignature } from "@/lib/billing/resend-webhook";
import { applyEmailEvent } from "@/lib/billing/deliveries-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/webhooks/resend
 * Where Resend reports what became of an invoice's e-mail: delivered, bounced, complained. The Svix
 * signature is checked on the raw body (`RESEND_WEBHOOK_SECRET`); the delivery is found by the
 * message id and an event seen before is ignored. 200 once verified (an e-mail that is not an
 * invoice's — a copy, another app's — is simply not ours); 400 for a bad signature; 503 while the
 * secret is not configured; 500 when we fail (Resend retries).
 */
export async function POST(request: NextRequest) {
    const limit = await rateLimitByIp("resend-webhook", 240, 60_000);
    if (!limit.ok) return rateLimitResponse(limit);
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
    const raw = await request.text();
    const id = request.headers.get("svix-id");
    if (!verifySvixSignature(raw, { id, timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") }, secret)) {
        return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
    }
    let event;
    try {
        event = parseResendEvent(JSON.parse(raw));
    } catch {
        event = null;
    }
    if (!event) return NextResponse.json({ ok: true, ignored: true });
    try {
        const result = await applyEmailEvent(createAdminClient(), event, id as string);
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        console.error("[Resend webhook] failed:", err);
        Sentry.captureException(err, { tags: { route: "Resend webhook" } });
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
