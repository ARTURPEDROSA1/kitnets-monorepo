import { describe, expect, it } from "vitest";
import type { PropertyTransaction } from "./property-investment";
import { iptuYearsFromTransactions, summarizeTaxes, type PropertyTax } from "./property-taxes";

const tax = (year: number, kind: PropertyTax["kind"], amount: number, paid_by: PropertyTax["paid_by"] = "TENANT"): PropertyTax =>
    ({ id: `${kind}-${year}-${amount}`, property_id: "p", year, kind, amount, paid_by, paid_on: null, comment: null });

describe("summarizeTaxes", () => {
    it("totals IPTU by payer, ITBI and others", () => {
        const s = summarizeTaxes([
            tax(2019, "IPTU", 1100), tax(2020, "IPTU", 1180), tax(2023, "IPTU", 1677.36, "LANDLORD"),
            tax(2018, "ITBI", 7540), tax(2018, "OUTRO", 200),
        ]);
        expect(s.iptuTotal).toBeCloseTo(3957.36, 2);
        expect(s.iptuByTenant).toBe(2280);
        expect(s.iptuByLandlord).toBe(1677.36);
        expect(s.iptuYears).toBe(3);
        expect(s.iptuAvgPerYear).toBeCloseTo(1319.12, 2);
        expect(s.iptuLatest).toEqual({ year: 2023, amount: 1677.36 });
        expect(s.itbi).toBe(7540);
        expect(s.other).toBe(200);
        expect(s.total).toBeCloseTo(11697.36, 2);
        expect(s.firstYear).toBe(2018);
        expect(s.lastYear).toBe(2023);
    });
    it("handles an empty register", () => {
        const s = summarizeTaxes([]);
        expect(s.iptuLatest).toBeNull();
        expect(s.total).toBe(0);
    });
});

describe("iptuYearsFromTransactions", () => {
    const tx = (occurred_on: string, kind: PropertyTransaction["kind"], amount: number): PropertyTransaction =>
        ({ id: occurred_on + kind, property_id: "p", occurred_on, kind, amount, interest_part: null, principal_part: null, insurance_part: null, comment: null, source: "IMPORT", bank_reference: null });
    it("groups monthly IPTU rows into one row per year", () => {
        const seeds = iptuYearsFromTransactions([
            tx("2023-06-24", "IPTU", 139.78), tx("2023-07-24", "IPTU", 139.78), tx("2022-10-24", "IPTU", 131.96),
            tx("2023-07-24", "TARIFA", 33.63),
        ]);
        expect(seeds).toHaveLength(2);
        expect(seeds[0]).toMatchObject({ year: 2022, kind: "IPTU", amount: 131.96, paid_by: "TENANT", paid_on: "2022-10-24" });
        expect(seeds[1]).toMatchObject({ year: 2023, amount: 279.56, paid_on: "2023-07-24" });
    });
});
