import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
    StripeError, createCheckoutSession, encodeForm, expireCheckoutSession, getCheckoutSession, getStripeAccount, oauthAuthorizeUrl, oauthToken,
    parseStripeEvent, stripeAvailable, stripeConfig, stripeEnvironment, verifyStripeSignature,
} from "./stripe-client";

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
const callOf = (f: typeof fetch) => (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
const KEY = "sk_test_123";

describe("config", () => {
    it("all three or nothing", () => {
        expect(stripeConfig({ STRIPE_SECRET_KEY: "sk_test_1", STRIPE_CLIENT_ID: "ca_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toEqual({ secretKey: "sk_test_1", clientId: "ca_1", webhookSecret: "whsec_1" });
        expect(stripeAvailable({ STRIPE_SECRET_KEY: "sk_test_1", STRIPE_CLIENT_ID: "ca_1" })).toBe(false);
        expect(stripeAvailable({})).toBe(false);
    });

    it("a test key is the sandbox", () => {
        expect(stripeEnvironment("sk_test_abc")).toBe("SANDBOX");
        expect(stripeEnvironment("rk_test_abc")).toBe("SANDBOX");
        expect(stripeEnvironment("sk_live_abc")).toBe("PRODUCTION");
    });
});

describe("encodeForm", () => {
    it("nests like Stripe expects", () => {
        expect(encodeForm({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: 26070 } }], metadata: { invoice_id: "i1" }, skip: null }))
            .toBe("mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=brl&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=26070&metadata%5Binvoice_id%5D=i1");
        expect(encodeForm({ payment_method_types: ["card"] })).toBe("payment_method_types%5B0%5D=card");
    });
});

describe("createCheckoutSession", () => {
    it("creates the session on the connected account, in centavos, with the idempotency key", async () => {
        const fetchImpl = respond(200, { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", status: "open", payment_status: "unpaid", payment_intent: null, amount_total: 26070, expires_at: 1_800_000_000 });
        const s = await createCheckoutSession({
            account: "acct_1", lines: [{ name: "Fatura nº 12", amount: 249.9 }, { name: "Taxa de processamento do cartão", amount: 10.8 }],
            successUrl: "https://k/ok", cancelUrl: "https://k/cancel", clientReferenceId: "inv-1", metadata: { invoice_id: "inv-1", charge_id: "ch-1" }, customerEmail: "ana@example.com", expiresAt: 1_800_000_000,
        }, { secretKey: KEY, fetchImpl, idempotencyKey: "ch-1" });
        expect(s).toMatchObject({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", status: "open", paymentStatus: "unpaid", amountTotal: 260.7, expiresAt: "2027-01-15T08:00:00.000Z" });
        const [url, init] = callOf(fetchImpl);
        expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${KEY}`);
        expect(headers["Stripe-Account"]).toBe("acct_1");
        expect(headers["Idempotency-Key"]).toBe("ch-1");
        const body = new URLSearchParams(init.body as string);
        expect(body.get("mode")).toBe("payment");
        expect(body.get("line_items[0][price_data][unit_amount]")).toBe("24990");
        expect(body.get("line_items[1][price_data][unit_amount]")).toBe("1080");
        expect(body.get("line_items[1][price_data][product_data][name]")).toBe("Taxa de processamento do cartão");
        expect(body.get("customer_email")).toBe("ana@example.com");
        expect(body.get("client_reference_id")).toBe("inv-1");
        expect(body.get("metadata[invoice_id]")).toBe("inv-1");
        expect(body.get("payment_intent_data[metadata][charge_id]")).toBe("ch-1");
        expect(body.get("expires_at")).toBe("1800000000");
    });

    it("reads a paid session back", async () => {
        const fetchImpl = respond(200, { id: "cs_1", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 26070, customer_details: { email: "ana@example.com" } });
        const s = await getCheckoutSession("acct_1", "cs_1", { secretKey: KEY, fetchImpl });
        expect(s).toMatchObject({ status: "complete", paymentStatus: "paid", paymentIntent: "pi_1", amountTotal: 260.7, customerEmail: "ana@example.com" });
        expect(callOf(fetchImpl)[0]).toBe("https://api.stripe.com/v1/checkout/sessions/cs_1");
    });

    it("expiring a session already gone is fine", async () => {
        await expect(expireCheckoutSession("acct_1", "cs_1", { secretKey: KEY, fetchImpl: respond(400, { error: { type: "invalid_request_error", message: "You cannot expire a session that is not open" } }) })).resolves.toBeUndefined();
        await expect(expireCheckoutSession("acct_1", "cs_1", { secretKey: KEY, fetchImpl: respond(500, {}) })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    });

    it("puts Stripe's refusals in words", async () => {
        await expect(getStripeAccount("acct_1", { secretKey: KEY, fetchImpl: respond(401, { error: { message: "Invalid API Key" } }) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(getStripeAccount("acct_1", { secretKey: KEY, fetchImpl: respond(403, { error: { code: "account_invalid", message: "The provided key does not have access" } }) })).rejects.toMatchObject({ code: "ACCOUNT" });
        await expect(getStripeAccount("acct_1", { secretKey: KEY, fetchImpl: respond(404, { error: { code: "resource_missing", message: "No such account" } }) })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getStripeAccount("acct_1", { secretKey: KEY, fetchImpl: respond(429, { error: { code: "rate_limit", message: "slow down" } }) })).rejects.toMatchObject({ code: "RATE_LIMIT" });
        await expect(getStripeAccount("acct_1", { secretKey: "", fetchImpl: respond(200, {}) })).rejects.toBeInstanceOf(StripeError);
        const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
        await expect(getStripeAccount("acct_1", { secretKey: KEY, fetchImpl })).rejects.toMatchObject({ code: "NETWORK" });
    });

    it("reads the connected account's standing", async () => {
        const fetchImpl = respond(200, { id: "acct_1", livemode: false, charges_enabled: true, details_submitted: true, payouts_enabled: false, country: "BR", default_currency: "brl", business_profile: { name: "Holding Pedrosa" }, email: "dono@example.com", requirements: { currently_due: ["external_account"] } });
        const a = await getStripeAccount("acct_1", { secretKey: KEY, fetchImpl });
        expect(a).toEqual({ id: "acct_1", livemode: false, chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: false, country: "BR", defaultCurrency: "brl", name: "Holding Pedrosa", email: "dono@example.com", requirementsDue: ["external_account"] });
        // the platform's own key, never Stripe-Account, on this call
        expect((callOf(fetchImpl)[1].headers as Record<string, string>)["Stripe-Account"]).toBeUndefined();
    });
});

describe("Connect OAuth", () => {
    it("builds the authorize URL with the state", () => {
        const url = new URL(oauthAuthorizeUrl({ clientId: "ca_1", state: "abc", redirectUri: "https://kitnets.com/api/faturas/conexoes/stripe/retorno", email: "dono@example.com" }));
        expect(url.origin + url.pathname).toBe("https://connect.stripe.com/oauth/authorize");
        expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: "code", client_id: "ca_1", scope: "read_write", state: "abc", redirect_uri: "https://kitnets.com/api/faturas/conexoes/stripe/retorno", "stripe_user[email]": "dono@example.com", "stripe_user[country]": "BR" });
    });

    it("exchanges the code for the account", async () => {
        const fetchImpl = respond(200, { stripe_user_id: "acct_9", livemode: true, scope: "read_write" });
        expect(await oauthToken("ac_code", { secretKey: KEY, fetchImpl })).toEqual({ accountId: "acct_9", livemode: true });
        const [url, init] = callOf(fetchImpl);
        expect(url).toBe("https://connect.stripe.com/oauth/token");
        expect(new URLSearchParams(init.body as string).get("grant_type")).toBe("authorization_code");
        await expect(oauthToken("bad", { secretKey: KEY, fetchImpl: respond(400, { error: "invalid_grant", error_description: "Authorization code does not exist" }) })).rejects.toMatchObject({ code: "INVALID", message: "A Stripe recusou os dados: Authorization code does not exist" });
    });
});

describe("webhook", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", livemode: false, created: 1_700_000_000, account: "acct_1", data: { object: { id: "cs_1", object: "checkout.session" } } });
    const sign = (t: number, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`;

    it("accepts a fresh, correctly signed payload", () => {
        const now = 1_700_000_100_000;
        expect(verifyStripeSignature(body, sign(1_700_000_000), secret, now)).toBe(true);
        expect(verifyStripeSignature(body, `${sign(1_700_000_000)},v1=deadbeef`, secret, now)).toBe(true);
    });

    it("refuses a bad secret, a tampered body, an old timestamp or a missing header", () => {
        const now = 1_700_000_100_000;
        expect(verifyStripeSignature(body, sign(1_700_000_000, "whsec_other"), secret, now)).toBe(false);
        expect(verifyStripeSignature(body + " ", sign(1_700_000_000), secret, now)).toBe(false);
        expect(verifyStripeSignature(body, sign(1_700_000_000), secret, now + 600_000)).toBe(false);
        expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
        expect(verifyStripeSignature(body, "t=abc,v1=00", secret, now)).toBe(false);
    });

    it("parses the event with its connected account", () => {
        expect(parseStripeEvent(JSON.parse(body))).toMatchObject({ id: "evt_1", type: "checkout.session.completed", account: "acct_1", object: { id: "cs_1" } });
        expect(parseStripeEvent({ id: "x" })).toBeNull();
        expect(parseStripeEvent("nope")).toBeNull();
    });
});
