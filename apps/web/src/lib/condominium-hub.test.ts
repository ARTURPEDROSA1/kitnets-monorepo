import { describe, expect, it } from "vitest";
import { condoAttention, condoHubTotals, condoRows, inCondoView, monthLabel } from "./condominium-hub";
import type { Condominium, CondominiumMonth } from "./condominium";

const month = (m: string, over: Partial<CondominiumMonth> = {}): CondominiumMonth => ({
    month: m, revenue: 1000, units: 4, expected: false, energy_cost: 300, internet_cost: 100, water_cost: 0, iptu_amount: 0, maintenance_cost: 0,
    totalCost: 400, result: 600, hasCosts: true, notes: null, ...over,
});

function condo(over: Partial<Condominium> = {}, kpis: Partial<Condominium["kpis"]> = {}): Condominium {
    return {
        id: "c1", property_id: "p1", name: "Condomínio Santo Antônio", notes: null, solar_payback_from_result: true,
        property_name: "Santo Antônio", property_address: "Rua das Flores, 10, Nova Lima, MG", units: 4,
        photos: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        kpis: {
            latest: month("2026-09"), months: 9, monthsWithCosts: 8, year: 2026,
            ytd: { revenue: 9000, totalCost: 3600, result: 5400, marginPct: 60, months: 9 },
            ytdMonthsWithoutCosts: 1, ytdNegativeMonths: 0,
            ...kpis,
        },
        ...over,
    };
}

describe("condoRows / totals", () => {
    it("reads the card figures and adds them up", () => {
        const rows = condoRows([condo(), condo({ id: "c2", name: "Condomínio Brasil", property_name: "Av. Brasil 1200", units: 6, solar_payback_from_result: false, photos: [] }, { latest: month("2026-09", { revenue: 900, totalCost: 1200, result: -300 }), ytd: { revenue: 8100, totalCost: 9000, result: -900, marginPct: -11.1, months: 9 }, ytdMonthsWithoutCosts: 0, ytdNegativeMonths: 4 })]);
        expect(rows[0].haystack).toContain("santo antonio");
        expect(rows[0].monthsWithoutCosts).toBe(1);
        const t = condoHubTotals(rows);
        expect(t).toMatchObject({ condos: 2, units: 10, revenueLatest: 1900, costLatest: 1600, resultLatest: 300, year: 2026, revenueYtd: 17100, costYtd: 12600, resultYtd: 4500, monthsWithoutCosts: 1, negativeCondos: 1, solarPayback: 1, withPhotos: 1 });
        expect(t.marginYtd).toBeCloseTo(26.3, 1);
        expect(monthLabel("2026-09")).toBe("set/2026");
    });
});

describe("condoAttention", () => {
    it("lists the problems worst first", () => {
        const rows = condoRows([
            condo({ id: "c2", name: "Vermelho" }, { latest: month("2026-09", { revenue: 900, totalCost: 1200, result: -300 }), ytd: { revenue: 8100, totalCost: 9000, result: -900, marginPct: -11.1, months: 9 }, ytdMonthsWithoutCosts: 0, ytdNegativeMonths: 4 }),
            condo({ id: "c3", name: "Sem custos" }),
            condo({ id: "c4", name: "Sem receita" }, { latest: month("2026-09", { revenue: 0, units: 0, totalCost: 250, result: -250 }), ytdMonthsWithoutCosts: 0 }),
            condo({ id: "c5", name: "Previsto" }, { latest: month("2026-10", { expected: true }), ytdMonthsWithoutCosts: 0 }),
            condo({ id: "c6", name: "Vazio", units: 3 }, { latest: null, months: 0, monthsWithCosts: 0, ytd: { revenue: 0, totalCost: 0, result: 0, marginPct: null, months: 0 }, ytdMonthsWithoutCosts: 0, ytdNegativeMonths: 0 }),
        ]);
        const items = condoAttention(rows);
        expect(items.map(i => `${i.row.condo.name}:${i.kind}`)).toEqual([
            "Vermelho:latest_negative", "Sem receita:latest_negative", "Vermelho:ytd_negative", "Sem custos:costs_missing", "Sem receita:no_revenue", "Previsto:expected_only", "Vazio:no_months",
        ]);
        expect(items[0].text).toContain("set/2026 fechou no vermelho");
    });
    it("filters by the year's result", () => {
        const rows = condoRows([condo(), condo({ id: "c2" }, { ytd: { revenue: 100, totalCost: 200, result: -100, marginPct: -100, months: 2 } })]);
        expect(rows.filter(r => inCondoView(r.ytdResult, "positivo")).length).toBe(1);
        expect(rows.filter(r => inCondoView(r.ytdResult, "negativo")).length).toBe(1);
        expect(rows.filter(r => inCondoView(r.ytdResult, "todos")).length).toBe(2);
    });
});
