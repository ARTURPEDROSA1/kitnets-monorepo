import { describe, expect, it } from "vitest";
import { normalizeClassification, resolveKind } from "./new-investment-classify";

describe("image classification", () => {
    it("reads the model's answer, tolerating case and a confidence typed as text", () => {
        expect(normalizeClassification({ kind: "layout", confidence: "0,9", reason: "Planta baixa do studio" })).toEqual({
            kind: "LAYOUT", confidence: 0.9, reason: "Planta baixa do studio",
        });
        expect(normalizeClassification({ kind: "PHOTO", confidence: 1.7 })).toEqual({ kind: "PHOTO", confidence: 1, reason: null });
        expect(normalizeClassification({ kind: "PHOTO" })).toEqual({ kind: "PHOTO", confidence: 0, reason: null });
    });

    it("refuses anything that is not one of the sections", () => {
        expect(normalizeClassification({ kind: "CONTRACT", confidence: 0.99 })).toBeNull();
        expect(normalizeClassification({ kind: "RECEIPT", confidence: 0.99 })).toBeNull();
        expect(normalizeClassification("LAYOUT")).toBeNull();
        expect(normalizeClassification(null)).toBeNull();
    });

    it("moves the file only when the model is sure of a different section", () => {
        expect(resolveKind("PHOTO", { kind: "LAYOUT", confidence: 0.92, reason: null })).toBe("LAYOUT");
        expect(resolveKind("PHOTO", { kind: "LAYOUT", confidence: 0.5, reason: null })).toBe("PHOTO");
        expect(resolveKind("PHOTO", { kind: "PHOTO", confidence: 0.3, reason: null })).toBe("PHOTO");
        expect(resolveKind("LAYOUT", null)).toBe("LAYOUT");
    });
});
