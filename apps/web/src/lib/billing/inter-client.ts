/**
 * Talking to Banco Inter's API with an owner's own integration.
 *
 * Every call is mutual TLS: the request presents the integration's certificate and key, and the bank
 * answers only to them. The access token comes from the OAuth endpoint (client credentials), lasts one
 * hour and can be asked for at most five times a minute — callers keep it (connections-server.ts).
 *
 * `node:https` rather than fetch: the client certificate is a property of the connection, and the
 * built-in fetch has no supported way to set it. Server only (runtime "nodejs").
 */
import https from "node:https";
import { INTER_BASE_URLS, normalizePem, parseScopes, type InterCredentials, type InterEnvironment } from "./inter-credentials";

export type InterErrorCode = "TLS" | "UNAUTHORIZED" | "SCOPE" | "RATE_LIMIT" | "UNAVAILABLE" | "TIMEOUT" | "NETWORK" | "UNEXPECTED";

/** What went wrong, in words the owner can act on. The message never carries a credential. */
export class InterError extends Error {
    constructor(public readonly code: InterErrorCode, message: string, public readonly status: number | null = null) {
        super(message);
    }
}

export interface InterRequestOptions {
    environment: InterEnvironment;
    /** tests point this at a local server */
    baseUrl?: string;
    /** tests: the authority that signed the local server's certificate */
    ca?: string;
    timeoutMs?: number;
}

export interface InterToken {
    accessToken: string;
    /** seconds */
    expiresIn: number;
    scopes: string[];
}

interface RawResponse { status: number; body: string }

/** One mTLS request; resolves with the status and the body, rejects with an InterError on a transport failure. */
function send(url: URL, init: { method: string; headers: Record<string, string>; body?: string }, credentials: Pick<InterCredentials, "certificate" | "private_key">, opts: InterRequestOptions): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || 443,
            path: `${url.pathname}${url.search}`,
            method: init.method,
            headers: init.headers,
            cert: normalizePem(credentials.certificate),
            key: normalizePem(credentials.private_key),
            ...(opts.ca ? { ca: opts.ca } : {}),
            timeout: opts.timeoutMs ?? 15_000,
            // a fresh socket per call: the client certificate must never be shared between owners through a pooled connection
            agent: false,
        }, response => {
            const chunks: Buffer[] = [];
            response.on("data", (c: Buffer) => chunks.push(c));
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
            response.on("error", () => reject(new InterError("NETWORK", "A resposta do Banco Inter foi interrompida. Tente de novo.")));
        });
        request.on("timeout", () => request.destroy(new InterError("TIMEOUT", "O Banco Inter demorou demais para responder. Tente de novo em instantes.")));
        request.on("error", (err: NodeJS.ErrnoException) => {
            if (err instanceof InterError) return reject(err);
            const code = String(err.code ?? "");
            // the bank closes the handshake on a certificate it does not know (revoked, cancelled integration, wrong environment)
            if (/ERR_SSL|ERR_TLS|ECONNRESET|EPROTO|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_OSSL/.test(code) || /alert|handshake|certificate/i.test(err.message)) {
                return reject(new InterError("TLS", "O Banco Inter recusou o certificado. Confira se o .crt e o .key são da integração ativa e do ambiente certo."));
            }
            reject(new InterError("NETWORK", "Não foi possível falar com o Banco Inter. Tente de novo em instantes."));
        });
        if (init.body) request.write(init.body);
        request.end();
    });
}

function parseJson(body: string): Record<string, unknown> {
    try {
        const json = JSON.parse(body) as unknown;
        return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

/** The bank's own explanation of an error, when it gives one that is safe to show (short, no markup). */
function bankDetail(json: Record<string, unknown>): string {
    const detail = [json.error_description, json.detail, json.message, json.title, json.error].find(v => typeof v === "string" && v.trim()) as string | undefined;
    return detail ? ` (${detail.replace(/[<>]/g, "").trim().slice(0, 160)})` : "";
}

/**
 * Asks the bank for an access token with the given scopes (`POST /oauth/v2/token`, client credentials).
 * Throws an InterError that says what to fix: the certificate, the client id/secret, the permissions.
 */
export async function requestInterToken(credentials: InterCredentials, scopes: readonly string[], opts: InterRequestOptions): Promise<InterToken> {
    const url = new URL("/oauth/v2/token", opts.baseUrl ?? INTER_BASE_URLS[opts.environment]);
    const body = new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        grant_type: "client_credentials",
        scope: scopes.join(" "),
    }).toString();
    const response = await send(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)), Accept: "application/json" }, body }, credentials, opts);
    const json = parseJson(response.body);

    if (response.status === 200) {
        const accessToken = typeof json.access_token === "string" ? json.access_token : "";
        const expiresIn = Number(json.expires_in) || 0;
        if (!accessToken || expiresIn <= 0) throw new InterError("UNEXPECTED", "O Banco Inter respondeu sem um token válido.", 200);
        return { accessToken, expiresIn, scopes: parseScopes(typeof json.scope === "string" ? json.scope : scopes.join(" ")) };
    }
    const detail = bankDetail(json);
    if (/scope/i.test(`${json.error ?? ""} ${json.error_description ?? ""}`)) {
        throw new InterError("SCOPE", `A integração não tem as permissões da API Cobrança (emitir/cancelar e consultar). Inclua-as no Internet Banking${detail}.`, response.status);
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new InterError("UNAUTHORIZED", `O Banco Inter não aceitou o Client ID e o Client Secret${detail}. Confira se são desta integração e se ela está ativa.`, response.status);
    }
    if (response.status === 429) throw new InterError("RATE_LIMIT", "Muitas tentativas em pouco tempo. O Banco Inter aceita cinco pedidos de token por minuto: aguarde um minuto.", 429);
    if (response.status >= 500) throw new InterError("UNAVAILABLE", "O Banco Inter está indisponível no momento. Tente de novo mais tarde.", response.status);
    throw new InterError("UNEXPECTED", `Resposta inesperada do Banco Inter (HTTP ${response.status})${detail}.`, response.status);
}
