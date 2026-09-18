import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }));

import { AI_MODELS, isModelUnavailable, reportAiFallback } from "./ai-models";

beforeEach(() => captureMessage.mockReset());

describe("AI_MODELS", () => {
    it("does not default to a retired Gemini model", () => {
        expect(AI_MODELS.gemini).not.toMatch(/gemini-(1\.5|2\.0|2\.5)-flash/);
    });
});

describe("isModelUnavailable", () => {
    it("recognises the provider's retirement messages", () => {
        expect(isModelUnavailable(new Error("[404 Not Found] models/gemini-1.5-flash is not found for API version v1beta"))).toBe(true);
        expect(isModelUnavailable(new Error("This model models/gemini-2.5-flash is no longer available to new users."))).toBe(true);
    });

    it("treats overload and quota errors as transient", () => {
        expect(isModelUnavailable(new Error("[503 Service Unavailable] This model is currently experiencing high demand."))).toBe(false);
        expect(isModelUnavailable(new Error("[429 Too Many Requests] quota exceeded"))).toBe(false);
        expect(isModelUnavailable(undefined)).toBe(false);
    });
});

describe("reportAiFallback", () => {
    it("raises an error-level report when the model is gone", () => {
        reportAiFallback("extract-bill", new Error("404 not found"));
        expect(captureMessage).toHaveBeenCalledTimes(1);
        const [message, ctx] = captureMessage.mock.calls[0];
        expect(message).toContain("unavailable");
        expect(ctx.level).toBe("error");
        expect(ctx.tags.route).toBe("extract-bill");
    });

    it("raises a warning for a transient failure", () => {
        reportAiFallback("Identity", "503 high demand");
        const [message, ctx] = captureMessage.mock.calls[0];
        expect(message).toContain("fell back to OpenAI: Identity");
        expect(ctx.level).toBe("warning");
    });
});
