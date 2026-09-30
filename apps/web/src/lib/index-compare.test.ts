import { describe, expect, it } from "vitest";
import { COMPARE_COLORS, COMPARE_LABELS, compareCodesFor } from "./index-compare";

describe("compareCodesFor", () => {
    it("pairs each page with the two indexes to overlay", () => {
        expect(compareCodesFor("CDI")).toEqual(["SELIC", "IPCA"]);
        expect(compareCodesFor("SELIC")).toEqual(["CDI", "IPCA"]);
        expect(compareCodesFor("IGPM")).toEqual(["CDI", "IPCA"]);
        expect(compareCodesFor("ivar")).toEqual(["CDI", "IPCA"]);
        expect(compareCodesFor("FIPEZAP")).toEqual(["CDI", "IPCA"]);
    });

    it("never compares an index with itself, and leaves the salário mínimo alone", () => {
        expect(compareCodesFor("IPCA")).toEqual(["CDI", "IGPM"]);
        expect(compareCodesFor("REAJUSTE-SALARIO-MINIMO")).toEqual([]);
        for (const code of ["CDI", "SELIC", "IPCA", "IGPM", "INPC", "IVAR", "FIPEZAP"]) {
            expect(compareCodesFor(code)).not.toContain(code);
        }
    });

    it("has a label and a colour for every index it can name", () => {
        const named = new Set(["CDI", "SELIC", "IPCA", "IGPM", "INPC", "IVAR", "FIPEZAP"].flatMap(compareCodesFor));
        for (const code of named) {
            expect(COMPARE_LABELS[code], `label of ${code}`).toBeTruthy();
            expect(COMPARE_COLORS[code], `colour of ${code}`).toMatch(/^hsl\(var\(--index-chart-/);
        }
    });
});
