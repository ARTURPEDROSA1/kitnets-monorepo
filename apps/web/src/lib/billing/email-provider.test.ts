import { describe, expect, it, vi } from "vitest";
import { EmailError, emailAvailable, sendEmail, type EmailMessage } from "./email-provider";

const message = (over: Partial<EmailMessage> = {}): EmailMessage => ({
    from: "Holding via Kitnets <faturas@kitnets.com>",
    to: "ana@example.com",
    replyTo: "dono@example.com",
    subject: "Fatura nº 12",
    text: "texto",
    html: "<p>html</p>",
    attachments: [{ filename: "boleto.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" }],
    idempotencyKey: "delivery-1",
    ...over,
});

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("emailAvailable", () => {
    it("needs the key and the sender", () => {
        expect(emailAvailable({ RESEND_API_KEY: "re_x", BILLING_EMAIL_FROM: "Kitnets <f@kitnets.com>" })).toBe(true);
        expect(emailAvailable({ RESEND_API_KEY: "re_x" })).toBe(false);
        expect(emailAvailable({ BILLING_EMAIL_FROM: "f@kitnets.com" })).toBe(false);
        expect(emailAvailable({})).toBe(false);
    });
});

describe("sendEmail", () => {
    it("posts the message to Resend with the delivery as idempotency key and returns the id", async () => {
        const fetchImpl = respond(200, { id: "msg_123" });
        const id = await sendEmail(message(), { apiKey: "re_test", fetchImpl });
        expect(id).toBe("msg_123");
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.resend.com/emails");
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer re_test");
        expect(headers["Idempotency-Key"]).toBe("delivery-1");
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({ from: "Holding via Kitnets <faturas@kitnets.com>", to: ["ana@example.com"], reply_to: "dono@example.com", subject: "Fatura nº 12" });
        expect(body.attachments).toEqual([{ filename: "boleto.pdf", content: Buffer.from("%PDF-1.4").toString("base64"), content_type: "application/pdf" }]);
    });

    it("omits what is not there", async () => {
        const fetchImpl = respond(200, { id: "msg_1" });
        await sendEmail(message({ replyTo: null, attachments: [] }), { apiKey: "k", fetchImpl });
        const body = JSON.parse(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
        expect(body).not.toHaveProperty("reply_to");
        expect(body).not.toHaveProperty("attachments");
    });

    it("a refusal is permanent, a 429 or 5xx is not", async () => {
        await expect(sendEmail(message(), { apiKey: "k", fetchImpl: respond(422, { message: "Invalid `to` field" }) })).rejects.toMatchObject({ permanent: true, status: 422, message: "O serviço de e-mail recusou a mensagem: Invalid `to` field" });
        await expect(sendEmail(message(), { apiKey: "k", fetchImpl: respond(429, { message: "Too many requests" }) })).rejects.toMatchObject({ permanent: false, status: 429 });
        await expect(sendEmail(message(), { apiKey: "k", fetchImpl: respond(500, {}) })).rejects.toMatchObject({ permanent: false, status: 500, message: "O serviço de e-mail recusou a mensagem: HTTP 500" });
    });

    it("without a key nothing is sent", async () => {
        const fetchImpl = respond(200, { id: "never" });
        await expect(sendEmail(message(), { apiKey: "", fetchImpl })).rejects.toBeInstanceOf(EmailError);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("a network failure is retryable", async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
        await expect(sendEmail(message(), { apiKey: "k", fetchImpl })).rejects.toMatchObject({ permanent: false, message: "Não foi possível falar com o serviço de e-mail (falha de rede)." });
    });

    it("an answer without an id is an error", async () => {
        await expect(sendEmail(message(), { apiKey: "k", fetchImpl: respond(200, {}) })).rejects.toMatchObject({ permanent: false });
    });
});
