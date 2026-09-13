import { NextResponse } from "next/server";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Fixed-window rate limiter backed by Postgres (`public.rate_limit_hit`, see
 * supabase/migrations/20260913200000_rate_limits.sql), so every Vercel
 * instance shares the same counters.
 *
 * Fails closed: if the store cannot be reached the caller gets `ok: false`
 * with `unavailable: true` (a 503 from `rateLimitResponse`). The endpoints
 * behind this call paid third parties; a transient 503 beats an unbounded
 * bill. Without Supabase credentials (unit tests, a bare local checkout) it
 * degrades to a per-process counter.
 */
export interface RateLimitResult {
    ok: boolean;
    remaining: number;
    resetAt: number;
    /** True when the shared store could not be reached (fail-closed). */
    unavailable?: boolean;
}

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

/** Message for forms and server actions that return `{ success: false, error }`. */
export const RATE_LIMITED_MESSAGE = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

const PRUNE_ONE_IN = 500;

function hasSharedStore(): boolean {
    return (
        process.env.NODE_ENV !== "test" &&
        Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
        Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    );
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!hasSharedStore()) {
        return memoryRateLimit(key, limit, windowMs);
    }

    try {
        const admin = createAdminClient();
        const { data, error } = await admin
            .rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_ms: windowMs })
            .single();
        if (error) throw error;

        const row = data as { allowed: boolean; remaining: number; resets_at: string };

        if (Math.random() < 1 / PRUNE_ONE_IN) {
            // Fire and forget; a failed prune only leaves stale rows behind.
            void admin.rpc("rate_limits_prune").then(() => undefined, () => undefined);
        }

        return { ok: row.allowed, remaining: row.remaining, resetAt: new Date(row.resets_at).getTime() };
    } catch (err) {
        Sentry.captureException(err, { tags: { component: "rate-limit" }, extra: { key } });
        return { ok: false, remaining: 0, resetAt: Date.now() + MINUTE, unavailable: true };
    }
}

/**
 * Per-client limit for anonymous entry points (public forms, proxies).
 * Vercel sets `x-real-ip`; the first `x-forwarded-for` entry is the fallback.
 */
export async function rateLimitByIp(scope: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const ip = clientIp(await headers());
    return rateLimit(`${scope}:ip:${ip}`, limit, windowMs);
}

/** Best-effort client address from proxy headers. Exported for tests. */
export function clientIp(h: { get(name: string): string | null }): string {
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first) return first;
    }
    return "unknown";
}

/** 429 (or 503 when the store is down) with a Retry-After header. */
export function rateLimitResponse(result: RateLimitResult) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    if (result.unavailable) {
        return NextResponse.json(
            { error: "Serviço temporariamente indisponível. Tente novamente em instantes." },
            { status: 503, headers: { "Retry-After": String(retryAfter) } }
        );
    }
    return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em alguns minutos." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
}

// ---------------------------------------------------------------------------
// In-process fallback (tests and credential-less local runs only).

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export function memoryRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) {
            for (const [k, v] of buckets) {
                if (v.resetAt <= now) buckets.delete(k);
            }
            if (buckets.size >= MAX_KEYS) buckets.clear();
        }
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
    }

    entry.count += 1;
    return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}
