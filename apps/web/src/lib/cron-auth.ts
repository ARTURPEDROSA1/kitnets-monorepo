import { timingSafeEqual } from "crypto";

/**
 * Authorizes a Vercel cron request.
 *
 * Fails CLOSED: if CRON_SECRET is not configured the request is rejected.
 * (The previous check was `if (process.env.CRON_SECRET && …)`, which made
 * every cron endpoint public in any environment that lacked the variable.)
 */
export function isAuthorizedCron(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[cron] CRON_SECRET is not set; refusing request");
        return false;
    }

    const header = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;

    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
