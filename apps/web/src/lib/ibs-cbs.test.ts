import { describe, expect, it } from "vitest";
import { IBS_CBS, nominalRatesForYear, rentalEffectiveRate } from "./ibs-cbs";

describe("nominalRatesForYear", () => {
    it("2026 is the test year: 0.9 + 0.1 with PIS/COFINS still in force", () => {
        expect(nominalRatesForYear(2026)).toMatchObject({ cbs: 0.9, ibs: 0.1, pis: 0.65, cofins: 3, testYear: true });
    });

    it("2027-2028: CBS full minus 0.1 pp, IBS 0.1, no PIS/COFINS", () => {
        const r27 = nominalRatesForYear(2027);
        expect(r27.cbs).toBeCloseTo(8.7, 6);
        expect(r27).toMatchObject({ ibs: 0.1, pis: 0, cofins: 0, testYear: false });
        expect(nominalRatesForYear(2028).cbs).toBeCloseTo(8.7, 6);
    });

    it("2029-2032: IBS phases in at 10/20/30/40%", () => {
        expect(nominalRatesForYear(2029).ibs).toBeCloseTo(1.92, 6);
        expect(nominalRatesForYear(2030).ibs).toBeCloseTo(3.84, 6);
        expect(nominalRatesForYear(2032).ibs).toBeCloseTo(7.68, 6);
        expect(nominalRatesForYear(2029).cbs).toBeCloseTo(8.8, 6);
    });

    it("2033 onward: full rates, and the split scales with a different total", () => {
        expect(nominalRatesForYear(2033)).toMatchObject({ cbs: 8.8, ibs: 19.2 });
        const r = nominalRatesForYear(2035, 26.5);
        expect(r.cbs + r.ibs).toBeCloseTo(26.5, 6);
    });
});

describe("rentalEffectiveRate", () => {
    it("applies the 70% reduction: 28% becomes 8.4%", () => {
        expect(rentalEffectiveRate(nominalRatesForYear(2033))).toBeCloseTo(0.084, 6);
        expect(IBS_CBS.rentalRateReduction).toBe(0.7);
    });
});
