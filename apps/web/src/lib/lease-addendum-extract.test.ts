import { describe, expect, it } from "vitest";
import { isEmptyAddendum, normalizeAddendumExtraction } from "./lease-addendum-extract";

describe("normalizeAddendumExtraction", () => {
    it("keeps what a model answered in the asked format", () => {
        const e = normalizeAddendumExtraction({
            is_addendum: true, effective_date: "2026-08-29", signed_date: "2026-08-20", new_rent: 1950, previous_rent: 1900, new_condominium: null,
            index: "IVAR", percent: 2.63, new_end_date: null, summary: "Reajuste negociado abaixo do índice.", confidence: 0.92,
        });
        expect(e).toEqual({
            is_addendum: true, effective_date: "2026-08-29", signed_date: "2026-08-20", new_rent: 1950, previous_rent: 1900, new_condominium: null,
            index: "IVAR", percent: 2.63, new_end_date: null, summary: "Reajuste negociado abaixo do índice.", confidence: 0.92,
        });
        expect(isEmptyAddendum(e)).toBe(false);
    });
    it("reads Brazilian dates, amounts and index names", () => {
        const e = normalizeAddendumExtraction({ effective_date: "29/08/2026", new_rent: "R$ 1.950,00", new_condominium: "420,5", index: "igp-m", percent: "4,83%", confidence: 3 });
        expect(e).toMatchObject({ effective_date: "2026-08-29", new_rent: 1950, new_condominium: 420.5, index: "IGP_M", percent: 4.83, confidence: 1 });
    });
    it("drops impossible dates, zero or negative amounts and unknown indexes", () => {
        const e = normalizeAddendumExtraction({ effective_date: "2026-02-30", signed_date: "amanhã", new_rent: 0, previous_rent: -5, index: "DOLAR", percent: "x" });
        expect(e).toMatchObject({ effective_date: null, signed_date: null, new_rent: null, previous_rent: null, index: null, percent: null });
        expect(normalizeAddendumExtraction({ index: "NONE" }).index).toBeNull();
    });
    it("says when the file is not an addendum or names no new rent", () => {
        expect(isEmptyAddendum(normalizeAddendumExtraction({ is_addendum: false, new_rent: 1950 }))).toBe(true);
        expect(isEmptyAddendum(normalizeAddendumExtraction({ is_addendum: true, effective_date: "2026-08-29" }))).toBe(true);
        expect(isEmptyAddendum(normalizeAddendumExtraction(null))).toBe(true);
        expect(isEmptyAddendum(normalizeAddendumExtraction("texto"))).toBe(true);
    });
});
