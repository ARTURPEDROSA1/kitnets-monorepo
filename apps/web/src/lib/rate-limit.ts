import { NextResponse } from "next/server";

/**
 * Minimal fixed-window rate limiter.
 *
 * State lives in process memory, so on serverless it is per warm instance and
 * best-effort only. It still stops a single client from hammering a paid
 * endpoint in a tight loop. Replace with Upstash/Redis when there is more
 * than one tenant.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
    ok: boolean;
    remaining: number;
    resetAt: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
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

/** 429 response with a Retry-After header. */
export function rateLimitResponse(result: RateLimitResult) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em alguns minutos." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
}

export const HOUR = 60 * 60 * 1000;
