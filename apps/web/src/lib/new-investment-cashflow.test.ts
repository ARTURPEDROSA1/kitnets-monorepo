import { describe, expect, it } from "vitest";
import { assumptionsOf, formatMonthLabel, rentAtMonth, simulateCashFlow, type CashFlowAssumptions } from "./new-investment-cashflow";
import type { InvestmentPayment, InvestmentSchedule, NewInvestment } from "./new-investments";

const investment = (over: Partial<NewInvestment> = {}): NewInvestment => ({
    id: "i1", name: "Sun Place", description: null, developer: null, unit_label: null, kind: "STUDIO",
    address: null, city: null, state: null, zip: null,
    total_price: 45900, down_payment: 4590, financed_amount: 41310,
    contract_date: "2026-07-01", keys_expected_on: "2029-09-20", keys_delivered_on: null,
    index_before_keys: "INCC", index_after_keys: "IGPM",
    estimated_rent: 1200, rent_start_on: null, rent_adjustment_pct: 5, rent_vacancy_pct: 0, rent_costs_pct: 0,
    status: "ACTIVE", promoted_property_id: null, promoted_at: null, cover_path: null, notes: null,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    ...over,
});

/** The garage-spot contract: 2 × 2.295 then 36 × 1.147,50. */
const schedules: InvestmentSchedule[] = [
    { id: "a", investment_id: "i1", label: "Entrada", kind: "ENTRADA", installments: 2, amount: 2295, first_due_on: "2026-08-31", periodicity: "MONTHLY", index_code: "NONE", position: 0 },
    { id: "b", investment_id: "i1", label: "Parcelas", kind: "PARCELA", installments: 36, amount: 1147.5, first_due_on: "2026-10-20", periodicity: "MONTHLY", index_code: "INCC", position: 1 },
];

const paid: InvestmentPayment = {
    id: "p1", investment_id: "i1", due_on: "2026-08-31", paid_on: "2026-08-31", kind: "ENTRADA",
    amount: 2295, correction_amount: 0, installment_number: null, status: "PAID",
    receipt_path: null, receipt_name: null, notes: null, source: "MANUAL",
    created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z",
};

const base = (over: Partial<CashFlowAssumptions> = {}): CashFlowAssumptions => ({
    monthlyRent: 1200, rentStart: "2029-10", rentAdjustmentPct: 5, vacancyPct: 0, costsPct: 0, horizonMonths: 120, ...over,
});

describe("rentAtMonth", () => {
    it("holds the rent flat inside a year and steps it up on the anniversary", () => {
        const a = base();
        expect(rentAtMonth(a, 0)).toBe(1200);
        expect(rentAtMonth(a, 11)).toBe(1200);
        expect(rentAtMonth(a, 12)).toBe(1260);
        expect(rentAtMonth(a, 24)).toBe(1323);
    });

    it("nets vacancy and costs out of the rent", () => {
        expect(rentAtMonth(base({ vacancyPct: 10, costsPct: 25 }), 0)).toBe(810);
    });

    it("is zero before the first rent and with no rent at all", () => {
        expect(rentAtMonth(base(), -1)).toBe(0);
        expect(rentAtMonth(base({ monthlyRent: 0 }), 5)).toBe(0);
    });
});

describe("simulateCashFlow", () => {
    it("splits what was paid from what is still forecast", () => {
        const result = simulateCashFlow(investment(), schedules, [paid], base());
        const august = result.points.find(p => p.month === "2026-08")!;
        const september = result.points.find(p => p.month === "2026-09")!;
        expect(august.outflowPaid).toBe(2295);
        expect(august.outflowForecast).toBe(0);
        expect(september.outflowPaid).toBe(0);
        expect(september.outflowForecast).toBe(2295);
    });

    it("totals the whole plan whether it is paid or not", () => {
        const result = simulateCashFlow(investment(), schedules, [paid], base());
        expect(result.totalOutflow).toBe(45900);
    });

    it("starts the rent in the month asked for and marks the keys", () => {
        const result = simulateCashFlow(investment(), schedules, [], base());
        expect(result.points.find(p => p.month === "2029-09")!.rent).toBe(0);
        expect(result.points.find(p => p.month === "2029-10")!.rent).toBe(1200);
        expect(result.keysMonth).toBe("2029-09");
        expect(result.points.find(p => p.keys)?.month).toBe("2029-09");
    });

    it("runs the cumulative line from the first outflow to break-even", () => {
        const result = simulateCashFlow(investment(), schedules, [], base());
        expect(result.points[0].month).toBe("2026-08");
        expect(result.points[0].cumulative).toBe(-2295);
        // 45.900 of instalments against a rent starting at 1.200 with 5 % a year: three full years
        // of rent reach 45.396, so the crossing is the first month of the fourth year.
        expect(result.breakEvenMonth).toBe("2032-10");
        expect(result.breakEvenMonths).toBe(36);
    });

    it("never breaks even inside a horizon too short for the rent to catch up", () => {
        const result = simulateCashFlow(investment(), schedules, [], base({ horizonMonths: 12 }));
        expect(result.breakEvenMonth).toBeNull();
    });

    it("has no points at all without a plan, a payment or a date", () => {
        const result = simulateCashFlow(investment({ keys_expected_on: null }), [], [], base({ rentStart: null }));
        expect(result.points).toEqual([]);
        expect(result.totalOutflow).toBe(0);
    });
});

describe("assumptionsOf", () => {
    it("reads the assumptions stored on the investment", () => {
        expect(assumptionsOf(investment({ rent_vacancy_pct: 8 }))).toMatchObject({
            monthlyRent: 1200,
            rentStart: "2029-10",
            rentAdjustmentPct: 5,
            vacancyPct: 8,
            horizonMonths: 120,
        });
    });
});

describe("formatMonthLabel", () => {
    it("writes the month the way a Brazilian chart axis does", () => {
        expect(formatMonthLabel("2026-08")).toBe("ago/26");
        expect(formatMonthLabel("2029-12")).toBe("dez/29");
    });
});
