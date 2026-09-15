import { describe, expect, it } from "vitest";
import { currentMode, parseEnv } from "./env";

const complete = {
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    CLERK_SECRET_KEY: "sk_live_abc",
    CRON_SECRET: "0123456789abcdef",
    GATEWAY_INGEST_KEY: "gateway-ingest-key-1",
    GEMINI_API_KEY: "gem",
    NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_abc",
    NEXT_PUBLIC_BASE_URL: "https://kitnets.com",
};

describe("parseEnv strict (production)", () => {
    it("accepts a complete environment and applies defaults", () => {
        const env = parseEnv(complete, "strict");
        expect(env.NEXT_PUBLIC_BASE_URL).toBe("https://kitnets.com");
        expect(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL).toBe("/login/proprietario");
        expect(env.OPENAI_API_KEY).toBeUndefined();
    });

    it("lists every missing or malformed variable in one error", () => {
        const broken = { ...complete, SUPABASE_SERVICE_ROLE_KEY: "", NEXT_PUBLIC_BASE_URL: "kitnets.com", CRON_SECRET: "short" };
        let message = "";
        try { parseEnv(broken, "strict"); } catch (e) { message = (e as Error).message; }
        expect(message).toContain("Invalid environment variables (strict mode)");
        expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(message).toContain("NEXT_PUBLIC_BASE_URL");
        expect(message).toContain("CRON_SECRET: use at least 16 random characters");
        expect(message).toContain(".env.example");
    });

    it("requires at least one AI provider key", () => {
        const noAi = { ...complete, GEMINI_API_KEY: undefined };
        expect(() => parseEnv(noAi, "strict")).toThrow(/GEMINI_API_KEY or OPENAI_API_KEY/);
        expect(() => parseEnv({ ...noAi, OPENAI_API_KEY: "oa" }, "strict")).not.toThrow();
    });

    it("rejects keys from the wrong Clerk environment shape", () => {
        expect(() => parseEnv({ ...complete, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_live_x" }, "strict")).toThrow(/publishable key/);
    });
});

describe("parseEnv lenient (dev, test, preview)", () => {
    it("tolerates missing values", () => {
        const env = parseEnv({ NEXT_PUBLIC_BASE_URL: "http://localhost:3000" }, "lenient");
        expect(env.NEXT_PUBLIC_BASE_URL).toBe("http://localhost:3000");
        expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    });

    it("still validates the shape of values that are present", () => {
        expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }, "lenient")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it("treats empty strings as absent", () => {
        expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "" }, "lenient")).not.toThrow();
    });
});

describe("currentMode", () => {
    it("is strict only for Vercel production", () => {
        expect(currentMode({ VERCEL_ENV: "production" })).toBe("strict");
        expect(currentMode({ VERCEL_ENV: "preview" })).toBe("lenient");
        expect(currentMode({ NODE_ENV: "production" })).toBe("lenient");
        expect(currentMode({})).toBe("lenient");
    });
});
