import { describe, expect, it } from "vitest";
import { annualizePct, assumptionsOf, formatMonthLabel, internalRateOfReturn, rentAtMonth, simulateCashFlow, type CashFlowAssumptions } from "./new-investment-cashflow";
import type { InvestmentPayment, InvestmentSchedule, NewInvestment } from "./new-investments";

const investment = (over: Partial<NewInvestment> = {}): NewInvestment => ({
    id: "i1", name: "Sun Place", description: null, developer: null, unit_label: null, kind: "STUDIO",
    address: null, city: null, state: null, zip: null,
    total_price: 45900, down_payment: 4590, financed_amount: 41310,
    contract_date: "2026-07-01", keys_expected_on: "2029-09-20", keys_delivered_on: null,
    index_before_keys: "INCC", index_after_keys: "IGPM",
    estimated_rent: 1200, rent_start_on: null, rent_adjustment_pct: 5, rent_vacancy_pct: 0, rent_costs_pct: 0, sim_horizon_months: 120,
    sim_delivery_costs_pct: 0, expected_appreciation_pct: null, strategy: "NA_PLANTA", exit_plan: "ALUGAR", sold_on: null, sale_price: null, sale_costs_pct: 0, area_m2: null, market_m2_price: null, estimated_value_at_delivery: null, construction_pct: null, construction_updated_on: null,
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
    receipt_path: null, receipt_name: null, payer: null, pj_amount: null, notes: null, source: "MANUAL",
    created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z",
};

const base = (over: Partial<CashFlowAssumptions> = {}): CashFlowAssumptions => ({
    monthlyRent: 1200, rentStart: "2029-10", rentAdjustmentPct: 5, vacancyPct: 0, costsPct: 0, horizonMonths: 120, deliveryCostsPct: 0, expectedAppreciationPct: null, ...over,
});

describe("a project meant to be sold", () => {
    it("brings the delivery value in once, in the keys month, with no rent, and pays back right there", () => {
        const result = simulateCashFlow(investment(), schedules, [paid], base({ saleAtDelivery: 70000 }));
        const keys = result.points.find(p => p.keys);
        expect(keys?.sale).toBe(70000);
        expect(result.points.filter(p => p.sale > 0)).toHaveLength(1);
        expect(result.totalSale).toBe(70000);
        expect(result.totalRent).toBe(0);
        expect(result.breakEvenMonth).toBe("2029-09");
        expect(result.breakEvenMonths).toBe(0);
        expect(result.irrAnnualPct).not.toBeNull();
        expect(result.irrAnnualPct!).toBeGreaterThan(0);
    });

    it("keeps the rent model when there is no sale value", () => {
        const result = simulateCashFlow(investment(), schedules, [paid], base({ saleAtDelivery: null }));
        expect(result.totalSale).toBe(0);
        expect(result.totalRent).toBeGreaterThan(0);
    });
});

describe("internalRateOfReturn", () => {
    it("finds the monthly rate that makes the flows worth zero, and annualizes it", () => {
        // 100 out today, 110 back after twelve months: 10% a year
        const flows = [-100, ...Array(11).fill(0), 110];
        const monthly = internalRateOfReturn(flows);
        expect(monthly).not.toBeNull();
        expect(annualizePct(monthly!)).toBeCloseTo(10, 1);
    });

    it("has no answer for a flow that only goes one way", () => {
        expect(internalRateOfReturn([-100, -50, -10])).toBeNull();
        expect(internalRateOfReturn([100, 50])).toBeNull();
        expect(internalRateOfReturn([])).toBeNull();
    });
});

describe("delivery costs and TIR in the simulation", () => {
    it("draws the handover costs — a % of the instalments — as one bar in the keys month and counts them in the total", () => {
        const withCosts = simulateCashFlow(investment(), schedules, [paid], base({ deliveryCostsPct: 20 }));
        const without = simulateCashFlow(investment(), schedules, [paid], base());
        // the plan is 2 × 2.295 + 36 × 1.147,50 = 45.900; 20% of it is 9.180
        const keys = withCosts.points.find(p => p.keys);
        expect(keys?.outflowDelivery).toBe(9180);
        expect(withCosts.points.filter(p => p.outflowDelivery > 0)).toHaveLength(1);
        expect(withCosts.totalDelivery).toBe(9180);
        expect(withCosts.totalOutflow).toBeCloseTo(without.totalOutflow + 9180, 2);
        // paying more at the keys pushes the payback later, never earlier
        expect(withCosts.breakEvenMonth! >= without.breakEvenMonth!).toBe(true);
    });

    it("gives a TIR when the rent pays the unit back inside the horizon, and none without rent", () => {
        const result = simulateCashFlow(investment(), schedules, [paid], base({ horizonMonths: 240 }));
        expect(result.irrAnnualPct).not.toBeNull();
        expect(result.irrAnnualPct!).toBeGreaterThan(0);
        expect(result.irrAnnualPct!).toBeLessThan(40);
        expect(simulateCashFlow(investment(), schedules, [paid], base({ monthlyRent: 0 })).irrAnnualPct).toBeNull();
    });
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

    it("keeps the horizon the owner chose — it used to snap back to ten years on every reload", () => {
        expect(assumptionsOf(investment({ sim_horizon_months: 240 })).horizonMonths).toBe(240);
    });

    it("falls back to ten years when the row has no horizon", () => {
        expect(assumptionsOf(investment({ sim_horizon_months: 0 })).horizonMonths).toBe(120);
    });
});

describe("formatMonthLabel", () => {
    it("writes the month the way a Brazilian chart axis does", () => {
        expect(formatMonthLabel("2026-08")).toBe("ago/26");
        expect(formatMonthLabel("2029-12")).toBe("dez/29");
    });
});
