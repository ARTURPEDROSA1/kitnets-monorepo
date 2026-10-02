import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InterError, requestInterToken } from "./inter-client";
import { INTER_REQUIRED_SCOPES, type InterCredentials } from "./inter-credentials";
import { makeTestCertificates, type TestCertificates } from "./inter-test-certs";

/**
 * A server that plays the bank's token endpoint: mutual TLS with the test authority, and answers chosen
 * by the client id — the real bank's answers, as its documentation describes them.
 */
let certs: TestCertificates | null = null;
let server: https.Server | null = null;
let baseUrl = "";

beforeAll(async () => {
    certs = makeTestCertificates();
    if (!certs) return;
    server = https.createServer({ key: certs.server.key, cert: certs.server.cert, ca: certs.ca, requestCert: true, rejectUnauthorized: true }, (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => {
            const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
            const answer = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
            if (req.url !== "/oauth/v2/token" || req.method !== "POST" || form.get("grant_type") !== "client_credentials") return answer(404, { message: "not here" });
            switch (form.get("client_id")) {
                case "good": return answer(200, { access_token: "tok-123", token_type: "Bearer", expires_in: 3600, scope: form.get("scope") });
                case "partial": return answer(200, { access_token: "tok-456", token_type: "Bearer", expires_in: 3600, scope: "boleto-cobranca.read" });
                case "noscope": return answer(400, { error: "invalid_scope", error_description: "Escopo não autorizado para a aplicação" });
                case "limited": return answer(429, { title: "Too Many Requests" });
                case "down": return answer(503, {});
                case "odd": return answer(200, { token_type: "Bearer" });
                default: return answer(401, { error: "invalid_client", error_description: "Credenciais inválidas" });
            }
        });
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    certs?.cleanup();
});

const creds = (clientId: string, who: "client" | "stranger" = "client"): InterCredentials => ({
    client_id: clientId, client_secret: "secret", certificate: certs![who].cert, private_key: certs![who].key, account: "123456",
});
const opts = () => ({ environment: "PRODUCTION" as const, baseUrl, ca: certs!.ca, timeoutMs: 5000 });

describe("requestInterToken", () => {
    it("presents the integration's certificate and gets a token with the scopes the bank granted", async () => {
        if (!certs) return;
        const token = await requestInterToken(creds("good"), INTER_REQUIRED_SCOPES, opts());
        expect(token).toEqual({ accessToken: "tok-123", expiresIn: 3600, scopes: ["boleto-cobranca.read", "boleto-cobranca.write"] });
    });

    it("reports the scopes the bank actually granted, not the ones asked for", async () => {
        if (!certs) return;
        const token = await requestInterToken(creds("partial"), INTER_REQUIRED_SCOPES, opts());
        expect(token.scopes).toEqual(["boleto-cobranca.read"]);
    });

    it("a certificate the bank does not know is refused at the handshake, in words the owner can act on", async () => {
        if (!certs) return;
        const err = await requestInterToken(creds("good", "stranger"), INTER_REQUIRED_SCOPES, opts()).catch(e => e);
        expect(err).toBeInstanceOf(InterError);
        expect((err as InterError).code).toBe("TLS");
        expect((err as InterError).message).toMatch(/recusou o certificado/);
        expect((err as InterError).message).not.toContain("secret");
    });

    it("tells a wrong client id or secret from a missing permission, a rate limit and an outage", async () => {
        if (!certs) return;
        const codes = async (id: string) => requestInterToken(creds(id), INTER_REQUIRED_SCOPES, opts()).then(() => "ok", (e: InterError) => `${e.code}:${e.message}`);
        expect(await codes("bad")).toMatch(/^UNAUTHORIZED:.*Client ID e o Client Secret.*Credenciais inválidas/);
        expect(await codes("noscope")).toMatch(/^SCOPE:.*permissões da API Cobrança/);
        expect(await codes("limited")).toMatch(/^RATE_LIMIT:.*cinco pedidos/);
        expect(await codes("down")).toMatch(/^UNAVAILABLE:/);
        expect(await codes("odd")).toMatch(/^UNEXPECTED:.*sem um token válido/);
    });

    it("gives up on a server that never answers", async () => {
        if (!certs) return;
        const silent = https.createServer({ key: certs.server.key, cert: certs.server.cert, ca: certs.ca, requestCert: true }, () => { /* never answers */ });
        await new Promise<void>(resolve => silent.listen(0, "127.0.0.1", resolve));
        try {
            const err = await requestInterToken(creds("good"), INTER_REQUIRED_SCOPES, { ...opts(), baseUrl: `https://127.0.0.1:${(silent.address() as AddressInfo).port}`, timeoutMs: 300 }).catch(e => e);
            expect((err as InterError).code).toBe("TIMEOUT");
        } finally {
            silent.closeAllConnections();
            await new Promise<void>(resolve => silent.close(() => resolve()));
        }
    });
});
