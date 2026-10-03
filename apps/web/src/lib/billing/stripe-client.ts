/**
 * Stripe over plain `fetch`, for the handful of calls the card payment needs: Connect OAuth (the owner
 * connects their own Stripe account to the Kitnets platform), the connected account's standing,
 * Checkout Sessions created ON the connected account (direct charges: the owner is the merchant, the
 * money lands in their Stripe balance), and the webhook's signature. No SDK for five endpoints; the
 * same shape as the Inter and Resend clients, so the tests mock `fetch`.
 *
 * Platform credentials come from the environment (lib/env.ts): the platform's secret key, its Connect
 * client id and the Connect webhook's signing secret — all three or none.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_API = "https://api.stripe.com";
export const STRIPE_CONNECT = "https://connect.stripe.com";

export type StripeEnvironment = "PRODUCTION" | "SANDBOX";

export interface StripeConfig {
    secretKey: string;
    clientId: string;
    webhookSecret: string;
}

/** The platform's credentials, or null when any is missing (nothing to do with cards then). */
export function stripeConfig(env: Record<string, string | undefined> = process.env): StripeConfig | null {
    const secretKey = env.STRIPE_SECRET_KEY, clientId = env.STRIPE_CLIENT_ID, webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    return secretKey && clientId && webhookSecret ? { secretKey, clientId, webhookSecret } : null;
}

export const stripeAvailable = (env: Record<string, string | undefined> = process.env): boolean => stripeConfig(env) !== null;

/** A test key makes test sessions and connects test accounts: the sandbox, never real money. */
export const stripeEnvironment = (secretKey: string): StripeEnvironment => /^(sk|rk)_test_/.test(secretKey) ? "SANDBOX" : "PRODUCTION";

export type StripeErrorCode = "UNAUTHORIZED" | "INVALID" | "NOT_FOUND" | "RATE_LIMIT" | "UNAVAILABLE" | "TIMEOUT" | "NETWORK" | "ACCOUNT" | "UNEXPECTED";

/** What went wrong, in words the owner can act on. Never carries a key. */
export class StripeError extends Error {
    constructor(public readonly code: StripeErrorCode, message: string, public readonly status: number | null = null, public readonly stripeCode: string | null = null) {
        super(message);
    }
}

export interface StripeRequestOptions {
    fetchImpl?: typeof fetch;
    secretKey?: string;
    baseUrl?: string;
    connectBaseUrl?: string;
    /** the connected account the call is made on behalf of (`Stripe-Account`) */
    account?: string | null;
    idempotencyKey?: string | null;
    timeoutMs?: number;
}

/** Stripe's form encoding: nested objects and arrays as `a[b][0][c]=v`. Exported for the tests. */
export function encodeForm(value: unknown, prefix = "", out: string[] = []): string {
    if (value == null) return out.join("&");
    if (Array.isArray(value)) {
        value.forEach((v, i) => encodeForm(v, `${prefix}[${i}]`, out));
    } else if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v === undefined || v === null) continue;
            encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
        }
    } else {
        out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
    }
    return out.join("&");
}

const words = (err: { type?: string; code?: string; message?: string } | undefined, status: number): { code: StripeErrorCode; message: string } => {
    const detail = err?.message ? err.message.slice(0, 200) : `HTTP ${status}`;
    if (status === 401) return { code: "UNAUTHORIZED", message: "A Stripe recusou a chave da plataforma. Confira STRIPE_SECRET_KEY." };
    if (err?.code === "account_invalid" || err?.code === "platform_account_required" || err?.code === "account_not_connected") return { code: "ACCOUNT", message: `A Stripe não reconhece a conta conectada (${detail}). Conecte a conta de novo.` };
    if (status === 404 || err?.code === "resource_missing") return { code: "NOT_FOUND", message: `A Stripe não encontrou o registro (${detail}).` };
    if (status === 429 || err?.code === "rate_limit") return { code: "RATE_LIMIT", message: "Muitas chamadas à Stripe. Tente de novo em instantes." };
    if (status >= 500) return { code: "UNAVAILABLE", message: `A Stripe está indisponível (${status}). Tente de novo em instantes.` };
    if (status === 400 || status === 402 || status === 403) return { code: "INVALID", message: `A Stripe recusou os dados: ${detail}` };
    return { code: "UNEXPECTED", message: `Resposta inesperada da Stripe (${detail}).` };
};

async function request<T>(method: "GET" | "POST" | "DELETE", url: string, body: Record<string, unknown> | null, opts: StripeRequestOptions): Promise<T> {
    const secretKey = opts.secretKey ?? stripeConfig()?.secretKey;
    if (!secretKey) throw new StripeError("UNAUTHORIZED", "Cartão indisponível neste servidor: a chave da Stripe não está configurada.");
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (opts.account) headers["Stripe-Account"] = opts.account;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const doFetch = opts.fetchImpl ?? fetch;
    let res: Response;
    try {
        res = await doFetch(url, { method, headers, body: body ? encodeForm(body) : undefined, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    } catch (err) {
        const timeout = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
        throw new StripeError(timeout ? "TIMEOUT" : "NETWORK", timeout ? "A Stripe demorou demais para responder." : "Não foi possível falar com a Stripe (falha de rede).");
    }
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) return json as T;
    // the API answers `{ error: { type, code, message } }`; the OAuth endpoints `{ error, error_description }`
    const err = json.error && typeof json.error === "object"
        ? (json.error as { type?: string; code?: string; message?: string })
        : typeof json.error_description === "string" ? { message: json.error_description, code: String(json.error ?? "") } : undefined;
    const w = words(err, res.status);
    throw new StripeError(w.code, w.message, res.status, err?.code ?? null);
}

// ── Connected account ───────────────────────────────────────────────

export interface StripeAccountState {
    id: string;
    livemode: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    payoutsEnabled: boolean;
    country: string | null;
    defaultCurrency: string | null;
    /** the business name, else the dashboard's display name, else the e-mail */
    name: string | null;
    email: string | null;
    /** what Stripe still needs from the owner (`requirements.currently_due`) */
    requirementsDue: string[];
}

export function parseAccount(json: Record<string, unknown>): StripeAccountState {
    const profile = (json.business_profile as { name?: string | null } | null) ?? null;
    const settings = (json.settings as { dashboard?: { display_name?: string | null } } | null) ?? null;
    const requirements = (json.requirements as { currently_due?: string[] } | null) ?? null;
    return {
        id: String(json.id ?? ""),
        livemode: json.livemode === true,
        chargesEnabled: json.charges_enabled === true,
        detailsSubmitted: json.details_submitted === true,
        payoutsEnabled: json.payouts_enabled === true,
        country: typeof json.country === "string" ? json.country : null,
        defaultCurrency: typeof json.default_currency === "string" ? json.default_currency : null,
        name: profile?.name || settings?.dashboard?.display_name || (typeof json.email === "string" ? json.email : null) || null,
        email: typeof json.email === "string" ? json.email : null,
        requirementsDue: Array.isArray(requirements?.currently_due) ? requirements.currently_due.map(String) : [],
    };
}

/** `GET /v1/accounts/{id}` with the platform's key: how the owner's connected account stands. */
export async function getStripeAccount(accountId: string, opts: StripeRequestOptions = {}): Promise<StripeAccountState> {
    return parseAccount(await request<Record<string, unknown>>("GET", `${opts.baseUrl ?? STRIPE_API}/v1/accounts/${encodeURIComponent(accountId)}`, null, { ...opts, account: null }));
}

// ── Connect OAuth (Standard accounts) ───────────────────────────────

/** Where the owner is sent to connect (or create) their Stripe account; `state` comes back untouched. */
export function oauthAuthorizeUrl(input: { clientId: string; state: string; redirectUri: string; email?: string | null; connectBaseUrl?: string }): string {
    const params = new URLSearchParams({ response_type: "code", client_id: input.clientId, scope: "read_write", state: input.state, redirect_uri: input.redirectUri });
    if (input.email) params.set("stripe_user[email]", input.email);
    params.set("stripe_user[country]", "BR");
    return `${input.connectBaseUrl ?? STRIPE_CONNECT}/oauth/authorize?${params.toString()}`;
}

/** Turns the code Stripe sent back into the connected account's id. */
export async function oauthToken(code: string, opts: StripeRequestOptions = {}): Promise<{ accountId: string; livemode: boolean }> {
    const json = await request<Record<string, unknown>>("POST", `${opts.connectBaseUrl ?? STRIPE_CONNECT}/oauth/token`, { grant_type: "authorization_code", code }, { ...opts, account: null, idempotencyKey: null });
    const accountId = typeof json.stripe_user_id === "string" ? json.stripe_user_id : "";
    if (!accountId) throw new StripeError("UNEXPECTED", "A Stripe não devolveu a conta conectada.");
    return { accountId, livemode: json.livemode === true };
}

/** Disconnects the account from the platform (the owner's Stripe account itself is untouched). */
export async function oauthDeauthorize(clientId: string, accountId: string, opts: StripeRequestOptions = {}): Promise<void> {
    await request("POST", `${opts.connectBaseUrl ?? STRIPE_CONNECT}/oauth/deauthorize`, { client_id: clientId, stripe_user_id: accountId }, { ...opts, account: null, idempotencyKey: null });
}

// ── Checkout Sessions (direct charges on the connected account) ─────

export type CheckoutStatus = "open" | "complete" | "expired";
export type CheckoutPaymentStatus = "paid" | "unpaid" | "no_payment_required";

export interface CheckoutSessionState {
    id: string;
    url: string | null;
    status: CheckoutStatus;
    paymentStatus: CheckoutPaymentStatus;
    paymentIntent: string | null;
    /** in reais */
    amountTotal: number | null;
    /** ISO */
    expiresAt: string | null;
    customerEmail: string | null;
}

export function parseCheckoutSession(json: Record<string, unknown>): CheckoutSessionState {
    const details = (json.customer_details as { email?: string | null } | null) ?? null;
    return {
        id: String(json.id ?? ""),
        url: typeof json.url === "string" ? json.url : null,
        status: (json.status as CheckoutStatus) ?? "open",
        paymentStatus: (json.payment_status as CheckoutPaymentStatus) ?? "unpaid",
        paymentIntent: typeof json.payment_intent === "string" ? json.payment_intent : (json.payment_intent as { id?: string } | null)?.id ?? null,
        amountTotal: typeof json.amount_total === "number" ? json.amount_total / 100 : null,
        expiresAt: typeof json.expires_at === "number" ? new Date(json.expires_at * 1000).toISOString() : null,
        customerEmail: details?.email ?? (typeof json.customer_email === "string" ? json.customer_email : null),
    };
}

export interface CheckoutLine {
    name: string;
    /** in reais */
    amount: number;
    description?: string | null;
}

export interface CheckoutInput {
    /** the connected account (`acct_…`) the charge is made on */
    account: string;
    lines: CheckoutLine[];
    successUrl: string;
    cancelUrl: string;
    /** our invoice's id, searchable in the Stripe dashboard */
    clientReferenceId: string;
    metadata: Record<string, string>;
    customerEmail?: string | null;
    /** unix seconds; Stripe allows 30 minutes to 24 hours from now */
    expiresAt?: number | null;
    /** the description the tenant sees on the card statement (≤ 22 chars) */
    statementDescriptor?: string | null;
}

const cents = (reais: number) => Math.round(reais * 100);

/** `POST /v1/checkout/sessions` on the connected account: the page where the tenant types the card. */
export async function createCheckoutSession(input: CheckoutInput, opts: StripeRequestOptions = {}): Promise<CheckoutSessionState> {
    const body: Record<string, unknown> = {
        mode: "payment",
        payment_method_types: ["card"],
        locale: "pt-BR",
        currency: "brl",
        line_items: input.lines.map(l => ({
            quantity: 1,
            price_data: { currency: "brl", unit_amount: cents(l.amount), product_data: { name: l.name.slice(0, 250), ...(l.description ? { description: l.description.slice(0, 250) } : {}) } },
        })),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.clientReferenceId,
        metadata: input.metadata,
        payment_intent_data: { metadata: input.metadata, ...(input.statementDescriptor ? { statement_descriptor_suffix: input.statementDescriptor.slice(0, 22) } : {}) },
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
    };
    return parseCheckoutSession(await request<Record<string, unknown>>("POST", `${opts.baseUrl ?? STRIPE_API}/v1/checkout/sessions`, body, { ...opts, account: input.account }));
}

export async function getCheckoutSession(account: string, sessionId: string, opts: StripeRequestOptions = {}): Promise<CheckoutSessionState> {
    return parseCheckoutSession(await request<Record<string, unknown>>("GET", `${opts.baseUrl ?? STRIPE_API}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, null, { ...opts, account }));
}

/** Closes a session the tenant did not pay (a new one replaces it); a session already gone is fine. */
export async function expireCheckoutSession(account: string, sessionId: string, opts: StripeRequestOptions = {}): Promise<void> {
    try {
        await request("POST", `${opts.baseUrl ?? STRIPE_API}/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {}, { ...opts, account, idempotencyKey: null });
    } catch (err) {
        if (err instanceof StripeError && (err.code === "INVALID" || err.code === "NOT_FOUND")) return;
        throw err;
    }
}

// ── Webhook ─────────────────────────────────────────────────────────

/** The event as the webhook route reads it; `account` is the connected account it happened on. */
export interface StripeEvent {
    id: string;
    type: string;
    livemode: boolean;
    /** unix seconds */
    created: number;
    account: string | null;
    object: Record<string, unknown>;
}

/**
 * Checks `Stripe-Signature` (`t=…,v1=…`) against the raw body: HMAC-SHA256 of `${t}.${body}` with the
 * endpoint's signing secret, and a timestamp within `toleranceSec` of now.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs: number = Date.now(), toleranceSec = 300): boolean {
    if (!header) return false;
    const parts = header.split(",").map(p => p.trim().split("="));
    const t = parts.find(p => p[0] === "t")?.[1];
    const sigs = parts.filter(p => p[0] === "v1").map(p => p[1]).filter(Boolean);
    if (!t || sigs.length === 0 || !/^\d+$/.test(t)) return false;
    if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
    const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    return sigs.some(s => { const b = Buffer.from(s, "hex"); return b.length === a.length && timingSafeEqual(a, b); });
}

export function parseStripeEvent(json: unknown): StripeEvent | null {
    if (!json || typeof json !== "object") return null;
    const e = json as Record<string, unknown>;
    const data = (e.data as { object?: Record<string, unknown> } | null) ?? null;
    if (typeof e.id !== "string" || typeof e.type !== "string" || !data?.object) return null;
    return { id: e.id, type: e.type, livemode: e.livemode === true, created: typeof e.created === "number" ? e.created : 0, account: typeof e.account === "string" ? e.account : null, object: data.object };
}
