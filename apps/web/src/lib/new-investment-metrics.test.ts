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
    sim_horizon_months: 120,
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
    payer: null,
    pj_amount: null,
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

    it("counts the index correction as money spent, and projects it onto the rest of the kind", () => {
        const m = computeInvestmentMetrics(investment(), schedules, [payment({ correction_amount: 300 })], asOf);
        expect(m.correctionsPaid).toBe(300);
        expect(m.paidToDate).toBe(7395);
        // the correction is real money, and the second entrada instalment is now expected at the
        // same 7.395 — so the unit ends up costing 600 more than the headline price, not 300
        expect(m.remaining).toBe(7395 + 127710);
        expect(m.committed).toBe(142500);
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

describe("what is still owed, per kind", () => {
    // the real plan: 140 monthly + 11 annual + one at the start of the works
    const plan: InvestmentSchedule[] = [
        { id: "m", investment_id: "i1", label: "Parcelas mensais", kind: "PARCELA", installments: 140, amount: 1000, first_due_on: "2026-04-15", periodicity: "MONTHLY", index_code: "CUB", position: 0 },
        { id: "a", investment_id: "i1", label: "Parcelas anuais", kind: "PARCELA_ANUAL", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", index_code: "CUB", position: 1 },
        { id: "o", investment_id: "i1", label: "Início de obras", kind: "INICIO_OBRAS", installments: 1, amount: 19000, first_due_on: "2026-03-17", periodicity: "SINGLE", index_code: "CUB", position: 2 },
    ];

    it("breaks the remaining total into one line per kind", () => {
        const m = computeInvestmentMetrics(investment(), plan, [], asOf);
        expect(m.remainingByKind.map(k => [k.short, k.count, k.total])).toEqual([
            ["Mensais", 140, 140000],
            ["Anuais", 11, 65949.95],
            ["Início de obras", 1, 19000],
        ]);
    });

    it("keeps the lines adding up to the remaining total", () => {
        const m = computeInvestmentMetrics(investment(), plan, [], asOf);
        const sum = m.remainingByKind.reduce((s, k) => s + k.total, 0);
        expect(Math.round(sum * 100) / 100).toBe(m.remaining);
    });

    it("counts a payment typed as planned in its own kind", () => {
        const planned = payment({ status: "PLANNED", paid_on: null, kind: "TAXAS", amount: 2000, due_on: "2033-10-01" });
        const m = computeInvestmentMetrics(investment(), plan, [planned], asOf);
        expect(m.remainingByKind.find(k => k.kind === "TAXAS")).toMatchObject({ count: 1, total: 2000 });
    });

    it("has nothing to break down once the plan is settled", () => {
        const m = computeInvestmentMetrics(investment(), [], [], asOf);
        expect(m.remainingByKind).toEqual([]);
    });
});

describe("projection from the last payment", () => {
    // the real plan: 140 monthly at 1.000, 11 annual at 5.995,45
    const plan: InvestmentSchedule[] = [
        { id: "m", investment_id: "i1", label: "Parcelas mensais", kind: "PARCELA", installments: 140, amount: 1000, first_due_on: "2026-04-15", periodicity: "MONTHLY", index_code: "CUB", position: 0 },
        { id: "a", investment_id: "i1", label: "Parcelas anuais", kind: "PARCELA_ANUAL", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", index_code: "CUB", position: 1 },
    ];
    // September's instalment came with 43,07 of CUB on top; two annual ones were anticipated with 134,22 each
    const paid = [
        payment({ kind: "PARCELA", due_on: "2026-09-15", paid_on: "2026-09-11", amount: 1000, correction_amount: 43.07 }),
        payment({ kind: "PARCELA_ANUAL", due_on: "2035-03-15", paid_on: "2026-06-09", amount: 5995.45, correction_amount: 134.22 }),
        payment({ kind: "PARCELA_ANUAL", due_on: "2036-03-15", paid_on: "2026-06-05", amount: 5995.45, correction_amount: 134.22 }),
    ];

    it("prices every open instalment at the last value paid for its kind", () => {
        const m = computeInvestmentMetrics(investment(), plan, paid, asOf);
        const monthly = m.remainingByKind.find(k => k.kind === "PARCELA")!;
        const annual = m.remainingByKind.find(k => k.kind === "PARCELA_ANUAL")!;
        // 139 monthly left (one paid), each now 1.043,07; 9 annual left, each 6.129,67
        expect(monthly.count).toBe(139);
        expect(monthly.total).toBe(144986.73);
        expect(annual.count).toBe(9);
        expect(annual.total).toBe(55167.03);
    });

    it("shows the next instalment at what it will actually cost, not the contract figure", () => {
        const m = computeInvestmentMetrics(investment(), plan, paid, asOf);
        expect(m.nextDueOn).toBe("2026-10-15");
        expect(m.nextDueAmount).toBe(1043.07);
    });

    it("moves the total cost up with the projection", () => {
        const before = computeInvestmentMetrics(investment(), plan, [], asOf);
        const after = computeInvestmentMetrics(investment(), plan, paid, asOf);
        expect(after.committed).toBeGreaterThan(before.committed);
        expect(after.committed).toBe(after.paidToDate + after.remaining);
    });

    it("uses the contract figure while nothing of that kind has been paid", () => {
        const m = computeInvestmentMetrics(investment(), plan, [paid[0]], asOf);
        expect(m.remainingByKind.find(k => k.kind === "PARCELA_ANUAL")!.total).toBe(11 * 5995.45);
    });
});

describe("who paid what", () => {
    it("splits the paid total between the pockets and keeps unassigned rows apart", () => {
        const rows = [
            payment({ id: "a", amount: 1000, correction_amount: 0, payer: "PF" }),
            payment({ id: "b", amount: 1000, correction_amount: 43.07, payer: "SPLIT", pj_amount: 600 }),
            payment({ id: "c", amount: 2000, correction_amount: 0 }), // payer never recorded
        ];
        const m = computeInvestmentMetrics(investment(), [], rows, asOf);
        // the split row: 1.043,07 paid, 600 of it PJ, the rest PF
        expect(m.paidByPayer).toEqual({ pf: 1443.07, pj: 600, unassigned: 2000 });
        // the three parts add back up to the total (a tolerance: this sum is the test's, not the code's, and it is not rounded)
        expect(m.paidByPayer.pf + m.paidByPayer.pj + m.paidByPayer.unassigned).toBeCloseTo(m.paidToDate, 2);
    });

    it("books a PJ row whole to the company and ignores planned rows", () => {
        const rows = [
            payment({ id: "a", amount: 5995.45, correction_amount: 134.22, payer: "PJ" }),
            payment({ id: "p", status: "PLANNED", paid_on: null, amount: 1000, payer: "PF" }),
        ];
        const m = computeInvestmentMetrics(investment(), [], rows, asOf);
        expect(m.paidByPayer).toEqual({ pf: 0, pj: 6129.67, unassigned: 0 });
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
