import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InterError, cancelInterCharge, createInterCharge, getInterCharge, getInterChargePdf, getInterWebhook, payInterChargeSandbox, putInterWebhook, requestInterToken, type InterSessionLike } from "./inter-client";
import { INTER_REQUIRED_SCOPES, type InterCredentials } from "./inter-credentials";
import { makeTestCertificates, type TestCertificates } from "./inter-test-certs";

/**
 * A server that plays the bank's token endpoint: mutual TLS with the test authority, and answers chosen
 * by the client id — the real bank's answers, as its documentation describes them.
 */
let certs: TestCertificates | null = null;
let server: https.Server | null = null;
let baseUrl = "";
const seen: Array<{ method: string; url: string; auth: string | null; account: string | null; body: string }> = [];
const webhook: string | null = "https://kitnets.com/api/webhooks/inter/abc";

beforeAll(async () => {
    certs = makeTestCertificates();
    if (!certs) return;
    server = https.createServer({ key: certs.server.key, cert: certs.server.cert, ca: certs.ca, requestCert: true, rejectUnauthorized: true }, (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            const answer = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
            seen.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization ?? null, account: (req.headers["x-conta-corrente"] as string | undefined) ?? null, body: raw });

            // the charges API wants the token
            if (req.url?.startsWith("/cobranca/v3/")) {
                if (req.headers.authorization !== "Bearer tok-123") return answer(401, { error: "invalid_token" });
                const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
                if (req.method === "POST" && req.url === "/cobranca/v3/cobrancas") {
                    if (Number(body.valorNominal) < 2.5) return answer(400, { title: "Dados inválidos.", detail: "Verifique os dados.", violacoes: [{ propriedade: "valorNominal", razao: "deve ser maior ou igual a 2.5" }] });
                    return answer(200, { codigoSolicitacao: "183e982a-34e5-4bc0-9643-def5432a" });
                }
                if (req.method === "GET" && req.url === "/cobranca/v3/cobrancas/183e982a-34e5-4bc0-9643-def5432a") {
                    return answer(200, { cobranca: { situacao: "A_RECEBER", dataVencimento: "2026-10-20" }, boleto: { nossoNumero: "123", codigoBarras: "0".repeat(44), linhaDigitavel: "1".repeat(47) }, pix: { txid: "tx", pixCopiaECola: "000201…" } });
                }
                if (req.method === "GET" && req.url === "/cobranca/v3/cobrancas/183e982a-34e5-4bc0-9643-def5432a/pdf") return answer(200, { pdf: Buffer.from("%PDF-1.4 fake").toString("base64") });
                if (req.method === "GET" && req.url?.startsWith("/cobranca/v3/cobrancas/missing")) return answer(404, { title: "Não Encontrado", detail: "Entidade não encontrada." });
                if (req.method === "POST" && req.url === "/cobranca/v3/cobrancas/183e982a-34e5-4bc0-9643-def5432a/cancelar") return answer(202, undefined);
                if (req.method === "POST" && req.url === "/cobranca/v3/cobrancas/183e982a-34e5-4bc0-9643-def5432a/pagar") return answer(204, undefined);
                if (req.method === "PUT" && req.url === "/cobranca/v3/cobrancas/webhook") return typeof body.webhookUrl === "string" && body.webhookUrl.startsWith("https://") ? answer(204, undefined) : answer(400, { detail: "webhookUrl inválida" });
                if (req.method === "GET" && req.url === "/cobranca/v3/cobrancas/webhook") return webhook ? answer(200, { webhookUrl: webhook }) : answer(404, { title: "Não Encontrado" });
                return answer(404, { message: "not here" });
            }

            const form = new URLSearchParams(raw);
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
const session = (token = "tok-123"): InterSessionLike => ({ credentials: creds("good"), environment: "PRODUCTION", accessToken: token });
const sessionWith = (account: string): InterSessionLike => ({ ...session(), credentials: { ...creds("good"), account } });

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

describe("the charges API", () => {
    const CODE = "183e982a-34e5-4bc0-9643-def5432a";

    it("issues a charge with the token and the account on the headers, and gets the bank's reference", async () => {
        if (!certs) return;
        seen.length = 0;
        const codigo = await createInterCharge(sessionWith("0012345"), { seuNumero: "F12", valorNominal: 1150.5 }, opts());
        expect(codigo).toBe(CODE);
        expect(seen[0]).toMatchObject({ method: "POST", url: "/cobranca/v3/cobrancas", auth: "Bearer tok-123", account: "12345" });
        expect(JSON.parse(seen[0].body)).toEqual({ seuNumero: "F12", valorNominal: 1150.5 });
    });

    it("reads a charge back, with its boleto and Pix, and the PDF as bytes", async () => {
        if (!certs) return;
        const json = await getInterCharge(session(), CODE, opts());
        expect((json.boleto as { linhaDigitavel: string }).linhaDigitavel).toBe("1".repeat(47));
        const pdf = await getInterChargePdf(session(), CODE, opts());
        expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    });

    it("cancels, pays in the sandbox and registers the webhook", async () => {
        if (!certs) return;
        await expect(cancelInterCharge(session(), CODE, "Cancelada pelo proprietario", opts())).resolves.toBeUndefined();
        await expect(payInterChargeSandbox(session(), CODE, "PIX", opts())).resolves.toBeUndefined();
        await expect(putInterWebhook(session(), "https://kitnets.com/api/webhooks/inter/abc", opts())).resolves.toBeUndefined();
        expect(await getInterWebhook(session(), opts())).toBe("https://kitnets.com/api/webhooks/inter/abc");
    });

    it("turns the bank's refusals into words: invalid data with its violations, unknown charge, refused token", async () => {
        if (!certs) return;
        const invalid = await createInterCharge(session(), { seuNumero: "F1", valorNominal: 1 }, opts()).catch(e => e as InterError);
        expect(invalid).toBeInstanceOf(InterError);
        expect((invalid as InterError).code).toBe("INVALID");
        expect((invalid as InterError).message).toMatch(/recusou os dados.*valorNominal: deve ser maior/);
        const missing = await getInterCharge(session(), "missing-1", opts()).catch(e => e as InterError);
        expect((missing as InterError).code).toBe("NOT_FOUND");
        const stale = await getInterCharge(session("tok-old"), CODE, opts()).catch(e => e as InterError);
        expect((stale as InterError).code).toBe("UNAUTHORIZED");
    });
});
