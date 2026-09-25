import { describe, expect, it } from "vitest";
import { addMonths, energyAttention, energyHubTotals, energyRows, inEnergyView, monthLabel, monthsBetween, summarizeUnitBills, unitKind, type EnergyBillLike } from "./energy-hub";
import type { OwnerPropertySummary } from "./energy-properties-server";

const TODAY = "2026-09-25";

function bill(month: string, over: Partial<EnergyBillLike> = {}): EnergyBillLike {
    return { reference_month: month, reference_month_label: null, due_date: null, total_amount: 0, is_historical_only: true, grid_consumption_kwh: 100, billing_days: 30, ...over };
}

function unit(over: Partial<OwnerPropertySummary> = {}): OwnerPropertySummary {
    return {
        id: "u1", name: "Ed. Flores", address: "Rua das Flores, 10", city: "Nova Lima", state: "MG", zip: null, hasSolar: true, solarKwp: "5", billsCount: 3,
        consumerUnit: "3012345678", utilityCompany: "CEMIG", latestMonth: "2026-09", isStandaloneUc: false, isOrphaned: false, hasRentalListing: true, ucCategory: null, notes: null,
        latest: { month: "2026-09", label: "SET/2026", dueDate: "2026-10-02", total: 180, consumptionKwh: 320, dailyAvgKwh: 10.7, injectedKwh: 410, compensatedKwh: 300, balanceKwh: 1250, unitPrice: 0.95, availabilityAmount: 58, savingsAmount: 285, savingsEstimated: false, full: true },
        last12: { months: 12, consumptionKwh: 3400, paidAmount: 2100, savingsAmount: 3000, injectedKwh: 4800, avgConsumptionKwh: 283.3 },
        ...over,
    };
}

describe("month helpers", () => {
    it("adds and subtracts months across years", () => {
        expect(addMonths("2026-09", -11)).toBe("2025-10");
        expect(addMonths("2026-01", -1)).toBe("2025-12");
        expect(addMonths("2026-12", 1)).toBe("2027-01");
        expect(monthsBetween("2026-07", "2026-09")).toBe(2);
        expect(monthsBetween("2025-11", "2026-01")).toBe(2);
        expect(monthLabel("2026-09")).toBe("set/2026");
    });
});

describe("summarizeUnitBills", () => {
    it("takes the newest full bill and the twelve months up to it", () => {
        const bills: EnergyBillLike[] = [
            bill("2026-09", { is_historical_only: false, total_amount: 180, grid_consumption_kwh: 320, solar_injected_kwh: 410, solar_compensated_kwh: 300, generation_balance_kwh: 1250, energy_compensated_amount: -285, unit_price: 0.95, due_date: "2026-10-02T00:00:00Z", reference_month_label: "SET/2026" }),
            bill("2026-08", { is_historical_only: false, total_amount: 160, grid_consumption_kwh: 280, solar_injected_kwh: 390, solar_compensated_kwh: 250, energy_compensated_amount: -240 }),
            ...Array.from({ length: 12 }, (_, i) => bill(addMonths("2026-07", -i), { grid_consumption_kwh: 250 })),
        ];
        const { latest, last12 } = summarizeUnitBills(bills);
        expect(latest).toMatchObject({ month: "2026-09", label: "SET/2026", dueDate: "2026-10-02", total: 180, consumptionKwh: 320, injectedKwh: 410, balanceKwh: 1250, savingsAmount: 285, savingsEstimated: false, full: true });
        expect(latest?.dailyAvgKwh).toBeCloseTo(320 / 30, 3);
        expect(last12.months).toBe(12);
        expect(last12.consumptionKwh).toBe(320 + 280 + 250 * 10);
        expect(last12.paidAmount).toBe(340);
        expect(last12.savingsAmount).toBe(525);
        expect(last12.injectedKwh).toBe(800);
    });
    it("falls back to the newest history row and estimates savings from the tariff", () => {
        const { latest, last12 } = summarizeUnitBills([bill("2026-05", { grid_consumption_kwh: 200 }), bill("2026-06", { is_historical_only: false, total_amount: 90, grid_consumption_kwh: 150, solar_compensated_kwh: 100, unit_price: 0.9 })]);
        expect(latest).toMatchObject({ month: "2026-06", savingsAmount: 90, savingsEstimated: true, full: true });
        expect(last12.months).toBe(2);
        const historyOnly = summarizeUnitBills([bill("2026-03")]);
        expect(historyOnly.latest?.full).toBe(false);
        expect(summarizeUnitBills([]).latest).toBeNull();
    });
});

describe("energyRows", () => {
    it("classifies the unit, the due state and the staleness", () => {
        const r = energyRows([unit()], TODAY)[0];
        expect(r.kind).toBe("rental");
        expect(r.categoryKey).toBe("rental");
        expect(r.solarLabel).toBe("Solar · 5 kWp");
        expect(r.daysToDue).toBe(7);
        expect(r.dueState).toBe("due_soon");
        expect(r.monthsSinceLatest).toBe(0);
        expect(r.stale).toBe(false);
        expect(r.spike).toBe(false);
        expect(r.haystack).toContain("cemig");
        expect(r.haystack).toContain("3012345678");
    });
    it("flags an overdue bill, a stale unit and a spike", () => {
        const stale = energyRows([unit({ latest: { ...unit().latest!, month: "2026-06", dueDate: "2026-07-05", consumptionKwh: 500 } })], TODAY)[0];
        expect(stale.stale).toBe(true);
        expect(stale.dueState).toBe("ok"); // 82 days past: no longer shouted as overdue
        expect(stale.spike).toBe(true);
        const overdue = energyRows([unit({ latest: { ...unit().latest!, dueDate: "2026-09-20" } })], TODAY)[0];
        expect(overdue.dueState).toBe("overdue");
        expect(overdue.daysToDue).toBe(-5);
    });
    it("reads the category of standalone and orphaned units", () => {
        expect(unitKind({ isStandaloneUc: true, isOrphaned: false })).toBe("standalone");
        expect(unitKind({ isStandaloneUc: true, isOrphaned: true })).toBe("orphaned");
        const rows = energyRows([unit({ id: "u2", isStandaloneUc: true, ucCategory: "parente", solarKwp: null, latest: null, last12: undefined })], TODAY);
        expect(rows[0].categoryKey).toBe("parente");
        expect(rows[0].category.short).toBe("Parente");
        expect(rows[0].solarLabel).toBeNull();
        expect(rows[0].latest).toBeNull();
        expect(rows[0].last12.months).toBe(0);
    });
});

describe("energyHubTotals / energyAttention / views", () => {
    const rows = energyRows([
        unit(),
        unit({ id: "u2", name: "Casa própria", isStandaloneUc: true, ucCategory: "residencia_propria", solarKwp: null, latest: { ...unit().latest!, total: 90, consumptionKwh: 150, injectedKwh: 0, compensatedKwh: 0, balanceKwh: 0, savingsAmount: 0, dueDate: "2026-09-20" }, last12: { months: 6, consumptionKwh: 900, paidAmount: 540, savingsAmount: 0, injectedKwh: 0, avgConsumptionKwh: 150 } }),
        unit({ id: "u3", name: "Sem faturas", isStandaloneUc: true, isOrphaned: true, latest: null, last12: undefined, billsCount: 0 }),
    ], TODAY);
    it("adds the units up", () => {
        expect(energyHubTotals(rows)).toMatchObject({ units: 3, rental: 1, standalone: 1, orphaned: 1, withBills: 2, consumptionLatest: 470, billsLatest: 270, dueSoon: 1, overdue: 1, savingsLatest: 285, balanceKwh: 1250, unitsWithBalance: 1, injectedLatest: 410, solarUnits: 2, stale: 0 });
    });
    it("lists the problems worst first", () => {
        const items = energyAttention(rows);
        expect(items.map(i => i.kind)).toEqual(["overdue", "due_soon", "no_bills"]);
        expect(items[0].text).toContain("venceu em 20/09/2026");
        expect(items[1].text).toContain("vence em 7 dias");
    });
    it("filters by view", () => {
        expect(rows.filter(r => inEnergyView(r.kind, "aluguel")).length).toBe(1);
        expect(rows.filter(r => inEnergyView(r.kind, "avulsas")).length).toBe(2);
        expect(rows.filter(r => inEnergyView(r.kind, "todas")).length).toBe(3);
    });
});
