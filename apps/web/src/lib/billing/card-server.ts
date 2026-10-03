/**
 * The card payment: a Stripe Checkout Session on the owner's connected account, started from the
 * tenant's page (`POST /api/pagar/[token]/cartao`) and settled from what Stripe says of it — read
 * back from Stripe, never from the webhook's payload alone (the same rule as the bank's).
 *
 * The session asks for the invoice plus the late charges of the day plus the card fee the owner passes
 * on (lib/billing/card-offer.ts). One open session per invoice at a time (unique index): a second
 * click reuses it while its amount still holds; an amount that changed (another day of interest)
 * closes it and opens another. A paid session settles the invoice as CARD and cancels the boleto at
 * the bank, so the tenant cannot pay twice.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, notFound } from "@/lib/api-route";
import { env } from "@/lib/env";
import { todayBRT } from "@/lib/lease-dashboard";
import { toBillingSettingsView } from "@/lib/invoice-views-server";
import { cardOffer, type CardOffer } from "./card-offer";
import { CHARGE_COLUMNS, cancelChargeAtBank, isLiveBoleto, loadCharges, normalizeCharge, refreshCharge, type ChargeRow } from "./charges-server";
import { rowByToken, type TokenRow } from "./invoice-token-server";
import { StripeError, createCheckoutSession, expireCheckoutSession, getCheckoutSession, type CheckoutSessionState, type StripeEvent, type StripeRequestOptions } from "./stripe-client";
import { syncStripeAccount, usableStripeAccount } from "./stripe-connection-server";

const TABLE = "invoice_charges";
/** how long the tenant has on Stripe's page (Stripe allows 30 minutes to 24 hours) */
const SESSION_TTL_MS = 60 * 60_000;
/** a session this close to expiring is not handed out again */
const REUSE_MARGIN_MS = 5 * 60_000;
/** an open session not checked for this long is read back before the page trusts it */
export const CARD_STALE_AFTER_MS = 2 * 60_000;

export const isLiveCard = (c: Pick<ChargeRow, "status" | "kind">) => c.kind === "CARD_CHECKOUT" && (c.status === "REQUESTED" || c.status === "OPEN");

const sessionStatus = (s: CheckoutSessionState): ChargeRow["status"] => s.paymentStatus === "paid" ? "PAID" : s.status === "expired" ? "EXPIRED" : "OPEN";

async function event(supabase: AdminSupabase, profileId: string, invoiceId: string, type: string, actor: "SYSTEM" | "TENANT" | "STRIPE", detail: Record<string, unknown>, dedupeKey: string | null = null): Promise<boolean> {
    const { error } = await supabase.from("invoice_events").insert({ invoice_id: invoiceId, owner_id: profileId, type, actor, detail, dedupe_key: dedupeKey });
    if (error) {
        if (error.code === "23505") return false;
        console.error("[Card] event failed:", error.message);
    }
    return true;
}

/** The card offer for an invoice, from the owner's fee and Stripe standing. */
export async function cardOfferFor(supabase: AdminSupabase, row: TokenRow, today: string): Promise<{ offer: CardOffer; account: string | null }> {
    const [account, { data: settings }] = await Promise.all([
        usableStripeAccount(supabase, row.owner_id),
        supabase.from("billing_settings").select("card_fee_pct, card_fee_fixed").eq("owner_id", row.owner_id).maybeSingle(),
    ]);
    const view = settings ? toBillingSettingsView(settings as Record<string, unknown>) : null;
    const offer = cardOffer({ ...row, cardFeePct: view?.card_fee_pct, cardFeeFixed: view?.card_fee_fixed, stripeUsable: account !== null, today });
    return { offer, account };
}

/**
 * Brings a card charge in line with what Stripe says of its session. A paid one settles the invoice
 * (CARD; the late charges as the late fee, the card line as the surcharge) and cancels the boleto.
 */
export async function refreshCardCharge(supabase: AdminSupabase, profileId: string, charge: ChargeRow, request: StripeRequestOptions = {}): Promise<ChargeRow> {
    if (charge.kind !== "CARD_CHECKOUT" || !charge.provider_ref) return charge;
    const account = await stripeAccountOfOwner(supabase, profileId);
    if (!account) return charge;
    let session: CheckoutSessionState;
    try {
        session = await getCheckoutSession(account, charge.provider_ref, request);
    } catch (err) {
        if (err instanceof StripeError) {
            await supabase.from(TABLE).update({ last_error: err.message, last_checked_at: new Date().toISOString() }).eq("id", charge.id).eq("owner_id", profileId);
        }
        throw err;
    }
    const status = sessionStatus(session);
    const patch: Record<string, unknown> = {
        status, provider_status: `${session.status}/${session.paymentStatus}`, payment_intent_id: session.paymentIntent ?? charge.payment_intent_id,
        last_checked_at: new Date().toISOString(), last_error: null,
        ...(status !== "OPEN" ? { checkout_url: null } : {}),
        ...(status === "PAID" ? { paid_at: charge.paid_at ?? new Date().toISOString(), paid_amount: session.amountTotal ?? charge.amount, paid_via: "CARD" } : {}),
    };
    const { data, error } = await supabase.from(TABLE).update(patch).eq("id", charge.id).eq("owner_id", profileId).select(CHARGE_COLUMNS).single();
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    const next = normalizeCharge(data as Record<string, unknown>);

    if (next.status !== charge.status) {
        const type = next.status === "PAID" ? "CHARGE_PAID" : next.status === "EXPIRED" ? "CHARGE_EXPIRED" : null;
        if (type) await event(supabase, profileId, charge.invoice_id, type, "STRIPE", { kind: "CARD_CHECKOUT", session: charge.provider_ref, via: "CARD", amount: next.paid_amount, surcharge: next.surcharge_amount });
    }
    if (next.status === "PAID") await settleCard(supabase, profileId, next);
    return next;
}

async function settleCard(supabase: AdminSupabase, profileId: string, charge: ChargeRow): Promise<void> {
    const { data: invoice, error } = await supabase.from("invoices").select("status, amount").eq("id", charge.invoice_id).eq("owner_id", profileId).maybeSingle();
    if (error) throw new Error(`invoice: ${error.message}`);
    if (!invoice || (invoice.status !== "DRAFT" && invoice.status !== "ISSUED")) return;
    const net = charge.net_amount ?? Number(invoice.amount);
    const lateFee = Math.max(0, Math.round((net - Number(invoice.amount)) * 100) / 100);
    const { data: result, error: payError } = await supabase.rpc("invoice_mark_paid", {
        p_owner: profileId, p_invoice: charge.invoice_id, p_paid_on: (charge.paid_at ?? new Date().toISOString()).slice(0, 10),
        p_amount: net, p_via: "CARD", p_late_fee: lateFee, p_surcharge: charge.surcharge_amount ?? 0, p_ref: charge.payment_intent_id ?? charge.provider_ref, p_actor: "STRIPE",
    });
    if (payError) throw new Error(`invoice_mark_paid: ${payError.message}`);
    if (result === "DUPLICATE") console.warn("[Card] duplicate payment on", charge.invoice_id);
    // the boleto must not stay payable
    try {
        await cancelChargeAtBank(supabase, profileId, charge.invoice_id, "Pago por cartao");
    } catch (err) {
        console.error("[Card] cancelling the boleto after a card payment failed:", (err as Error).message);
    }
}

async function stripeAccountOfOwner(supabase: AdminSupabase, profileId: string): Promise<string | null> {
    const { data } = await supabase.from("billing_connections").select("external_account_id").eq("owner_id", profileId).eq("provider", "STRIPE").maybeSingle();
    return (data?.external_account_id as string | null | undefined) ?? null;
}

/** Reads back the invoice's open card session, if any (the tenant's page calls it when the session is stale, or right after Checkout). */
export async function refreshCardOfInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string, opts: { force?: boolean; now?: number } = {}): Promise<ChargeRow | null> {
    const now = opts.now ?? Date.now();
    const live = (await loadCharges(supabase, profileId, invoiceId)).find(isLiveCard);
    if (!live) return null;
    const stale = !live.last_checked_at || now - new Date(live.last_checked_at).getTime() > CARD_STALE_AFTER_MS;
    if (!opts.force && !stale) return live;
    try {
        return await refreshCardCharge(supabase, profileId, live);
    } catch (err) {
        console.error("[Card] refresh failed:", (err as Error).message);
        return live;
    }
}

/**
 * The tenant chose the card: makes sure the invoice is still open (reading the boleto back first,
 * so a boleto just paid is not paid again by card), computes today's amount, and returns the Checkout
 * URL — the open session's when it still holds, a new one otherwise.
 */
export async function startCardPayment(supabase: AdminSupabase, token: string, opts: { today?: string; baseUrl?: string; request?: StripeRequestOptions } = {}): Promise<{ url: string }> {
    const today = opts.today ?? todayBRT();
    const baseUrl = (opts.baseUrl ?? env.NEXT_PUBLIC_BASE_URL).replace(/\/+$/, "");
    let row = await rowByToken(supabase, token);
    if (!row) throw notFound("Fatura não encontrada.");

    // the boleto may have been paid minutes ago: the bank first
    const charges = await loadCharges(supabase, row.owner_id, row.id);
    const boleto = charges.find(isLiveBoleto);
    if (boleto) {
        try {
            const fresh = await refreshCharge(supabase, row.owner_id, boleto, { actor: "SYSTEM" });
            if (fresh.status === "PAID") row = (await rowByToken(supabase, token)) ?? row;
        } catch (err) {
            console.error("[Card] boleto refresh before the card failed:", (err as Error).message);
        }
    }
    const { offer, account } = await cardOfferFor(supabase, row, today);
    if (!offer.available || !account) {
        const why = !offer.available ? offer.reason : "NO_STRIPE";
        throw new HttpError(409, { error: why === "NOT_OPEN" ? "Esta fatura não está mais em aberto." : why === "WINDOW_CLOSED" ? "O prazo de pagamento desta fatura terminou. Peça uma nova ao proprietário." : "O pagamento por cartão não está disponível para esta fatura." });
    }

    // an open session for today's amount is handed out again
    const open = charges.find(c => isLiveCard(c) && c.status === "OPEN");
    if (open?.checkout_url && open.amount === offer.gross && open.expires_at && new Date(open.expires_at).getTime() - Date.now() > REUSE_MARGIN_MS) {
        return { url: open.checkout_url };
    }
    for (const stale of charges.filter(isLiveCard)) {
        if (stale.provider_ref) await expireCheckoutSession(account, stale.provider_ref, opts.request).catch(err => console.error("[Card] expire failed:", (err as Error).message));
        await supabase.from(TABLE).update({ status: "EXPIRED", provider_status: "expired/replaced", checkout_url: null, last_checked_at: new Date().toISOString() }).eq("id", stale.id).eq("owner_id", row.owner_id);
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const { data: inserted, error: insertError } = await supabase.from(TABLE).insert({
        invoice_id: row.id, owner_id: row.owner_id, provider: "STRIPE", kind: "CARD_CHECKOUT", status: "REQUESTED",
        amount: offer.gross, net_amount: offer.net, surcharge_amount: offer.surcharge, due_date: row.due_date, expires_at: expiresAt.toISOString(), attempts: charges.filter(c => c.kind === "CARD_CHECKOUT").length + 1,
    }).select(CHARGE_COLUMNS).single();
    if (insertError) {
        // two clicks at once: the other one is creating the session; the tenant tries again in a moment
        if (insertError.code === "23505") throw new HttpError(409, { error: "O pagamento por cartão está sendo preparado. Tente de novo em instantes." });
        throw new Error(`invoice_charges: ${insertError.message}`);
    }
    const charge = normalizeCharge(inserted as Record<string, unknown>);

    const place = [row.property_name, row.unit_name].filter(Boolean).join(" · ");
    const lines = [
        { name: `Fatura nº ${row.number} — ${place || "Imóvel"}`, amount: row.amount, description: `Referência ${row.reference_month.slice(0, 7).split("-").reverse().join("/")} · vencimento ${row.due_date.split("-").reverse().join("/")}` },
        ...(offer.late.extra > 0 ? [{ name: "Multa e juros por atraso", amount: offer.late.extra, description: `${offer.late.daysLate} dia(s) após o vencimento` }] : []),
        ...(offer.surcharge > 0 ? [{ name: "Taxa de processamento do cartão", amount: offer.surcharge, description: null }] : []),
    ];
    let session: CheckoutSessionState;
    try {
        session = await createCheckoutSession({
            account, lines,
            successUrl: `${baseUrl}/pt/pagar/${token}?cartao=ok`, cancelUrl: `${baseUrl}/pt/pagar/${token}?cartao=cancelado`,
            clientReferenceId: row.id, metadata: { invoice_id: row.id, charge_id: charge.id, owner_id: row.owner_id, invoice_number: String(row.number) },
            customerEmail: row.payer_email, expiresAt: Math.floor(expiresAt.getTime() / 1000), statementDescriptor: `FATURA ${row.number}`,
        }, { ...opts.request, idempotencyKey: charge.id });
    } catch (err) {
        const message = err instanceof StripeError ? err.message : "Falha ao falar com a Stripe.";
        await supabase.from(TABLE).update({ status: "FAILED", last_error: message, last_checked_at: new Date().toISOString() }).eq("id", charge.id).eq("owner_id", row.owner_id);
        await event(supabase, row.owner_id, row.id, "CARD_FAILED", "SYSTEM", { error: message });
        if (err instanceof StripeError) throw new HttpError(502, { error: "Não foi possível abrir o pagamento por cartão agora. Tente de novo em instantes ou use o PIX ou o boleto." });
        throw err;
    }
    if (!session.url) throw new HttpError(502, { error: "A Stripe não devolveu a página de pagamento." });
    const { error: openError } = await supabase.from(TABLE).update({
        status: "OPEN", provider_ref: session.id, provider_status: `${session.status}/${session.paymentStatus}`, checkout_url: session.url,
        expires_at: session.expiresAt ?? expiresAt.toISOString(), payment_intent_id: session.paymentIntent, last_checked_at: new Date().toISOString(),
    }).eq("id", charge.id).eq("owner_id", row.owner_id);
    if (openError) throw new Error(`invoice_charges: ${openError.message}`);
    await event(supabase, row.owner_id, row.id, "CARD_OPENED", "TENANT", { session: session.id, amount: offer.gross, net: offer.net, surcharge: offer.surcharge, late: offer.late.extra });
    return { url: session.url };
}

/** Closes the invoice's open card session (the owner cancelled the invoice, or it was paid another way). Never throws. */
export async function closeCardSessions(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<void> {
    try {
        const live = (await loadCharges(supabase, profileId, invoiceId)).filter(isLiveCard);
        if (live.length === 0) return;
        const account = await stripeAccountOfOwner(supabase, profileId);
        for (const c of live) {
            if (account && c.provider_ref) await expireCheckoutSession(account, c.provider_ref).catch(err => console.error("[Card] expire failed:", (err as Error).message));
            await supabase.from(TABLE).update({ status: "CANCELLED", provider_status: "expired/cancelled", checkout_url: null, last_checked_at: new Date().toISOString() }).eq("id", c.id).eq("owner_id", profileId);
        }
    } catch (err) {
        console.error("[Card] closing sessions failed:", (err as Error).message);
    }
}

/**
 * Stripe's webhook (Connect: the event names the connected account). The payload is a hint: the
 * session it names is read back from Stripe before anything changes; an event seen before is ignored.
 */
export async function handleStripeEvent(supabase: AdminSupabase, event: StripeEvent, request: StripeRequestOptions = {}): Promise<{ handled: boolean; ignored: boolean }> {
    if (event.type === "account.updated" && event.account) {
        return { handled: await syncStripeAccount(supabase, event.account, request), ignored: false };
    }
    if (!event.type.startsWith("checkout.session.")) return { handled: false, ignored: true };
    const sessionId = typeof event.object.id === "string" ? event.object.id : null;
    if (!sessionId) return { handled: false, ignored: true };
    const { data, error } = await supabase.from(TABLE).select(CHARGE_COLUMNS).eq("provider", "STRIPE").eq("provider_ref", sessionId).maybeSingle();
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    if (!data) return { handled: false, ignored: true };
    const charge = normalizeCharge(data as Record<string, unknown>);
    const fresh = await event_(supabase, charge.owner_id, charge.invoice_id, event);
    if (!fresh) return { handled: true, ignored: true };
    await refreshCardCharge(supabase, charge.owner_id, charge, request);
    return { handled: true, ignored: false };
}

const event_ = (supabase: AdminSupabase, profileId: string, invoiceId: string, e: StripeEvent) =>
    event(supabase, profileId, invoiceId, "WEBHOOK", "STRIPE", { type: e.type, event: e.id }, `stripe:${e.id}`);
