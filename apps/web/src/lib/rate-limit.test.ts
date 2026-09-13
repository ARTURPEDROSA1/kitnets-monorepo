import { describe, expect, it } from "vitest";
import { clientIp, memoryRateLimit, rateLimit, rateLimitResponse } from "./rate-limit";

describe("memoryRateLimit", () => {
    it("allows up to the limit inside a window, then blocks", () => {
        const t0 = 1_000_000;
        expect(memoryRateLimit("k1", 2, 1000, t0)).toMatchObject({ ok: true, remaining: 1 });
        expect(memoryRateLimit("k1", 2, 1000, t0 + 10)).toMatchObject({ ok: true, remaining: 0 });
        expect(memoryRateLimit("k1", 2, 1000, t0 + 20)).toMatchObject({ ok: false, remaining: 0, resetAt: t0 + 1000 });
    });

    it("starts a fresh window once the previous one expired", () => {
        const t0 = 2_000_000;
        memoryRateLimit("k2", 1, 1000, t0);
        expect(memoryRateLimit("k2", 1, 1000, t0 + 1)).toMatchObject({ ok: false });
        expect(memoryRateLimit("k2", 1, 1000, t0 + 1000)).toMatchObject({ ok: true, resetAt: t0 + 2000 });
    });

    it("keys are independent", () => {
        memoryRateLimit("a", 1, 1000, 0);
        expect(memoryRateLimit("b", 1, 1000, 0).ok).toBe(true);
    });
});

describe("rateLimit without a shared store", () => {
    it("falls back to the in-process counter under NODE_ENV=test", async () => {
        const first = await rateLimit("fallback", 1, HOUR);
        const second = await rateLimit("fallback", 1, HOUR);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
        expect(second.unavailable).toBeUndefined();
    });
});

describe("clientIp", () => {
    const h = (map: Record<string, string>) => ({ get: (n: string) => map[n.toLowerCase()] ?? null });

    it("prefers x-real-ip", () => {
        expect(clientIp(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("203.0.113.9");
    });

    it("uses the first x-forwarded-for entry", () => {
        expect(clientIp(h({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
    });

    it("is 'unknown' without headers", () => {
        expect(clientIp(h({}))).toBe("unknown");
    });
});

describe("rateLimitResponse", () => {
    it("is 429 with Retry-After when limited", async () => {
        const res = rateLimitResponse({ ok: false, remaining: 0, resetAt: Date.now() + 90_000 });
        expect(res.status).toBe(429);
        expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(89);
    });

    it("is 503 when the store was unavailable", () => {
        const res = rateLimitResponse({ ok: false, remaining: 0, resetAt: Date.now() + 60_000, unavailable: true });
        expect(res.status).toBe(503);
    });
});

const HOUR = 60 * 60 * 1000;
