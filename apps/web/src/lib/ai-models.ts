import * as Sentry from "@sentry/nextjs";

/**
 * The one place AI model names live.
 *
 * Providers retire models. `gemini-1.5-flash` and `gemini-2.0-flash` were
 * pinned in ten call sites after they had stopped existing, and
 * `gemini-2.5-flash`, although still listed by the API, answers 404 "no longer
 * available to new users" for this project's key. Every request therefore
 * failed over to the more expensive OpenAI path, silently.
 *
 * Verified on 2026-09-17 with this project's key (image input + JSON output):
 * `gemini-3.5-flash` works. `gemini-3.6-flash` (Google's suggested successor)
 * and `gemini-3.8-flash` answered 503 "high demand" and could not be verified.
 *
 * Change a default here, or override per environment without a code change:
 * GEMINI_MODEL, OPENAI_MODEL, OPENAI_MINI_MODEL.
 *
 * To see what a key can use (listing is not proof: make a test call too):
 *   curl -H "x-goog-api-key: $GEMINI_API_KEY" \
 *     "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200"
 */
export const AI_MODELS = {
    /** Vision + text, first choice for extraction (fast, cheap). */
    gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    /** Vision-capable fallback. */
    openai: process.env.OPENAI_MODEL || "gpt-4o",
    /** Text-only fallback and light generation. */
    openaiMini: process.env.OPENAI_MINI_MODEL || "gpt-4o-mini",
} as const;

/** True when the provider says the model itself is gone, as opposed to a transient failure. */
export function isModelUnavailable(err: unknown): boolean {
    const text = err instanceof Error ? err.message : String(err ?? "");
    return /\b404\b|not[ _]found|no longer available|is not supported for generateContent|deprecated/i.test(text);
}

/**
 * Call where a route gives up on Gemini and falls back to OpenAI. The fallback
 * keeps the feature working, which is why a retired model used to go unnoticed
 * for months; this makes it show up in Sentry: an error when the model no
 * longer exists, a warning for anything else (quota, overload, bad output).
 */
export function reportAiFallback(tag: string, err: unknown): void {
    const unavailable = isModelUnavailable(err);
    Sentry.captureMessage(
        unavailable
            ? `Gemini model "${AI_MODELS.gemini}" is unavailable; every call falls back to OpenAI (set GEMINI_MODEL or update lib/ai-models.ts)`
            : `Gemini failed, fell back to OpenAI: ${tag}`,
        {
            level: unavailable ? "error" : "warning",
            tags: { component: "ai-fallback", route: tag, model: AI_MODELS.gemini },
            extra: { error: err instanceof Error ? err.message : String(err) },
        }
    );
}
