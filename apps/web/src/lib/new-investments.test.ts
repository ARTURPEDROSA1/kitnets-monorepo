import { describe, expect, it } from "vitest";
import {
    addMonthsToKey,
    expandSchedule,
    expandSchedules,
    monthsBetween,
    paymentMonth,
    paymentTotal,
    pendingInstalments,
    scheduleHorizon,
    scheduledTotal,
    type InvestmentPayment,
    type InvestmentSchedule,
} from "./new-investments";

/** The quadro resumo of the studio in the contract: 2 × 7.095 then 36 × 3.547,50. */
const schedule = (over: Partial<InvestmentSchedule> = {}): InvestmentSchedule => ({
    id: "s1",
    investment_id: "i1",
    label: "Parcelas mensais",
    kind: "PARCELA",
    installments: 36,
    amount: 3547.5,
    first_due_on: "2026-10-20",
    periodicity: "MONTHLY",
    index_code: "INCC",
    position: 0,
    ...over,
});

const payment = (over: Partial<InvestmentPayment> = {}): InvestmentPayment => ({
    id: "p1",
    investment_id: "i1",
    due_on: "2026-10-20",
    paid_on: "2026-10-20",
    kind: "PARCELA",
    amount: 3547.5,
    correction_amount: 0,
    installment_number: null,
    status: "PAID",
    receipt_path: null,
    receipt_name: null,
    notes: null,
    source: "MANUAL",
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
    ...over,
});

describe("expandSchedule", () => {
    it("walks a monthly block from its first due date", () => {
        const out = expandSchedule(schedule());
        expect(out).toHaveLength(36);
        expect(out[0].dueOn).toBe("2026-10-20");
        expect(out[1].dueOn).toBe("2026-11-20");
        expect(out[35].dueOn).toBe("2029-09-20");
        expect(out.every(i => i.amount === 3547.5)).toBe(true);
    });

    it("clamps the due day on short months", () => {
        // "2 parcelas de 7.095,00 · primeiro 31/08/2026 · último 30/09/2026"
        const out = expandSchedule(schedule({ installments: 2, amount: 7095, first_due_on: "2026-08-31" }));
        expect(out.map(i => i.dueOn)).toEqual(["2026-08-31", "2026-09-30"]);
    });

    it("steps by twelve months for an annual block", () => {
        const out = expandSchedule(schedule({ installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL" }));
        expect(out).toHaveLength(11);
        expect(out[1].dueOn).toBe("2028-03-15");
        expect(out[10].dueOn).toBe("2037-03-15");
    });

    it("yields exactly one instalment for a single payment", () => {
        const out = expandSchedule(schedule({ installments: 12, periodicity: "SINGLE", amount: 19000 }));
        expect(out).toHaveLength(1);
    });

    it("gives nothing for an unusable first date", () => {
        expect(expandSchedule(schedule({ first_due_on: "" }))).toEqual([]);
    });
});

describe("schedule totals", () => {
    const blocks = [
        schedule({ id: "a", installments: 2, amount: 7095, first_due_on: "2026-08-31", label: "Entrada", kind: "ENTRADA" }),
        schedule({ id: "b" }),
    ];

    it("adds every instalment of every block", () => {
        // 2 × 7.095 + 36 × 3.547,50 = 141.900 — the contract's headline price
        expect(scheduledTotal(blocks)).toBe(141900);
    });

    it("reports the last month the plan reaches", () => {
        expect(scheduleHorizon(blocks)).toBe("2029-09");
    });

    it("sorts instalments of different blocks together", () => {
        const all = expandSchedules(blocks);
        expect(all[0].dueOn).toBe("2026-08-31");
        expect(all[1].dueOn).toBe("2026-09-30");
        expect(all[2].dueOn).toBe("2026-10-20");
    });
});

describe("pendingInstalments", () => {
    it("drops the instalment a payment of the same month and kind answers", () => {
        const pending = pendingInstalments([schedule()], [payment()]);
        expect(pending).toHaveLength(35);
        expect(pending[0].dueOn).toBe("2026-11-20");
    });

    it("matches on the month, not on the exact day", () => {
        // paid on the 22nd, due on the 20th: still the October instalment
        const pending = pendingInstalments([schedule()], [payment({ paid_on: "2026-10-22" })]);
        expect(pending[0].dueOn).toBe("2026-11-20");
    });

    it("does not let a payment of another kind consume an instalment", () => {
        const pending = pendingInstalments([schedule()], [payment({ kind: "TAXAS" })]);
        expect(pending).toHaveLength(36);
    });

    it("uses the due date when the payment is only planned", () => {
        const pending = pendingInstalments([schedule()], [payment({ status: "PLANNED", paid_on: null, due_on: "2026-10-20" })]);
        expect(pending).toHaveLength(35);
    });
});

describe("payment helpers", () => {
    it("totals the instalment and its index correction", () => {
        expect(paymentTotal(payment({ amount: 3547.5, correction_amount: 212.85 }))).toBe(3760.35);
    });

    it("buckets a paid row by the date it was paid and a planned one by its due date", () => {
        expect(paymentMonth(payment({ paid_on: "2026-11-03", due_on: "2026-10-20" }))).toBe("2026-11");
        expect(paymentMonth(payment({ status: "PLANNED", paid_on: null, due_on: "2026-10-20" }))).toBe("2026-10");
    });
});

describe("month arithmetic", () => {
    it("counts months between keys in both directions", () => {
        expect(monthsBetween("2026-09", "2029-09")).toBe(36);
        expect(monthsBetween("2029-09", "2026-09")).toBe(-36);
    });

    it("rolls the year over", () => {
        expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
        expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
        expect(addMonthsToKey("2026-10", 36)).toBe("2029-10");
    });
});
