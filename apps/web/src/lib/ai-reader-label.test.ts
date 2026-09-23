import { describe, expect, it } from "vitest";
import { readByFromJson, readerLabel } from "./ai-reader-label";

describe("readerLabel", () => {
    it("names the provider people know and keeps the model id for whoever checks the config", () => {
        expect(readerLabel({ provider: "gemini", model: "gemini-3.5-flash" })).toBe("Gemini (gemini-3.5-flash)");
        expect(readerLabel({ provider: "openai", model: "gpt-4o" })).toBe("OpenAI (gpt-4o)");
    });

    it("is null when nothing read the document", () => {
        expect(readerLabel(null)).toBeNull();
        expect(readerLabel(undefined)).toBeNull();
    });
});

describe("readByFromJson", () => {
    it("accepts what the routes return", () => {
        expect(readByFromJson({ provider: "gemini", model: "gemini-3.5-flash" })).toEqual({ provider: "gemini", model: "gemini-3.5-flash" });
    });

    it("refuses anything that is not a known provider with a model", () => {
        expect(readByFromJson(undefined)).toBeNull();
        expect(readByFromJson({ provider: "anthropic", model: "x" })).toBeNull();
        expect(readByFromJson({ provider: "gemini" })).toBeNull();
        expect(readByFromJson({ provider: "gemini", model: "" })).toBeNull();
        expect(readByFromJson("gemini")).toBeNull();
    });
});
