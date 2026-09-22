import { describe, expect, it } from "vitest";
import { buildCondominiumMonths, condominiumKpis, condoTotalCost, summarizeCondominium, type CondominiumCostRow } from "./condominium";
import type { PropertyIncomeRow } from "./property-income";

const income = (m: string, unit: string, condo: number, status: "CONFIRMED" | "EXPECTED" = "CONFIRMED"): PropertyIncomeRow => ({
    id: `${m}-${unit}`, property_id: "p", month: `${m}-01`, received_on: null, received_amount: 1000, energy_portion: 0,
    other_income: 0, other_expenses: 0, condo_amount: condo, unit_id: unit, unit_name: unit, iptu_amount: 0, agency_fee_pct: 10,
    status, source: "MANUAL", bank_reference: null, notes: null,
});
const cost = (m: string, over: Partial<CondominiumCostRow> = {}): CondominiumCostRow => ({
    id: m, property_id: "p", month: `${m}-01`, energy_cost: 0, internet_cost: 0, water_cost: 0, iptu_amount: 0, maintenance_cost: 0, notes: null, ...over,
});

describe("condominium months", () => {
    it("adds the units' condominium as the month's revenue and subtracts the month's costs", () => {
        const months = buildCondominiumMonths(
            [income("2026-09", "u1", 250), income("2026-09", "u2", 250), income("2026-09", "u3", 0), income("2026-08", "u1", 250)],
            [cost("2026-09", { internet_cost: 120.5, water_cost: 80, notes: "lâmpadas" })]
        );
        expect(months.map(m => m.month)).toEqual(["2026-09", "2026-08"]);
        expect(months[0]).toMatchObject({ revenue: 500, units: 2, totalCost: 200.5, result: 299.5, hasCosts: true, notes: "lâmpadas", expected: false });
        expect(months[1]).toMatchObject({ revenue: 250, units: 1, totalCost: 0, result: 250, hasCosts: false });
    });

    it("a month with rent but no condominium still gets a row (revenue 0); a vacant month without either does not", () => {
        const vacant: PropertyIncomeRow = { ...income("2026-06", "u1", 0), received_amount: 0 };
        const months = buildCondominiumMonths([income("2026-07", "u1", 0), vacant], []);
        expect(months.map(m => m.month)).toEqual(["2026-07"]);
        expect(months[0]).toMatchObject({ revenue: 0, units: 0, expected: false });
    });

    it("keeps a month that only has costs, and flags a month whose units are all still expected", () => {
        const months = buildCondominiumMonths([income("2026-10", "u1", 250, "EXPECTED")], [cost("2026-07", { maintenance_cost: 900 })]);
        expect(months.map(m => m.month)).toEqual(["2026-10", "2026-07"]);
        expect(months[0]).toMatchObject({ revenue: 250, expected: true });
        expect(months[1]).toMatchObject({ revenue: 0, units: 0, totalCost: 900, result: -900, expected: false });
        expect(condoTotalCost({ energy_cost: 1.1, internet_cost: 2.2 })).toBe(3.3);
    });

    it("energy and IPTU come from the bills and the taxes register, never from the cost row", () => {
        const months = buildCondominiumMonths(
            [income("2026-09", "u1", 300), income("2026-08", "u1", 300)],
            [cost("2026-09", { energy_cost: 999, iptu_amount: 999, water_cost: 40 })],   // stale typed values are ignored
            { energy: new Map([["2026-09", 180.4], ["2026-07", 150]]), iptu: new Map([["2026-08", 90]]) }
        );
        expect(months.map(m => m.month)).toEqual(["2026-09", "2026-08", "2026-07"]);
        expect(months[0]).toMatchObject({ energy_cost: 180.4, iptu_amount: 0, water_cost: 40, totalCost: 220.4, result: 79.6 });
        expect(months[1]).toMatchObject({ energy_cost: 0, iptu_amount: 90, totalCost: 90, result: 210 });
        expect(months[2]).toMatchObject({ revenue: 0, energy_cost: 150, hasCosts: false, expected: false });   // a bill alone makes the month
    });

    it("summarises revenue, costs by kind, result and margin", () => {
        const months = buildCondominiumMonths(
            [income("2026-09", "u1", 300), income("2026-08", "u1", 300)],
            [cost("2026-09", { maintenance_cost: 100, internet_cost: 50 }), cost("2026-08", { water_cost: 30 })]
        );
        const s = summarizeCondominium(months);
        expect(s).toMatchObject({ months: 2, revenue: 600, totalCost: 180, result: 420, marginPct: 70 });
        expect(s.byCost).toEqual({ energy_cost: 0, internet_cost: 50, water_cost: 30, iptu_amount: 0, maintenance_cost: 100 });
        expect(s.latest?.month).toBe("2026-09");
        expect(summarizeCondominium([]).marginPct).toBeNull();
    });

    it("card figures: the latest month and the current year to date", () => {
        const months = buildCondominiumMonths(
            [income("2026-09", "u1", 300), income("2026-01", "u1", 300), income("2025-12", "u1", 300)],
            [cost("2026-09", { water_cost: 100 }), cost("2025-12", { water_cost: 50 })]
        );
        const k = condominiumKpis(months, new Date(2026, 8, 21));
        expect(k.latest?.month).toBe("2026-09");
        expect(k.latest).toMatchObject({ revenue: 300, totalCost: 100, result: 200 });
        expect(k).toMatchObject({ months: 3, monthsWithCosts: 2, year: 2026 });
        expect(k.ytd).toEqual({ revenue: 600, totalCost: 100, result: 500, marginPct: 83.3, months: 2 });
        expect(condominiumKpis([], new Date(2026, 0, 1))).toMatchObject({ latest: null, months: 0, ytd: { revenue: 0, marginPct: null } });
    });
});
