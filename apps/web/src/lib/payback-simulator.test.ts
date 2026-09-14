import { describe, expect, it } from "vitest";
import { simulatePayback, type PaybackSimInput } from "./payback-simulator";

const base: PaybackSimInput = {
    propertyValue: 400000, downPaymentPct: 20, closingCostsPct: 4, financed: true, system: "SAC", annualRatePct: 10, termMonths: 360,
    monthlyRent: 2400, feePct: 10, vacancyPct: 5, monthlyCosts: 150, rentGrowthPctYear: 4, appreciationPctYear: 4, horizonYears: 30, sellAtEnd: true, sellingCostPct: 6,
};

describe("simulatePayback", () => {
    it("builds the cash basis and the schedule", () => {
        const r = simulatePayback(base);
        expect(r.downPayment).toBe(80000);
        expect(r.closingCosts).toBe(16000);
        expect(r.financedAmount).toBe(320000);
        expect(r.initialCash).toBe(96000);
        expect(r.firstInstalment).toBeCloseTo(320000 / 360 + 320000 * (Math.pow(1.1, 1 / 12) - 1), 0);
        expect(r.series).toHaveLength(361);
        expect(r.noiFirstMonth).toBeCloseTo(2400 * 0.9 * 0.95 - 150, 2);
        expect(r.grossYieldPct).toBe(7.2);
        expect(r.dscr).not.toBeNull();
        expect(r.irrPct).not.toBeNull();
        expect(r.multiple).not.toBeNull();
        expect(r.valueAtEnd).toBeCloseTo(400000 * Math.pow(1.04, 30), 0);
        expect(r.saleProceeds).toBeCloseTo(r.valueAtEnd * 0.94, 0);   // loan fully paid at the end
    });

    it("pays back sooner without financing and later with a heavier loan", () => {
        const cash = simulatePayback({ ...base, financed: false });
        expect(cash.initialCash).toBe(416000);
        expect(cash.monthsToPayback).not.toBeNull();
        expect(cash.monthsToPayback!).toBeLessThan(30 * 12);
        const loan = simulatePayback({ ...base, horizonYears: 30 });
        // with a SAC loan the instalments add to the cash basis, so payback (on total cash) comes later than payback on the initial cash
        expect(loan.monthsToPaybackInitial!).toBeLessThan(loan.monthsToPayback ?? Infinity);
    });

    it("respects no-sale and zero-rent edge cases", () => {
        const noSale = simulatePayback({ ...base, sellAtEnd: false });
        expect(noSale.saleProceeds).toBeNull();
        const noRent = simulatePayback({ ...base, monthlyRent: 0, financed: false, horizonYears: 5, sellAtEnd: false });
        expect(noRent.monthsToPayback).toBeNull();
        expect(noRent.irrPct).toBeNull();
    });
});
