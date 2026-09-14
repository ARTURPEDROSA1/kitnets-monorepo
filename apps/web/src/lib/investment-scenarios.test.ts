import { describe, expect, it } from "vitest";
import { computeInvestmentMetrics } from "./investment-metrics";
import { projectScenario } from "./investment-scenarios";
import type { PropertyIncomeRow } from "./property-income";
import type { PropertyInvestment, PropertyTransaction } from "./property-investment";

const tx = (occurred_on: string, kind: PropertyTransaction["kind"], amount: number, extra: Partial<PropertyTransaction> = {}): PropertyTransaction => ({
    id: `${occurred_on}-${kind}-${amount}`, property_id: "p", occurred_on, kind, amount,
    interest_part: null, principal_part: null, insurance_part: null, comment: null, source: "MANUAL", bank_reference: null, ...extra,
});
const income = (m: string): PropertyIncomeRow => ({
    id: m, property_id: "p", month: `${m}-01`, received_on: null, received_amount: 3950, energy_portion: 350,
    other_income: 100, other_expenses: 0, iptu_amount: 0, agency_fee_pct: 10, status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null,
});
const months = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
    const [y, m] = from.split("-").map(Number);
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});
const investment = (over: Partial<PropertyInvestment> = {}): PropertyInvestment => ({
    property_id: "p", purchase_price: 100000, acquired_on: "2025-01-10", built_area_m2: null, lender: null, contract_number: null,
    financing_system: null, principal: null, annual_rate: null, term_months: null, contract_date: null, first_due_date: null,
    financing_status: "PAID_OFF", paid_off_on: null, notes: null, ...over,
});

const base = (inv = investment(), txs = [tx("2025-01-10", "ENTRADA", 100000)]) =>
    computeInvestmentMetrics({ investment: inv, transactions: txs, incomeRows: months("2026-02", 8).map(income), asOf: "2026-09", marketValue: { amount: 120000, valuedOn: "2026-09-01", source: "MANUAL" } });

describe("projectScenario", () => {
    it("matches the engine forecast with neutral inputs and moves with rent growth and vacancy", () => {
        const m = base();
        const neutral = projectScenario({ metrics: m, investment: investment(), rentGrowthPctYear: 0, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 });
        expect(neutral.monthsToPayback).toBe(m.monthsToPayback);
        expect(neutral.paybackMonth).toBe(m.paybackForecastMonth);
        const faster = projectScenario({ metrics: m, investment: investment(), rentGrowthPctYear: 10, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 });
        expect(faster.monthsToPayback!).toBeLessThan(neutral.monthsToPayback!);
        const slower = projectScenario({ metrics: m, investment: investment(), rentGrowthPctYear: 0, vacancyPct: 20, prepayNow: 0, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 });
        expect(slower.monthsToPayback!).toBeGreaterThan(neutral.monthsToPayback!);
    });

    it("prices a sale: appreciation, selling costs and IRR", () => {
        const m = base();
        const s = projectScenario({ metrics: m, investment: investment(), rentGrowthPctYear: 0, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 5, saleYear: 3, sellingCostPct: 6 });
        expect(s.saleMonth).toBe("2029-09");
        expect(s.valueBaseSource).toBe("VALUATION");
        expect(s.saleValue).toBeCloseTo(120000 * Math.pow(1.05, 3), 0);
        expect(s.saleProceeds).toBeCloseTo(s.saleValue! * 0.94, 0);
        expect(s.noiUntilSale).toBeCloseTo(36 * 3850, 0);
        expect(s.irrAtSale).not.toBeNull();
        expect(s.irrAtSale!).toBeGreaterThan(0);
        expect(s.multipleAtSale!).toBeGreaterThan(1);
        expect(s.projection).toHaveLength(37);
    });

    it("simulates the remaining loan with a prepayment and reports the interest saved", () => {
        const inv = investment({ financing_status: "ACTIVE", financing_system: "SAC", principal: 80000, annual_rate: 10, term_months: 120 });
        const txs = [tx("2025-01-10", "ENTRADA", 20000), ...months("2025-02", 8).map(k => tx(`${k}-05`, "PRESTACAO", 1300, { principal_part: 666.67, interest_part: 600, insurance_part: 33.33 }))];
        const m = base(inv, txs);
        expect(m.remainingInstallments).toBe(112);
        expect(m.outstandingBalance).toBeCloseTo(80000 - 8 * 666.67, 0);
        const keep = projectScenario({ metrics: m, investment: inv, rentGrowthPctYear: 0, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 });
        const prepay = projectScenario({ metrics: m, investment: inv, rentGrowthPctYear: 0, vacancyPct: 0, prepayNow: 20000, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 });
        expect(keep.remainingInstalments).toBe(112);
        expect(prepay.remainingInstalments).toBeLessThan(112);
        expect(prepay.instalmentsSaved).toBe(112 - prepay.remainingInstalments);
        expect(prepay.interestSaved!).toBeGreaterThan(0);
        expect(prepay.projection[0].cumInvested).toBeCloseTo(m.cashInvested + 20000, 2);
    });
});
