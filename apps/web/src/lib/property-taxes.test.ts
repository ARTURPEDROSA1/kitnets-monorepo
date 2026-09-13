import { describe, expect, it } from "vitest";
import type { PropertyTransaction } from "./property-investment";
import {
    effectiveTax,
    iptuSeries,
    iptuYearsFromTransactions,
    normalizeInstallments,
    splitInstallments,
    summarizeTaxes,
    type PropertyTax,
    type TaxInstallment,
} from "./property-taxes";

const tax = (year: number, kind: PropertyTax["kind"], amount: number, paid_by: PropertyTax["paid_by"] = "TENANT", installments: TaxInstallment[] = []): PropertyTax =>
    ({ id: `${kind}-${year}-${amount}`, property_id: "p", year, kind, amount, paid_by, paid_on: null, comment: null, installments });

describe("splitInstallments", () => {
    it("splits equally and puts the rounding on the last parcela", () => {
        const parts = splitInstallments(913.04, 6, "TENANT");
        expect(parts).toHaveLength(6);
        expect(parts.map(p => p.amount)).toEqual([152.17, 152.17, 152.17, 152.17, 152.17, 152.19]);
        expect(parts.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(913.04, 2);
        expect(parts.every(p => p.paid_by === "TENANT" && p.paid_on === null)).toBe(true);
    });
    it("keeps payer and date of existing parcelas when re-spreading", () => {
        const existing: TaxInstallment[] = [{ seq: 1, amount: 100, paid_by: "LANDLORD", paid_on: "2026-02-10" }, { seq: 2, amount: 100, paid_by: "TENANT", paid_on: null }];
        const parts = splitInstallments(300, 2, "TENANT", existing);
        expect(parts[0]).toEqual({ seq: 1, amount: 150, paid_by: "LANDLORD", paid_on: "2026-02-10" });
        expect(parts[1]).toEqual({ seq: 2, amount: 150, paid_by: "TENANT", paid_on: null });
    });
    it("caps at six", () => {
        expect(splitInstallments(600, 12, "TENANT")).toHaveLength(6);
    });
});

describe("effectiveTax", () => {
    it("uses the row when there are no parcelas", () => {
        expect(effectiveTax(tax(2026, "IPTU", 913.04, "LANDLORD"))).toEqual({ amount: 913.04, byTenant: 0, byLandlord: 913.04, payer: "LANDLORD", installments: 0 });
    });
    it("sums parcelas and reports a mixed payer", () => {
        const parts: TaxInstallment[] = [
            { seq: 1, amount: 152.17, paid_by: "TENANT", paid_on: null },
            { seq: 2, amount: 152.17, paid_by: "LANDLORD", paid_on: null },   // vacancy month
            { seq: 3, amount: 152.17, paid_by: "TENANT", paid_on: null },
        ];
        const e = effectiveTax(tax(2026, "IPTU", 0, "TENANT", parts));
        expect(e.amount).toBeCloseTo(456.51, 2);
        expect(e.byTenant).toBeCloseTo(304.34, 2);
        expect(e.byLandlord).toBe(152.17);
        expect(e.payer).toBe("MIXED");
        expect(e.installments).toBe(3);
    });
});

describe("normalizeInstallments", () => {
    it("renumbers, clamps and sanitises", () => {
        const out = normalizeInstallments([
            { seq: 5, amount: -3, paid_by: "LANDLORD", paid_on: "bad" },
            { seq: 9, amount: "12.5" as unknown as number, paid_by: "x" as unknown as "TENANT", paid_on: "2026-03-01" },
        ]);
        expect(out).toEqual([
            { seq: 1, amount: 0, paid_by: "LANDLORD", paid_on: null },
            { seq: 2, amount: 12.5, paid_by: "TENANT", paid_on: "2026-03-01" },
        ]);
        expect(normalizeInstallments(undefined)).toEqual([]);
    });
});

describe("iptuSeries / summarizeTaxes", () => {
    const rows = [
        tax(2019, "IPTU", 661.63), tax(2020, "IPTU", 706.41), tax(2021, "IPTU", 744.93), tax(2022, "IPTU", 805.31),
        tax(2023, "IPTU", 808.76), tax(2024, "IPTU", 835.58), tax(2025, "IPTU", 878.77),
        tax(2026, "IPTU", 0, "TENANT", splitInstallments(913.04, 6, "TENANT").map(p => (p.seq === 4 ? { ...p, paid_by: "LANDLORD" as const } : p))),
        tax(2018, "ITBI", 7540), tax(2018, "OUTRO", 200),
    ];
    it("builds the yearly series with growth", () => {
        const s = iptuSeries(rows);
        expect(s.map(p => p.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
        expect(s[0].growthPct).toBeNull();
        expect(s[1].growthPct).toBeCloseTo(6.8, 1);
        expect(s[7].amount).toBeCloseTo(913.04, 2);
        expect(s[7].byLandlord).toBe(152.17);
        expect(s[7].growthPct).toBeCloseTo(3.9, 1);
    });
    it("totals by payer across parcelas and computes growth figures", () => {
        const s = summarizeTaxes(rows);
        expect(s.iptuYears).toBe(8);
        expect(s.iptuTotal).toBeCloseTo(6354.43, 2);
        expect(s.iptuByLandlord).toBe(152.17);
        expect(s.iptuByTenant).toBeCloseTo(6354.43 - 152.17, 2);
        expect(s.iptuLatest).toEqual({ year: 2026, amount: 913.04 });
        expect(s.iptuGrowthPct).toBeCloseTo(3.9, 1);
        expect(s.iptuCagrPct).toBeCloseTo(4.7, 1);
        expect(s.itbi).toBe(7540);
        expect(s.other).toBe(200);
        expect(s.total).toBeCloseTo(6354.43 + 7740, 2);
    });
    it("handles an empty register", () => {
        const s = summarizeTaxes([]);
        expect(s.iptuLatest).toBeNull();
        expect(s.iptuGrowthPct).toBeNull();
        expect(s.iptuCagrPct).toBeNull();
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
        expect(seeds[0]).toMatchObject({ year: 2022, kind: "IPTU", amount: 131.96, paid_by: "TENANT", paid_on: "2022-10-24", installments: [] });
        expect(seeds[1]).toMatchObject({ year: 2023, amount: 279.56, paid_on: "2023-07-24" });
    });
});
