/**
 * An owner's connection to Banco Inter: saving the integration's credentials (sealed), testing them
 * against the bank, and handing the rest of the module a token to call the API with.
 *
 * Secrets go in and never come out through the API: the row keeps them sealed (lib/secret-box.ts, bound
 * to the owner and the provider), and what the screens show is built from `metadata`. Every function is
 * scoped to the account (`profileId`).
 */
import { createHash, randomBytes } from "node:crypto";
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, badRequest, conflict, notFound } from "@/lib/api-route";
import { SecretBoxError, fingerprint, openSecret, sealSecret, secretBoxAvailable } from "@/lib/secret-box";
import { todayBRT } from "@/lib/lease-dashboard";
import type { InterConnectionInput } from "@/lib/schemas/billing-connection";
import { certificateStanding, type ConnectionStatus, type ConnectionsView, type InterConnectionView } from "./connections";
import { InterError, putInterWebhook, requestInterToken, type InterRequestOptions } from "./inter-client";
import { stripeAvailable } from "./stripe-client";
import { loadStripeView } from "./stripe-connection-server";
import {
    CERTIFICATE_PROBLEMS, INTER_REQUIRED_SCOPES, inspectCertificate, missingScopes, normalizePem, tail,
    type InterCredentials, type InterEnvironment,
} from "./inter-credentials";

const TABLE = "billing_connections";
const COLUMNS = "id, owner_id, provider, status, environment, metadata, secret_ciphertext, token_ciphertext, token_expires_at, cert_expires_at, configured_at, last_checked_at, last_error, webhook_key_hash, webhook_registered_at";

/** What a sealed secret is bound to: opened anywhere else, it fails. */
const context = (ownerId: string, provider: string) => `${ownerId}:${provider}`;

/** The bank's sandbox is for trying things out: never on the production site, where an invoice reaches a real tenant. */
export const sandboxAllowed = (env: Record<string, string | undefined> = process.env): boolean => env.VERCEL_ENV !== "production";

interface ConnectionRow {
    id: string;
    owner_id: string;
    provider: string;
    status: ConnectionStatus;
    environment: InterEnvironment;
    metadata: { account?: string | null; client_id_tail?: string | null; certificate_subject?: string | null; scopes?: string[] } | null;
    secret_ciphertext: string | null;
    token_ciphertext: string | null;
    token_expires_at: string | null;
    cert_expires_at: string | null;
    configured_at: string | null;
    last_checked_at: string | null;
    last_error: string | null;
    webhook_key_hash: string | null;
    webhook_registered_at: string | null;
}

async function loadRow(supabase: AdminSupabase, profileId: string): Promise<ConnectionRow | null> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).eq("provider", "INTER").maybeSingle();
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return (data as unknown as ConnectionRow | null) ?? null;
}

function toView(row: ConnectionRow, today: string): InterConnectionView {
    const cert = certificateStanding(row.cert_expires_at, today);
    return {
        status: row.status,
        environment: row.environment,
        account: row.metadata?.account ?? null,
        clientIdTail: row.metadata?.client_id_tail ?? null,
        certificateSubject: row.metadata?.certificate_subject ?? null,
        certificateExpiresAt: row.cert_expires_at,
        scopes: Array.isArray(row.metadata?.scopes) ? row.metadata.scopes : [],
        configuredAt: row.configured_at,
        lastCheckedAt: row.last_checked_at,
        lastError: row.last_error,
        usable: row.status === "CONNECTED" && cert?.state !== "expired" && (row.environment === "PRODUCTION" || sandboxAllowed()),
    };
}

/** The account's connections as the screens show them. Never a secret. */
export async function loadConnections(supabase: AdminSupabase, profileId: string): Promise<ConnectionsView> {
    const [row, stripe] = await Promise.all([loadRow(supabase, profileId), loadStripeView(supabase, profileId)]);
    return { available: secretBoxAvailable(), sandboxAllowed: sandboxAllowed(), inter: row ? toView(row, todayBRT()) : null, stripeAvailable: stripeAvailable(), stripe };
}

const unavailable = () => new HttpError(503, { error: "A conexão com o banco está indisponível neste servidor: falta configurar a chave de criptografia." });

function openCredentials(row: ConnectionRow): InterCredentials {
    if (!row.secret_ciphertext) throw notFound("Nenhuma credencial do Banco Inter cadastrada.");
    try {
        return JSON.parse(openSecret(row.secret_ciphertext, context(row.owner_id, "INTER"))) as InterCredentials;
    } catch (err) {
        if (err instanceof SecretBoxError) throw new HttpError(409, { error: `${err.message} Cadastre as credenciais do Banco Inter de novo.` });
        throw err;
    }
}

/**
 * Saves the credentials of the owner's Banco Inter integration and tests them at once.
 * The first save needs everything; a later one may bring only what changed — a renewed integration
 * keeps its client id and secret and gets a new certificate and key, which must come together.
 */
export async function saveInterConnection(supabase: AdminSupabase, profileId: string, input: InterConnectionInput, request: Partial<InterRequestOptions> = {}): Promise<ConnectionsView> {
    if (!secretBoxAvailable()) throw unavailable();
    if (input.environment === "SANDBOX" && !sandboxAllowed()) throw badRequest({ environment: "O ambiente de testes do banco não pode ser usado em produção." });

    const existing = await loadRow(supabase, profileId);
    let stored: InterCredentials | null = null;
    if (existing?.secret_ciphertext) {
        try {
            stored = openCredentials(existing);
        } catch {
            // sealed with a key this server no longer has: the owner sends everything again, as on a first save
            stored = null;
        }
    }

    if (Boolean(input.certificate) !== Boolean(input.private_key)) {
        throw badRequest(input.certificate ? { private_key: "Envie também o arquivo .key do mesmo download." } : { certificate: "Envie também o arquivo .crt do mesmo download." });
    }
    const credentials: InterCredentials = {
        client_id: input.client_id ?? stored?.client_id ?? "",
        client_secret: input.client_secret ?? stored?.client_secret ?? "",
        certificate: normalizePem(input.certificate ?? stored?.certificate ?? ""),
        private_key: normalizePem(input.private_key ?? stored?.private_key ?? ""),
        account: input.account ?? stored?.account ?? "",
    };
    const missing: Record<string, string> = {};
    if (!credentials.client_id) missing.client_id = "Informe o Client ID da integração.";
    if (!credentials.client_secret) missing.client_secret = "Informe o Client Secret da integração.";
    if (!credentials.certificate) missing.certificate = "Envie o arquivo .crt da integração.";
    if (!credentials.private_key) missing.private_key = "Envie o arquivo .key da integração.";
    if (Object.keys(missing).length > 0) throw badRequest(missing);

    const inspected = inspectCertificate(credentials.certificate, credentials.private_key);
    if ("problem" in inspected) {
        const problem = CERTIFICATE_PROBLEMS[inspected.problem];
        throw badRequest({ [problem.field]: problem.message });
    }

    const { sealed, keyId } = sealSecret(JSON.stringify(credentials), context(profileId, "INTER"));
    const record = {
        owner_id: profileId,
        provider: "INTER",
        status: "PENDING",
        environment: input.environment,
        metadata: { account: credentials.account || null, client_id_tail: tail(credentials.client_id), certificate_subject: inspected.info.subject, scopes: [] },
        credential_fingerprint: fingerprint("inter", credentials.client_id),
        secret_ciphertext: sealed,
        secret_key_id: keyId,
        // a token belongs to the credentials that asked for it
        token_ciphertext: null,
        token_expires_at: null,
        cert_expires_at: inspected.info.expiresAt,
        configured_at: new Date().toISOString(),
        last_checked_at: null,
        last_error: null,
    };
    const { error } = await supabase.from(TABLE).upsert(record, { onConflict: "owner_id,provider" });
    if (error) {
        // the same integration is registered on another account
        if (error.code === "23505") throw conflict({ client_id: "Esta integração do Banco Inter já está cadastrada em outra conta." });
        throw new Error(`billing_connections: ${error.message}`);
    }
    return testInterConnection(supabase, profileId, request);
}

/**
 * Asks the bank for a token with the stored credentials and records what it answered: connected with
 * the scopes granted, or the error in words. The connection's view comes back either way — a failed
 * test is an answer, not an exception.
 */
export async function testInterConnection(supabase: AdminSupabase, profileId: string, request: Partial<InterRequestOptions> = {}): Promise<ConnectionsView> {
    if (!secretBoxAvailable()) throw unavailable();
    const row = await loadRow(supabase, profileId);
    if (!row) throw notFound("Nenhuma credencial do Banco Inter cadastrada.");
    const credentials = openCredentials(row);

    const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
    try {
        const token = await requestInterToken(credentials, INTER_REQUIRED_SCOPES, { ...request, environment: row.environment });
        const lacking = missingScopes(token.scopes);
        patch.metadata = { ...(row.metadata ?? {}), scopes: token.scopes };
        if (lacking.length > 0) {
            patch.status = "ERROR";
            patch.last_error = `A integração não tem as permissões da API Cobrança: ${lacking.join(", ")}. Inclua-as no Internet Banking.`;
        } else {
            patch.status = "CONNECTED";
            patch.last_error = null;
            // kept for the calls that follow: the bank gives out five tokens a minute, and each lasts an hour
            patch.token_ciphertext = sealSecret(token.accessToken, context(profileId, "INTER:token")).sealed;
            patch.token_expires_at = new Date(Date.now() + token.expiresIn * 1000).toISOString();
        }
    } catch (err) {
        if (!(err instanceof InterError)) throw err;
        patch.status = "ERROR";
        patch.last_error = err.message;
    }
    const { error } = await supabase.from(TABLE).update(patch).eq("id", row.id).eq("owner_id", profileId);
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return loadConnections(supabase, profileId);
}

/** Erases the owner's Banco Inter credentials. */
export async function deleteInterConnection(supabase: AdminSupabase, profileId: string): Promise<ConnectionsView> {
    const { error } = await supabase.from(TABLE).delete().eq("owner_id", profileId).eq("provider", "INTER");
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return loadConnections(supabase, profileId);
}

/** How long before it expires a kept token stops being handed out. */
const TOKEN_MARGIN_MS = 60_000;

export interface InterSession {
    connectionId: string;
    credentials: InterCredentials;
    environment: InterEnvironment;
    accessToken: string;
    webhookRegistered: boolean;
}

/**
 * What a call to the bank needs: the owner's credentials (the certificate goes on every request) and a
 * token — the kept one while it lasts, a new one otherwise. Throws when the owner has no usable connection.
 */
export async function interSession(supabase: AdminSupabase, profileId: string, request: Partial<InterRequestOptions> = {}, opts: { fresh?: boolean } = {}): Promise<InterSession> {
    const row = await loadRow(supabase, profileId);
    if (!row || row.status !== "CONNECTED") throw new HttpError(409, { error: "O Banco Inter não está conectado. Conecte a sua integração em Faturas → Conexões." });
    if (row.environment === "SANDBOX" && !sandboxAllowed()) throw new HttpError(409, { error: "A conexão cadastrada é do ambiente de testes do banco." });
    const credentials = openCredentials(row);
    const base = { connectionId: row.id, credentials, environment: row.environment, webhookRegistered: Boolean(row.webhook_registered_at) };

    if (!opts.fresh && row.token_ciphertext && row.token_expires_at && Date.parse(row.token_expires_at) - Date.now() > TOKEN_MARGIN_MS) {
        try {
            return { ...base, accessToken: openSecret(row.token_ciphertext, context(profileId, "INTER:token")) };
        } catch {
            // sealed with a key this server no longer has: ask for a new one
        }
    }
    const token = await requestInterToken(credentials, INTER_REQUIRED_SCOPES, { ...request, environment: row.environment });
    const { error } = await supabase.from(TABLE)
        .update({ token_ciphertext: sealSecret(token.accessToken, context(profileId, "INTER:token")).sealed, token_expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString() })
        .eq("id", row.id).eq("owner_id", profileId);
    if (error) console.error("[Inter] could not keep the token:", error.message);
    return { ...base, accessToken: token.accessToken };
}

/**
 * Runs a call to the bank with the owner's session; a token the bank no longer accepts is replaced
 * once and the call repeated.
 */
export async function withInterSession<T>(supabase: AdminSupabase, profileId: string, fn: (session: InterSession) => Promise<T>, request: Partial<InterRequestOptions> = {}): Promise<T> {
    try {
        return await fn(await interSession(supabase, profileId, request));
    } catch (err) {
        if (!(err instanceof InterError) || err.code !== "UNAUTHORIZED") throw err;
        return fn(await interSession(supabase, profileId, request, { fresh: true }));
    }
}

const webhookKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * Registers, once per connection, where the bank reports paid, cancelled and expired charges: a URL
 * with a secret only this connection knows (its hash is kept; the webhook route looks the connection
 * up by it and then reads the charge back from the bank — the payload is a hint, never the truth).
 */
export async function ensureInterWebhook(supabase: AdminSupabase, profileId: string, session: InterSession, baseUrl: string, request: Partial<InterRequestOptions> = {}): Promise<void> {
    if (session.webhookRegistered) return;
    const key = randomBytes(24).toString("base64url");
    await putInterWebhook(session, `${baseUrl.replace(/\/+$/, "")}/api/webhooks/inter/${key}`, request);
    const { error } = await supabase.from(TABLE)
        .update({ webhook_key_hash: webhookKeyHash(key), webhook_registered_at: new Date().toISOString() })
        .eq("id", session.connectionId).eq("owner_id", profileId);
    if (error) throw new Error(`billing_connections: ${error.message}`);
    session.webhookRegistered = true;
}

/** The owner behind a webhook key, or null when the key leads nowhere. */
export async function ownerOfWebhookKey(supabase: AdminSupabase, key: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
    const { data, error } = await supabase.from(TABLE).select("owner_id").eq("provider", "INTER").eq("webhook_key_hash", webhookKeyHash(key)).maybeSingle();
    if (error) throw new Error(`billing_connections: ${error.message}`);
    return data ? String(data.owner_id) : null;
}
