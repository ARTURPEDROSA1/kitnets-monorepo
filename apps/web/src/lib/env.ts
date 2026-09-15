import { z } from "zod";

/**
 * Environment variables, validated once and exported typed.
 *
 * - Imported by next.config.ts, so a production build on Vercel fails at
 *   build time when a variable is missing or malformed, instead of a user
 *   request failing at 2 a.m.
 * - Imported by instrumentation.ts, so a server started outside Vercel
 *   (`next start`) fails on boot for the same reasons.
 * - Strict only when VERCEL_ENV=production. Previews, local development,
 *   CI and unit tests validate the *format* of what is present but tolerate
 *   missing values, because features degrade gracefully there and the
 *   Preview environment in Vercel does not carry every secret.
 * - SKIP_ENV_VALIDATION=1 turns the whole thing off (emergency lever only).
 *
 * Keep apps/web/.env.example in sync with the two schemas below.
 */

const url = z.string().url();
const nonEmpty = z.string().min(1, "must not be empty");

/** Server-only. Never exposed to the browser. */
export const serverSchema = z.object({
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
    CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "must be a Clerk secret key (sk_test_… / sk_live_…)"),
    // Vercel sends Authorization: Bearer <CRON_SECRET>; the cron routes fail closed without it.
    CRON_SECRET: z.string().min(16, "use at least 16 random characters"),
    // Shared with apps/edge-gateway; authenticates POST /api/gateways/ingest.
    GATEWAY_INGEST_KEY: z.string().min(16, "use at least 16 random characters"),
    // AI extraction: at least one provider is required in production (refined below).
    GEMINI_API_KEY: nonEmpty.optional(),
    OPENAI_API_KEY: nonEmpty.optional(),
    // CPF enrichment; the feature is disabled when absent.
    BIGDATACORP_TOKEN: nonEmpty.optional(),
    // Source-map upload at build time only.
    SENTRY_ORG: nonEmpty.optional(),
    SENTRY_PROJECT: nonEmpty.optional(),
    SENTRY_AUTH_TOKEN: nonEmpty.optional(),
});

/** Inlined into the browser bundle: every key must start with NEXT_PUBLIC_. */
export const clientSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().regex(/^pk_(test|live)_/, "must be a Clerk publishable key (pk_test_… / pk_live_…)"),
    NEXT_PUBLIC_BASE_URL: url,
    NEXT_PUBLIC_SENTRY_DSN: url.optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/login/proprietario"),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/signup/proprietario"),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default("/dashboard"),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default("/dashboard"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;
export type Env = ServerEnv & ClientEnv;

export type EnvMode = "strict" | "lenient";

/** Vercel (and many CI systems) store an unset variable as "". Treat it as absent. */
function dropEmpty(raw: Record<string, string | undefined>): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = v === "" ? undefined : v;
    return out;
}

function formatIssues(issues: z.ZodIssue[]): string {
    return issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
}

/**
 * Validates a raw environment. Exported for tests; the app uses `env`.
 * In lenient mode required variables may be missing, but present values
 * must still have the right shape.
 */
export function parseEnv(
    raw: Record<string, string | undefined>,
    mode: EnvMode,
    scope: "server" | "client" = "server"
): Env {
    const input = dropEmpty(raw);
    const base = scope === "server" ? serverSchema.merge(clientSchema) : clientSchema;
    const schema = mode === "strict" ? base : base.partial();

    const result = schema.safeParse(input);
    const issues: z.ZodIssue[] = result.success ? [] : [...result.error.issues];

    if (mode === "strict" && scope === "server" && !input.GEMINI_API_KEY && !input.OPENAI_API_KEY) {
        issues.push({
            code: z.ZodIssueCode.custom,
            path: ["GEMINI_API_KEY"],
            message: "set GEMINI_API_KEY or OPENAI_API_KEY (AI extraction needs at least one provider)",
        });
    }

    if (issues.length > 0) {
        throw new Error(
            `Invalid environment variables (${mode} mode):\n${formatIssues(issues)}\n` +
            "See apps/web/.env.example. Production values live in Vercel → Project → Settings → Environment Variables."
        );
    }

    return (result.success ? result.data : {}) as Env;
}

export function currentMode(raw: Record<string, string | undefined> = process.env): EnvMode {
    return raw.VERCEL_ENV === "production" ? "strict" : "lenient";
}

// Client variables must be spelled out so Next.js can inline them into the
// browser bundle; process.env is not enumerable there.
const clientRuntime = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
};

const isServer = typeof window === "undefined";
const skip = process.env.SKIP_ENV_VALIDATION === "1" || process.env.SKIP_ENV_VALIDATION === "true";

const validated: Env = skip
    ? ({ ...clientRuntime, ...(isServer ? process.env : {}) } as unknown as Env)
    : isServer
        ? parseEnv({ ...process.env, ...clientRuntime }, currentMode(), "server")
        : parseEnv(clientRuntime, "lenient", "client");

/**
 * Typed, validated environment. Server-only keys throw when touched from the
 * browser, which turns an accidental leak into a loud error during development.
 */
export const env: Env = new Proxy(validated, {
    get(target, prop) {
        if (typeof prop !== "string") return undefined;
        if (!isServer && !prop.startsWith("NEXT_PUBLIC_")) {
            throw new Error(`env.${prop} is server-only and was accessed in the browser`);
        }
        return target[prop as keyof Env];
    },
});
