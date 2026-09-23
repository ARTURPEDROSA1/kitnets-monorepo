import { describe, expect, it } from "vitest";
import { computeInvestmentMetrics, rentStartMonth, toCardSummary } from "./new-investment-metrics";
import type { InvestmentPayment, InvestmentSchedule, NewInvestment } from "./new-investments";

/**
 * The studio of the contract: R$ 141.900 total, R$ 14.190 down in 2 × 7.095, then 36 × 3.547,50
 * from 20/10/2026, keys in 09/2029.
 */
const investment = (over: Partial<NewInvestment> = {}): NewInvestment => ({
    id: "i1",
    name: "Sun Place",
    description: null,
    developer: "Acácio SPE",
    unit_label: "Studio 204",
    kind: "STUDIO",
    address: null,
    city: "Itapema",
    state: "SC",
    zip: null,
    total_price: 141900,
    down_payment: 14190,
    financed_amount: 127710,
    contract_date: "2026-07-01",
    keys_expected_on: "2029-09-20",
    keys_delivered_on: null,
    index_before_keys: "INCC",
    index_after_keys: "IGPM",
    estimated_rent: null,
    rent_start_on: null,
    rent_adjustment_pct: 0,
    rent_vacancy_pct: 0,
    rent_costs_pct: 0,
    status: "ACTIVE",
    promoted_property_id: null,
    promoted_at: null,
    cover_path: null,
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
});

const schedules: InvestmentSchedule[] = [
    { id: "a", investment_id: "i1", label: "Entrada", kind: "ENTRADA", installments: 2, amount: 7095, first_due_on: "2026-08-31", periodicity: "MONTHLY", index_code: "NONE", position: 0 },
    { id: "b", investment_id: "i1", label: "Parcelas", kind: "PARCELA", installments: 36, amount: 3547.5, first_due_on: "2026-10-20", periodicity: "MONTHLY", index_code: "INCC", position: 1 },
];

const payment = (over: Partial<InvestmentPayment>): InvestmentPayment => ({
    id: crypto.randomUUID(),
    investment_id: "i1",
    due_on: "2026-08-31",
    paid_on: "2026-08-31",
    kind: "ENTRADA",
    amount: 7095,
    correction_amount: 0,
    installment_number: null,
    status: "PAID",
    receipt_path: null,
    receipt_name: null,
    notes: null,
    source: "MANUAL",
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...over,
});

const asOf = new Date("2026-09-22T12:00:00Z");

describe("computeInvestmentMetrics", () => {
    it("reports nothing paid and the whole plan owed before the first payment", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [], asOf);
        expect(m.paidToDate).toBe(0);
        expect(m.remaining).toBe(141900);
        expect(m.committed).toBe(141900);
        expect(m.paidPct).toBe(0);
        expect(m.remainingCount).toBe(38);
    });

    it("moves a paid instalment from owed to paid", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [payment({})], asOf);
        expect(m.paidToDate).toBe(7095);
        expect(m.remaining).toBe(134805);
        expect(m.committed).toBe(141900);
        expect(m.paidPct).toBe(5);
        expect(m.paidCount).toBe(1);
    });

    it("counts the index correction as money spent, on top of the contract", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [payment({ correction_amount: 300 })], asOf);
        expect(m.correctionsPaid).toBe(300);
        expect(m.paidToDate).toBe(7395);
        // the correction is real money, so the unit ends up costing more than the headline price
        expect(m.committed).toBe(142200);
        expect(m.contractPrice).toBe(141900);
    });

    it("points at the next open instalment and flags the overdue ones", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [], asOf);
        // 31/08/2026 has passed on the as-of date, 30/09 has not
        expect(m.overdueCount).toBe(1);
        expect(m.overdueAmount).toBe(7095);
        expect(m.nextDueOn).toBe("2026-09-30");
        expect(m.nextDueAmount).toBe(7095);
    });

    it("counts the months left to the keys", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [], asOf);
        expect(m.monthsToKeys).toBe(36);
        expect(m.keysDelivered).toBe(false);
    });

    it("gives no yield until a rent is estimated", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [], asOf);
        expect(m.netMonthlyRent).toBeNull();
        expect(m.grossYieldPct).toBeNull();
        expect(m.paybackMonths).toBeNull();
    });

    it("nets the rent of vacancy and costs before the yield", () => {
        const m = computeInvestmentMetrics(
            investment({ estimated_rent: 1800, rent_vacancy_pct: 10, rent_costs_pct: 20 }),
            schedules,
            [],
            asOf
        );
        expect(m.netMonthlyRent).toBe(1296); // 1800 × 0,9 × 0,8
        expect(m.grossYieldPct).toBeCloseTo(15.22, 1);
        expect(m.netYieldPct).toBeCloseTo(10.96, 1);
        expect(m.paybackMonths).toBe(110);
    });

    it("treats a payment typed as planned as money still owed", () => {
        const planned = payment({ status: "PLANNED", paid_on: null, kind: "TAXAS", amount: 2000, due_on: "2029-10-01" });
        const m = computeInvestmentMetrics(investment(), schedules, [planned], asOf);
        expect(m.paidToDate).toBe(0);
        expect(m.remaining).toBe(143900);
    });
});

describe("rentStartMonth", () => {
    it("defaults to the month after the keys", () => {
        expect(rentStartMonth(investment())).toBe("2029-10");
    });

    it("rolls into the next year from December", () => {
        expect(rentStartMonth(investment({ keys_expected_on: "2029-12-20" }))).toBe("2030-01");
    });

    it("prefers the date the owner set", () => {
        expect(rentStartMonth(investment({ rent_start_on: "2030-03-01" }))).toBe("2030-03");
    });

    it("prefers the real handover over the forecast", () => {
        expect(rentStartMonth(investment({ keys_delivered_on: "2029-07-05" }))).toBe("2029-08");
    });

    it("is null when no date is known", () => {
        expect(rentStartMonth(investment({ keys_expected_on: null }))).toBeNull();
    });
});

describe("toCardSummary", () => {
    it("carries the card's figures and the document count", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [payment({})], asOf);
        const summary = toCardSummary("i1", m, 3);
        expect(summary).toMatchObject({ id: "i1", paidToDate: 7095, committed: 141900, documents: 3 });
    });
});
