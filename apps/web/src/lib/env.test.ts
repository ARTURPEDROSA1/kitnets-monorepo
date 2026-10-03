import { describe, expect, it } from "vitest";
import { currentMode, halfConfiguredSets, parseEnv } from "./env";

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

    it("defaults the base URL to the production domain when unset", () => {
        const withoutBase = { ...complete, NEXT_PUBLIC_BASE_URL: undefined };
        expect(parseEnv(withoutBase, "strict").NEXT_PUBLIC_BASE_URL).toBe("https://kitnets.com");
    });

    it("lists every missing or malformed variable in one error", () => {
        const broken = { ...complete, SUPABASE_SERVICE_ROLE_KEY: "", NEXT_PUBLIC_BASE_URL: "kitnets.com", CRON_SECRET: "" };
        let message = "";
        try { parseEnv(broken, "strict"); } catch (e) { message = (e as Error).message; }
        expect(message).toContain("Invalid environment variables (strict mode)");
        expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(message).toContain("NEXT_PUBLIC_BASE_URL");
        expect(message).toContain("CRON_SECRET: Required");
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

describe("optional integrations that come in sets", () => {
    it("a half-configured set is pointed out, never fatal, in either mode", () => {
        const half = { ...complete, BILLING_EMAIL_FROM: "Kitnets <faturas@kitnets.com>" };
        expect(() => parseEnv(half, "lenient")).not.toThrow();
        expect(() => parseEnv(half, "strict")).not.toThrow();
        expect(halfConfiguredSets(half)).toEqual(["RESEND_API_KEY not set while BILLING_EMAIL_FROM is: invoices are not e-mailed until both are set"]);
        expect(halfConfiguredSets({ ...complete, STRIPE_SECRET_KEY: "sk_test_1", STRIPE_CLIENT_ID: "ca_1" })).toEqual(["STRIPE_WEBHOOK_SECRET not set while STRIPE_SECRET_KEY, STRIPE_CLIENT_ID are: the card payment stays off until all three are set"]);
        expect(halfConfiguredSets(complete)).toEqual([]);
        expect(halfConfiguredSets({ ...complete, RESEND_API_KEY: "re_1", BILLING_EMAIL_FROM: "f@kitnets.com", RESEND_WEBHOOK_SECRET: "whsec_abc=", STRIPE_SECRET_KEY: "sk_test_1", STRIPE_CLIENT_ID: "ca_1", STRIPE_WEBHOOK_SECRET: "whsec_1" })).toEqual([]);
        // the e-mail works without the webhook; only the tracking is off
        expect(halfConfiguredSets({ ...complete, RESEND_API_KEY: "re_1", BILLING_EMAIL_FROM: "f@kitnets.com" })).toEqual(["RESEND_WEBHOOK_SECRET not set while RESEND_API_KEY is: delivered / bounced is not tracked until both are set"]);
    });

    it("still refuses a value of the wrong shape", () => {
        expect(() => parseEnv({ ...complete, STRIPE_SECRET_KEY: "not-a-key" }, "lenient")).toThrow(/STRIPE_SECRET_KEY/);
        expect(() => parseEnv({ ...complete, BILLING_EMAIL_FROM: "not an address" }, "lenient")).toThrow(/BILLING_EMAIL_FROM/);
    });
});
