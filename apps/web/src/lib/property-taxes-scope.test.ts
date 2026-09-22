import { describe, expect, it } from "vitest";
import { condominiumIptuByMonth, landlordIptuByMonth, landlordIptuForMonth, landlordTaxTotals, landlordTaxesByMonth, taxScopeForProperty, type PropertyTax } from "./property-taxes";

const tax = (year: number, kind: PropertyTax["kind"], amount: number, paid_on: string | null, over: Partial<PropertyTax> = {}): PropertyTax =>
    ({ id: `${year}-${kind}`, property_id: "p", year, kind, amount, paid_by: "LANDLORD", paid_on, comment: null, installments: [], ...over }) as PropertyTax;

// IPTU 2024 paid in Feb/2024; IPTU 2025 in two parcelas (Feb and Mar 2025); IPTU 2026 paid in Jan/2026; ITBI paid in 2025
const taxes: PropertyTax[] = [
    tax(2024, "IPTU", 1200, "2024-02-10"),
    tax(2025, "IPTU", 1300, null, { installments: [{ amount: 650, paid_by: "LANDLORD", paid_on: "2025-02-10" }, { amount: 650, paid_by: "LANDLORD", paid_on: "2025-03-10" }] as PropertyTax["installments"] }),
    tax(2026, "IPTU", 1400, "2026-01-15"),
    tax(2025, "ITBI", 9000, "2025-05-05"),
];

describe("IPTU of a multi-unit property: the condominium's from 2025 on", () => {
    const multi = taxScopeForProperty(true), single = taxScopeForProperty(false);

    it("the property keeps the IPTU paid before 2025 and every other tax", () => {
        expect([...landlordIptuByMonth(taxes, multi)]).toEqual([["2024-02", 1200]]);
        expect([...landlordTaxesByMonth(taxes, undefined, multi)]).toEqual([["2024-02", 1200], ["2025-05", 9000]]);
        expect(landlordIptuForMonth(taxes, "2026-01", multi)).toBe(0);
        expect(landlordIptuForMonth(taxes, "2024-02", multi)).toBe(1200);
        expect(landlordTaxTotals(taxes, multi)).toEqual({ iptu: 1200, itbi: 9000, other: 0, total: 10200 });
    });

    it("the condominium takes the IPTU paid from 2025 on, parcela by parcela", () => {
        expect([...condominiumIptuByMonth(taxes)]).toEqual([["2025-02", 650], ["2025-03", 650], ["2026-01", 1400]]);
    });

    it("a single-family property counts all of it, as before", () => {
        expect([...landlordIptuByMonth(taxes, single)].map(([m]) => m)).toEqual(["2024-02", "2025-02", "2025-03", "2026-01"]);
        expect(landlordTaxTotals(taxes, single).iptu).toBe(3900);
        expect(landlordTaxTotals(taxes)).toEqual(landlordTaxTotals(taxes, single));
    });
});
