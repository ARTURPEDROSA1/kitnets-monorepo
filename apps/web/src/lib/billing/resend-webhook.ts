/**
 * Resend's webhooks (https://resend.com/docs/dashboard/webhooks/introduction): what became of an
 * e-mail after the provider accepted it — delivered, bounced, complained. Resend signs them with
 * Svix: `svix-id`, `svix-timestamp` and `svix-signature` headers, the signature being the base64
 * HMAC-SHA256 of `${id}.${timestamp}.${body}` with the endpoint's secret (`whsec_` + base64 key).
 * Pure; the route (app/api/webhooks/resend) and lib/billing/deliveries-server.ts do the rest.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SvixHeaders {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
}

/** Checks the Svix signature of a raw body; the timestamp must be within `toleranceSec` of now. */
export function verifySvixSignature(rawBody: string, headers: SvixHeaders, secret: string, nowMs: number = Date.now(), toleranceSec = 300): boolean {
    const { id, timestamp, signature } = headers;
    if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
    if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSec) return false;
    const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    if (key.length === 0) return false;
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
    // "v1,<base64> v1,<base64>": any of them may match (the secret may be rotating)
    return signature.split(" ").some(part => {
        const [version, value] = part.split(",");
        if (version !== "v1" || !value) return false;
        const given = Buffer.from(value, "base64");
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export type ResendEventType = "email.sent" | "email.delivered" | "email.delivery_delayed" | "email.bounced" | "email.complained" | "email.opened" | "email.clicked";

export interface ResendEvent {
    type: string;
    /** the message id `POST /emails` answered with: `invoice_deliveries.provider_id` */
    emailId: string;
    /** ISO */
    createdAt: string | null;
    /** a bounce's reason, in the provider's words */
    reason: string | null;
}

export function parseResendEvent(json: unknown): ResendEvent | null {
    if (!json || typeof json !== "object") return null;
    const e = json as Record<string, unknown>;
    const data = (e.data as Record<string, unknown> | null) ?? null;
    if (typeof e.type !== "string" || !data || typeof data.email_id !== "string") return null;
    const bounce = (data.bounce as { message?: string; type?: string; subType?: string } | null) ?? null;
    return {
        type: e.type,
        emailId: data.email_id,
        createdAt: typeof e.created_at === "string" ? e.created_at : null,
        reason: bounce ? [bounce.message, [bounce.type, bounce.subType].filter(Boolean).join("/")].filter(Boolean).join(" — ") || null : null,
    };
}

/** A bounce in words the owner can act on. */
export function bounceReason(reason: string | null): string {
    return reason ? `o provedor do inquilino devolveu a mensagem: ${reason}`.slice(0, 500) : "o provedor do inquilino devolveu a mensagem (endereço inexistente ou caixa cheia)";
}
