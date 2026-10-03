import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bounceReason, parseResendEvent, verifySvixSignature } from "./resend-webhook";

const key = Buffer.from("super-secret-key-for-tests-0123456789");
const secret = `whsec_${key.toString("base64")}`;
const body = JSON.stringify({ type: "email.delivered", created_at: "2026-10-10T11:00:20.000Z", data: { email_id: "56761188-7520-42d8-8898-ff6fc54ce618", to: ["ana@example.com"], subject: "Fatura nº 12" } });
const sign = (id: string, ts: number, k: Buffer = key, payload: string = body) => `v1,${createHmac("sha256", k).update(`${id}.${ts}.${payload}`).digest("base64")}`;
const NOW = 1_800_000_100_000;
const TS = 1_800_000_000;

describe("verifySvixSignature", () => {
    it("accepts a fresh, correctly signed payload", () => {
        expect(verifySvixSignature(body, { id: "msg_1", timestamp: String(TS), signature: sign("msg_1", TS) }, secret, NOW)).toBe(true);
        // a rotating secret sends two signatures
        expect(verifySvixSignature(body, { id: "msg_1", timestamp: String(TS), signature: `v1,AAAA ${sign("msg_1", TS)}` }, secret, NOW)).toBe(true);
    });

    it("refuses another key, a tampered body, another id, an old timestamp or missing headers", () => {
        const h = { id: "msg_1", timestamp: String(TS), signature: sign("msg_1", TS) };
        expect(verifySvixSignature(body, { ...h, signature: sign("msg_1", TS, Buffer.from("other")) }, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body + " ", h, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body, { ...h, id: "msg_2" }, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body, h, secret, NOW + 600_000)).toBe(false);
        expect(verifySvixSignature(body, { ...h, signature: null }, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body, { ...h, timestamp: "soon" }, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body, { ...h, signature: "v2,abc" }, secret, NOW)).toBe(false);
        expect(verifySvixSignature(body, h, "whsec_", NOW)).toBe(false);
    });
});

describe("parseResendEvent", () => {
    it("reads the message id and the time", () => {
        expect(parseResendEvent(JSON.parse(body))).toEqual({ type: "email.delivered", emailId: "56761188-7520-42d8-8898-ff6fc54ce618", createdAt: "2026-10-10T11:00:20.000Z", reason: null });
    });

    it("reads a bounce's reason", () => {
        const e = parseResendEvent({ type: "email.bounced", created_at: "2026-10-10T11:00:20.000Z", data: { email_id: "id-1", bounce: { message: "The recipient's email address does not exist", type: "Permanent", subType: "General" } } });
        expect(e).toMatchObject({ type: "email.bounced", reason: "The recipient's email address does not exist — Permanent/General" });
        expect(bounceReason(e!.reason)).toBe("o provedor do inquilino devolveu a mensagem: The recipient's email address does not exist — Permanent/General");
        expect(bounceReason(null)).toContain("endereço inexistente");
    });

    it("refuses what is not an e-mail event", () => {
        expect(parseResendEvent({ type: "email.delivered", data: {} })).toBeNull();
        expect(parseResendEvent({ data: { email_id: "x" } })).toBeNull();
        expect(parseResendEvent(null)).toBeNull();
    });
});
