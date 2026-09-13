import { describe, expect, it } from "vitest";
import { calculateRentalTax, RentalTaxInput } from "./rental-tax";

const large = (year: number, extra: Partial<RentalTaxInput> = {}): RentalTaxInput => ({
    numberOfProperties: 4,
    annualRentalRevenue: 300000,
    otherTaxableIncome: 0,
    dependents: 0,
    deductibleExpenses: 0,
    taxYear: year,
    referenceYear: year - 1,
    ...extra,
});

describe("calculateRentalTax", () => {
    it("small landlord: IRPF only, no IBS/CBS", () => {
        const r = calculateRentalTax(large(2033, { numberOfProperties: 2, annualRentalRevenue: 100000 }));
        expect(r.isLargeLandlord).toBe(false);
        expect(r.ibsCbsApplicable).toBe(false);
        expect(r.vatTaxDue).toBe(0);
        expect(r.totalTaxDue).toBe(r.irpfTaxDue);
    });

    it("2026 is the test year: IBS/CBS applicable but nothing due", () => {
        const r = calculateRentalTax(large(2026));
        expect(r.ibsCbsApplicable).toBe(true);
        expect(r.vatTestYear).toBe(true);
        expect(r.vatNominalRate).toBeCloseTo(0.01, 6);
        expect(r.vatRate).toBeCloseTo(0.003, 6);
        expect(r.vatTaxDue).toBe(0);
    });

    it("2033: 8.4% on revenue minus R$ 600/property/month", () => {
        const r = calculateRentalTax(large(2033));
        // 4 properties × 12 × 600 = 28.800 off the base
        expect(r.vatSocialReducer).toBe(28800);
        expect(r.vatBase).toBe(271200);
        expect(r.vatRate).toBeCloseTo(0.084, 6);
        expect(r.vatTaxDue).toBeCloseTo(271200 * 0.084, 2); // 22.780,80
        expect(r.vatTestYear).toBe(false);
    });

    it("2027: CBS 8.7% + IBS 0.1%, reduced 70%", () => {
        const r = calculateRentalTax(large(2027));
        expect(r.vatNominalRate).toBeCloseTo(0.088, 6);
        expect(r.vatRate).toBeCloseTo(0.0264, 6);
        expect(r.vatTaxDue).toBeCloseTo(271200 * 0.0264, 2);
    });

    it("commercial leases get no social reducer", () => {
        const r = calculateRentalTax(large(2033, { residential: false }));
        expect(r.vatSocialReducer).toBe(0);
        expect(r.vatBase).toBe(300000);
    });

    it("between R$ 240k and R$ 288k the tax starts next year", () => {
        const r = calculateRentalTax(large(2033, { annualRentalRevenue: 250000 }));
        expect(r.isLargeLandlord).toBe(true);
        expect(r.ibsCbsApplicable).toBe(false);
        expect(r.ibsCbsStartYear).toBe("2034");
    });

    it("IRPF uses the corrected annual rules (20% simplified discount, capped)", () => {
        const r = calculateRentalTax(large(2033));
        expect(r.irpfCalculation.simplifiedDiscountValue).toBe(16754.34);
        expect(r.irpfBase).toBeCloseTo(300000 - 16754.34, 2);
    });
});
