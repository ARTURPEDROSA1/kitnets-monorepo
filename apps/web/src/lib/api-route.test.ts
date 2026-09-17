import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requireProfile = vi.fn();
const rateLimit = vi.fn();
const captureException = vi.fn();

vi.mock("@/lib/api-auth", () => ({ requireProfile: () => requireProfile() }));
vi.mock("@/lib/rate-limit", () => ({
    rateLimit: (...args: unknown[]) => rateLimit(...args),
    rateLimitResponse: () => NextResponse.json({ error: "limited" }, { status: 429 }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

import { badRequest, fieldErrors, notFound, readJsonBody, withAuth } from "./api-route";

describe("readJsonBody", () => {
    const req = (body: string) => new Request("http://test/api/x", { method: "POST", body });

    it("returns a JSON object", async () => {
        expect(await readJsonBody(req('{"a":1}'))).toEqual({ a: 1 });
    });

    it("answers 400 for malformed JSON, arrays and primitives", async () => {
        for (const bad of ["not json", "[1,2]", "42"]) {
            await expect(readJsonBody(req(bad))).rejects.toMatchObject({ status: 400 });
        }
    });
});

const ctx = { userId: "user_1", profileId: "profile_1", supabase: {} as never };
const post = (body: unknown) =>
    new NextRequest("http://test/api/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
    requireProfile.mockReset().mockResolvedValue({ ctx });
    rateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 1, resetAt: 0 });
    captureException.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("withAuth", () => {
    it("passes the authenticated context and params to the handler", async () => {
        const handler = vi.fn(async ({ profileId, params }) => NextResponse.json({ profileId, id: params.id }));
        const route = withAuth<undefined, { id: string }>({}, handler);
        const res = await route(new NextRequest("http://test/api/x/42"), { params: Promise.resolve({ id: "42" }) });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ profileId: "profile_1", id: "42" });
    });

    it("returns requireProfile's response untouched when not signed in", async () => {
        requireProfile.mockResolvedValue({ response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) });
        const handler = vi.fn();
        const res = await withAuth({}, handler)(new NextRequest("http://test/api/x"));
        expect(res.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it("validates the body and answers 400 with field-keyed messages", async () => {
        const schema = z.object({ name: z.string({ required_error: "Nome é obrigatório." }).min(1, "Nome é obrigatório."), age: z.number().optional() });
        const handler = vi.fn();
        const res = await withAuth({ body: schema }, handler)(post({ age: "x" }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.errors.name).toBe("Nome é obrigatório.");
        expect(json.errors.age).toBeDefined();
        expect(handler).not.toHaveBeenCalled();
    });

    it("hands the parsed (transformed) body to the handler", async () => {
        const schema = z.object({ cpf: z.string().transform((v) => v.replace(/\D/g, "")) });
        const handler = vi.fn(async ({ body }) => NextResponse.json(body));
        const res = await withAuth({ body: schema }, handler)(post({ cpf: "123.456.789-09" }));
        expect(await res.json()).toEqual({ cpf: "12345678909" });
    });

    it("rejects a non-JSON body", async () => {
        const res = await withAuth({ body: z.object({}) }, vi.fn())(post("not json"));
        expect(res.status).toBe(400);
    });

    it("applies the per-user rate limit", async () => {
        rateLimit.mockResolvedValue({ ok: false, remaining: 0, resetAt: 0 });
        const res = await withAuth({ limit: { scope: "t", limit: 1, windowMs: 1000 } }, vi.fn())(new NextRequest("http://test/api/x"));
        expect(res.status).toBe(429);
        expect(rateLimit).toHaveBeenCalledWith("t:user_1", 1, 1000);
    });

    it("turns thrown HttpErrors into responses", async () => {
        const res = await withAuth({}, async () => { throw notFound("Inquilino não encontrado."); })(new NextRequest("http://test/api/x"));
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Inquilino não encontrado." });
        const res2 = await withAuth({}, async () => { throw badRequest({ cpf: "dup" }); })(new NextRequest("http://test/api/x"));
        expect(res2.status).toBe(400);
        expect(await res2.json()).toEqual({ errors: { cpf: "dup" } });
    });

    it("reports unexpected errors to Sentry and answers a generic 500", async () => {
        const res = await withAuth({ tag: "T" }, async () => { throw new Error("boom"); })(new NextRequest("http://test/api/x"));
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "Erro interno do servidor" });
        expect(captureException).toHaveBeenCalledTimes(1);
    });
});

describe("fieldErrors", () => {
    it("keeps the first message per field and puts root issues under _form", () => {
        const schema = z.object({ a: z.string().min(2, "curto").max(1, "longo") }).refine(() => false, { message: "root" });
        const result = schema.safeParse({ a: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = fieldErrors(result.error);
            expect(errors.a).toBe("curto");
            expect(errors._form).toBe("root");
        }
    });
});
