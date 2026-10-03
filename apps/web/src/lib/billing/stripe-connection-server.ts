/**
 * An owner's Stripe account connected to the Kitnets platform (Stripe Connect, Standard account,
 * OAuth): the owner is sent to Stripe, signs in to their own account (or creates one) and comes
 * back; what is kept is the account's id and standing — never a key, since the platform's key with
 * `Stripe-Account` is all the card payment needs. Every function is scoped to the account (`profileId`).
 *
 * The OAuth `state` is a random token whose hash waits on the connection row for thirty minutes:
 * a return with another state, or a late one, is refused (CSRF).
 */
import { createHash, randomBytes } from "node:crypto";
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, badRequest, notFound } from "@/lib/api-route";
import { env } from "@/lib/env";
import type { ConnectionStatus, StripeConnectionView } from "./connections";
import { StripeError, getStripeAccount, oauthAuthorizeUrl, oauthDeauthorize, oauthToken, stripeConfig, stripeEnvironment, type StripeAccountState, type StripeEnvironment, type StripeRequestOptions } from "./stripe-client";

const TABLE = "billing_connections";
const COLUMNS = "id, owner_id, status, environment, metadata, external_account_id, configured_at, last_checked_at, last_error";
const STATE_TTL_MS = 30 * 60_000;

interface StripeMetadata {
    name?: string | null;
    country?: string | null;
    default_currency?: string | null;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    requirements_due?: string[];
    email?: string | null;
    /** the OAuth state's hash while a connection is in progress */
    oauth_state_hash?: string | null;
    oauth_state_at?: string | null;
}

interface StripeRow {
    id: string;
    owner_id: string;
    status: ConnectionStatus;
    environment: StripeEnvironment;
    metadata: StripeMetadata | null;
    external_account_id: string | null;
    configured_at: string | null;
    last_checked_at: string | null;
    last_error: string | null;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const tail = (s: string | null) => (s && s.length > 4 ? `…${s.slice(-4)}` : s);

/** Where Stripe sends the owner back to (the route that finishes the connection). */
export const stripeReturnUrl = (baseUrl: string = env.NEXT_PUBLIC_BASE_URL) => `${baseUrl.replace(/\/+$/, "")}/api/faturas/conexoes/stripe/retorno`;

export async function loadStripeRow(supabase: AdminSupabase, profileId: string): Promise<StripeRow | null> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).eq("provider", "STRIPE").maybeSingle();
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return (data as unknown as StripeRow | null) ?? null;
}

/** The connection as the screens see it (null while there is none, or only an OAuth in progress). */
export function toStripeView(row: StripeRow, currentEnvironment: StripeEnvironment | null): StripeConnectionView | null {
    if (!row.external_account_id) return null;
    const m = row.metadata ?? {};
    return {
        status: row.status,
        environment: row.environment,
        accountTail: tail(row.external_account_id),
        name: m.name ?? null,
        country: m.country ?? null,
        chargesEnabled: m.charges_enabled === true,
        payoutsEnabled: m.payouts_enabled === true,
        detailsSubmitted: m.details_submitted === true,
        requirementsDue: Array.isArray(m.requirements_due) ? m.requirements_due : [],
        configuredAt: row.configured_at,
        lastCheckedAt: row.last_checked_at,
        lastError: row.last_error,
        usable: row.status === "CONNECTED" && m.charges_enabled === true && currentEnvironment !== null && row.environment === currentEnvironment,
    };
}

export async function loadStripeView(supabase: AdminSupabase, profileId: string): Promise<StripeConnectionView | null> {
    const row = await loadStripeRow(supabase, profileId);
    const config = stripeConfig();
    return row ? toStripeView(row, config ? stripeEnvironment(config.secretKey) : null) : null;
}

const unavailable = () => new HttpError(503, { error: "Cartão indisponível neste servidor: a plataforma Stripe não está configurada." });

/**
 * Starts the connection: a fresh state is hashed onto the row and the owner is sent to Stripe.
 * An existing connection is kept until the new one completes.
 */
export async function beginStripeConnect(supabase: AdminSupabase, profileId: string, ownerEmail: string | null, opts: { baseUrl?: string } = {}): Promise<string> {
    const config = stripeConfig();
    if (!config) throw unavailable();
    const existing = await loadStripeRow(supabase, profileId);
    const state = randomBytes(24).toString("hex");
    const metadata: StripeMetadata = { ...(existing?.metadata ?? {}), oauth_state_hash: hash(state), oauth_state_at: new Date().toISOString() };
    const { error } = existing
        ? await supabase.from(TABLE).update({ metadata }).eq("id", existing.id).eq("owner_id", profileId)
        : await supabase.from(TABLE).insert({ owner_id: profileId, provider: "STRIPE", status: "PENDING", environment: stripeEnvironment(config.secretKey), metadata });
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return oauthAuthorizeUrl({ clientId: config.clientId, state, redirectUri: stripeReturnUrl(opts.baseUrl), email: ownerEmail });
}

const standing = (account: StripeAccountState): { status: ConnectionStatus; metadata: StripeMetadata } => ({
    status: "CONNECTED",
    metadata: {
        name: account.name, country: account.country, default_currency: account.defaultCurrency, charges_enabled: account.chargesEnabled, payouts_enabled: account.payoutsEnabled,
        details_submitted: account.detailsSubmitted, requirements_due: account.requirementsDue, email: account.email, oauth_state_hash: null, oauth_state_at: null,
    },
});

/**
 * Finishes the connection with what Stripe sent back. The state must be the one this account started
 * with, within thirty minutes. Then the code becomes the account id and the account is read.
 */
export async function completeStripeConnect(supabase: AdminSupabase, profileId: string, code: string, state: string, request: StripeRequestOptions = {}): Promise<StripeConnectionView> {
    const config = stripeConfig();
    if (!config) throw unavailable();
    const row = await loadStripeRow(supabase, profileId);
    const startedAt = row?.metadata?.oauth_state_at ? Date.parse(row.metadata.oauth_state_at) : NaN;
    if (!row?.metadata?.oauth_state_hash || row.metadata.oauth_state_hash !== hash(state) || !Number.isFinite(startedAt) || Date.now() - startedAt > STATE_TTL_MS) {
        throw badRequest({ _form: "A conexão com a Stripe expirou ou não partiu desta conta. Comece de novo." });
    }
    let accountId: string, livemode: boolean, account: StripeAccountState;
    try {
        ({ accountId, livemode } = await oauthToken(code, request));
        account = await getStripeAccount(accountId, request);
    } catch (err) {
        if (err instanceof StripeError) {
            await supabase.from(TABLE).update({ status: "ERROR", last_error: err.message, last_checked_at: new Date().toISOString() }).eq("id", row.id).eq("owner_id", profileId);
            throw new HttpError(502, { error: err.message });
        }
        throw err;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from(TABLE).update({
        ...standing(account), external_account_id: accountId, environment: livemode ? "PRODUCTION" : "SANDBOX",
        configured_at: now, last_checked_at: now, last_error: null,
    }).eq("id", row.id).eq("owner_id", profileId);
    if (error) {
        // the unique index on (provider, external_account_id): the same Stripe account already serves another owner
        if (error.code === "23505") throw new HttpError(409, { error: "Esta conta Stripe já está conectada a outro proprietário do Kitnets." });
        throw new Error(`billing_connections: ${error.message}`);
    }
    const fresh = await loadStripeRow(supabase, profileId);
    return toStripeView(fresh as StripeRow, stripeEnvironment(config.secretKey)) as StripeConnectionView;
}

/** Reads the account again (Stripe's review may have finished, requirements may have changed). */
export async function refreshStripeConnection(supabase: AdminSupabase, profileId: string, request: StripeRequestOptions = {}): Promise<StripeConnectionView> {
    const config = stripeConfig();
    if (!config) throw unavailable();
    const row = await loadStripeRow(supabase, profileId);
    if (!row?.external_account_id) throw notFound("Nenhuma conta Stripe conectada.");
    const patch = await applyAccountState(supabase, row, request);
    return toStripeView({ ...row, ...patch } as StripeRow, stripeEnvironment(config.secretKey)) as StripeConnectionView;
}

async function applyAccountState(supabase: AdminSupabase, row: StripeRow, request: StripeRequestOptions): Promise<Partial<StripeRow>> {
    const now = new Date().toISOString();
    let patch: Partial<StripeRow>;
    try {
        patch = { ...standing(await getStripeAccount(row.external_account_id as string, request)), last_checked_at: now, last_error: null };
    } catch (err) {
        if (!(err instanceof StripeError)) throw err;
        // a transient failure keeps the standing; a refused account is an error of the connection
        patch = err.code === "ACCOUNT" || err.code === "NOT_FOUND" || err.code === "UNAUTHORIZED"
            ? { status: "ERROR", last_error: err.message, last_checked_at: now }
            : { last_error: err.message, last_checked_at: now };
    }
    const { error } = await supabase.from(TABLE).update(patch).eq("id", row.id);
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return patch;
}

/** Disconnects the account from the platform and forgets it (the owner's Stripe account itself is untouched). */
export async function disconnectStripe(supabase: AdminSupabase, profileId: string, request: StripeRequestOptions = {}): Promise<void> {
    const row = await loadStripeRow(supabase, profileId);
    if (!row) return;
    const config = stripeConfig();
    if (row.external_account_id && config) {
        try {
            await oauthDeauthorize(config.clientId, row.external_account_id, request);
        } catch (err) {
            // already disconnected on Stripe's side, or Stripe unreachable: the row goes anyway, the owner can reconnect
            console.error("[Stripe] deauthorize failed:", (err as Error).message);
        }
    }
    const { error } = await supabase.from(TABLE).delete().eq("id", row.id).eq("owner_id", profileId);
    if (error) throw new Error(`billing_connections: ${error.message}`);
}

/** The owner behind a connected account (the webhook's `event.account`), or null. */
export async function ownerOfStripeAccount(supabase: AdminSupabase, accountId: string): Promise<StripeRow | null> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("provider", "STRIPE").eq("external_account_id", accountId).maybeSingle();
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return (data as unknown as StripeRow | null) ?? null;
}

/** `account.updated` from the webhook: Stripe says the account's standing changed. The account is read back, not trusted from the payload. */
export async function syncStripeAccount(supabase: AdminSupabase, accountId: string, request: StripeRequestOptions = {}): Promise<boolean> {
    const row = await ownerOfStripeAccount(supabase, accountId);
    if (!row) return false;
    await applyAccountState(supabase, row, request);
    return true;
}

/** The connected account the card payment is made on, when it can take cards here; null otherwise. */
export async function usableStripeAccount(supabase: AdminSupabase, profileId: string): Promise<string | null> {
    const row = await loadStripeRow(supabase, profileId);
    const config = stripeConfig();
    if (!row || !config) return null;
    return toStripeView(row, stripeEnvironment(config.secretKey))?.usable ? row.external_account_id : null;
}
