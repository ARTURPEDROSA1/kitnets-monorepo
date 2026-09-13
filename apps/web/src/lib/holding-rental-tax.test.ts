import { describe, expect, it } from "vitest";
import { computeHoldingTaxes } from "./holding-rental-tax";
import { nominalRatesForYear } from "./ibs-cbs";

const uniform = (monthly: number) => Array(12).fill(monthly);

describe("computeHoldingTaxes", () => {
    it("presumed profit is 32% of GROSS revenue, not revenue net of PIS/COFINS", () => {
        const { months } = computeHoldingTaxes(uniform(10000), nominalRatesForYear(2026));
        const m = months[0];
        expect(m.presumedProfit).toBeCloseTo(3200, 6);
        expect(m.irpjBasic).toBeCloseTo(3200 * 0.15, 6);
        expect(m.csll).toBeCloseTo(3200 * 0.09, 6);
        // net revenue is reported but does not feed the base
        expect(m.netRevenue).toBeLessThan(10000);
    });

    it("2026: PIS 0,65% + COFINS 3% on gross, CBS/IBS at the reduced test rates", () => {
        const { months } = computeHoldingTaxes(uniform(10000), nominalRatesForYear(2026));
        const m = months[0];
        expect(m.pis).toBeCloseTo(65, 6);
        expect(m.cofins).toBeCloseTo(300, 6);
        expect(m.cbs).toBeCloseTo(10000 * 0.009 * 0.3, 6);
        expect(m.ibs).toBeCloseTo(10000 * 0.001 * 0.3, 6);
    });

    it("IRPJ additional is assessed on the quarter above R$ 60.000 of presumed profit", () => {
        // R$ 62.500/month → presumed 20.000/month → 60.000/quarter → no additional
        expect(computeHoldingTaxes(uniform(62500), nominalRatesForYear(2033)).totals.irpjAdditional).toBe(0);
        // R$ 100.000/month → presumed 32.000/month → 96.000/quarter → 36.000 × 10% × 4 quarters
        const { totals, months } = computeHoldingTaxes(uniform(100000), nominalRatesForYear(2033));
        expect(totals.irpjAdditional).toBeCloseTo(36000 * 0.10 * 4, 6);
        expect(months.reduce((s, m) => s + m.irpjAdditional, 0)).toBeCloseTo(totals.irpjAdditional, 6);
    });

    it("a single big month is offset by the rest of its quarter", () => {
        // Jan 150k, Feb 0, Mar 0 → presumed 48.000 in the quarter → under 60k → no additional,
        // whereas a monthly R$ 20k test would have charged (48.000 − 20.000) × 10%.
        const revenues = [150000, 0, 0, ...Array(9).fill(0)];
        expect(computeHoldingTaxes(revenues, nominalRatesForYear(2033)).totals.irpjAdditional).toBe(0);
    });

    it("monthly rows add up to the totals", () => {
        const { months, totals } = computeHoldingTaxes(uniform(30000), nominalRatesForYear(2030));
        const sum = months.reduce((s, m) => s + m.totalTax, 0);
        expect(sum).toBeCloseTo(totals.totalTax, 6);
        expect(totals.totalTax).toBeCloseTo(totals.totalIrpjCsll + totals.totalIva + totals.totalLegacy, 6);
    });
});
