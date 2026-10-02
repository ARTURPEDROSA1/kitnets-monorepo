import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimitByIp, rateLimitResponse } from "@/lib/rate-limit";
import { handleInterCallback } from "@/lib/billing/charges-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/webhooks/inter/[key]
 * Where Banco Inter reports paid, cancelled and expired charges. The key in the path was given to
 * the bank when the owner's connection registered its webhook; it leads to one connection and nothing
 * else — every charge named in the payload is then read back from the bank before anything changes.
 * Always 200 once the key is known, so the bank does not retry a payload we have already seen;
 * 404 for a key that leads nowhere.
 */
export async function POST(request: NextRequest, route: { params: Promise<{ key: string }> }) {
    const limit = await rateLimitByIp("inter-webhook", 120, 60_000);
    if (!limit.ok) return rateLimitResponse(limit);
    const { key } = await route.params;
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "JSON esperado" }, { status: 400 });
    }
    try {
        const result = await handleInterCallback(createAdminClient(), key, body);
        if (!result.owner) return NextResponse.json({ error: "Desconhecido" }, { status: 404 });
        return NextResponse.json({ ok: true, refreshed: result.refreshed, ignored: result.ignored });
    } catch (err) {
        console.error("[Inter webhook] failed:", err);
        Sentry.captureException(err, { tags: { route: "Inter webhook" } });
        // a failure on our side: let the bank try again later
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
