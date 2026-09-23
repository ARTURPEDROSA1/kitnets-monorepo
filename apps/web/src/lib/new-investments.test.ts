import { describe, expect, it } from "vitest";
import {
    addMonthsToKey,
    expandSchedule,
    expandSchedules,
    indexBetweenPayments,
    monthsBetween,
    paymentMonth,
    paymentTotal,
    pendingByKind,
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
    payer: null,
    pj_amount: null,
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

    it("clears the instalment that was anticipated, however early it was paid", () => {
        // the bug this pins: an annual instalment due 15/03/2036, settled in May 2026 to escape the
        // correction, used to stay open because the match keyed on the month the money moved
        const annual = schedule({ id: "a", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", kind: "PARCELA_ANUAL" });
        const anticipated = payment({ kind: "PARCELA_ANUAL", due_on: "2036-03-15", paid_on: "2026-05-06", amount: 5995.45, correction_amount: 134.22 });

        const pending = pendingInstalments([annual], [anticipated]);
        expect(pending).toHaveLength(10);
        expect(pending.some(i => i.dueOn === "2036-03-15")).toBe(false);
    });

    it("does not let a payment clear an instalment of another year", () => {
        const annual = schedule({ id: "a", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", kind: "PARCELA_ANUAL" });
        const paid = payment({ kind: "PARCELA_ANUAL", due_on: "2036-03-15", paid_on: "2026-05-06" });
        expect(pendingInstalments([annual], [paid]).some(i => i.dueOn === "2037-03-15")).toBe(true);
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

describe("projecting open instalments from what was paid", () => {
    const monthly = schedule({ id: "m", installments: 140, amount: 1000, first_due_on: "2026-04-15" });

    it("keeps the contract figure while nothing of the kind has been paid", () => {
        const pending = pendingInstalments([monthly], []);
        expect(pending[0].amount).toBe(1000);
        expect(pending[0].contractedAmount).toBe(1000);
    });

    it("raises every open instalment to the last value paid for its kind", () => {
        const september = payment({ due_on: "2026-09-15", paid_on: "2026-09-11", amount: 1000, correction_amount: 43.07 });
        const pending = pendingInstalments([monthly], [september]);
        expect(pending.every(i => i.amount === 1043.07)).toBe(true);
        expect(pending.every(i => i.contractedAmount === 1000)).toBe(true);
    });

    it("never lets the projection fall: a cheaper later payment does not lower it", () => {
        // a negative index month: the developer keeps billing the previous value, so a payment
        // below the ratchet is a discount, not a new floor
        const high = payment({ id: "h", due_on: "2026-08-15", paid_on: "2026-08-11", amount: 1000, correction_amount: 40.55 });
        const lower = payment({ id: "l", due_on: "2026-09-15", paid_on: "2026-09-11", amount: 1000, correction_amount: 10 });
        const pending = pendingInstalments([monthly], [high, lower]);
        expect(pending[0].amount).toBe(1040.55);
    });

    it("keeps kinds apart: paying an annual instalment does not reprice the monthly ones", () => {
        const annual = schedule({ id: "a", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", kind: "PARCELA_ANUAL" });
        const paidAnnual = payment({ kind: "PARCELA_ANUAL", due_on: "2035-03-15", paid_on: "2026-06-09", amount: 5995.45, correction_amount: 134.22 });
        const pending = pendingInstalments([monthly, annual], [paidAnnual]);
        expect(pending.find(i => i.kind === "PARCELA")!.amount).toBe(1000);
        expect(pending.find(i => i.kind === "PARCELA_ANUAL")!.amount).toBe(6129.67);
    });

    it("ignores a payment that is only planned: a guess is not a bill", () => {
        const planned = payment({ status: "PLANNED", paid_on: null, due_on: "2026-09-15", amount: 1000, correction_amount: 500 });
        expect(pendingInstalments([monthly], [planned])[0].amount).toBe(1000);
    });

    it("does not let the projection drop below a block whose contract figure is higher", () => {
        const bigger = schedule({ id: "b", installments: 2, amount: 2000, first_due_on: "2030-01-15" });
        const september = payment({ due_on: "2026-09-15", paid_on: "2026-09-11", amount: 1000, correction_amount: 43.07 });
        const pending = pendingInstalments([monthly, bigger], [september]);
        expect(pending.find(i => i.scheduleId === "b")!.amount).toBe(2000);
    });
});

describe("indexBetweenPayments", () => {
    // the monthly bills of the real contract: 1.000 contracted, CUB creeping up month by month
    const monthly = [
        payment({ id: "aug", due_on: "2026-08-15", paid_on: "2026-08-11", amount: 1000, correction_amount: 40.55 }),
        payment({ id: "sep", due_on: "2026-09-15", paid_on: "2026-09-11", amount: 1000, correction_amount: 43.07 }),
    ];

    it("reads the month's index off two consecutive bills of a kind", () => {
        const idx = indexBetweenPayments(monthly);
        // 1.043,07 ÷ 1.040,55 − 1
        expect(idx.get("sep")).toEqual({ pct: 0.24, sinceContract: false });
    });

    it("compares the first bill of a kind with its contracted amount, and says so", () => {
        const idx = indexBetweenPayments(monthly);
        // 1.040,55 ÷ 1.000 − 1: the correction accrued since the contract (4,055 % sits on a
        // rounding boundary, so the check is a tolerance, not a literal)
        expect(idx.get("aug")!.sinceContract).toBe(true);
        expect(idx.get("aug")!.pct).toBeCloseTo(4.055, 2);
    });

    it("orders by the date paid, so anticipated instalments read in the order the money moved", () => {
        // due 2037 was paid first (May), due 2036 and 2035 in June: the index runs May → June
        const annual = [
            payment({ id: "y37", kind: "PARCELA_ANUAL", due_on: "2037-03-15", paid_on: "2026-05-11", amount: 5995.45, correction_amount: 70.54 }),
            payment({ id: "y36", kind: "PARCELA_ANUAL", due_on: "2036-03-15", paid_on: "2026-06-05", amount: 5995.45, correction_amount: 134.22 }),
            payment({ id: "y35", kind: "PARCELA_ANUAL", due_on: "2035-03-15", paid_on: "2026-06-09", amount: 5995.45, correction_amount: 134.22 }),
        ];
        const idx = indexBetweenPayments(annual);
        expect(idx.get("y37")!.sinceContract).toBe(true);
        expect(idx.get("y36")).toEqual({ pct: 1.05, sinceContract: false });
        expect(idx.get("y35")).toEqual({ pct: 0, sinceContract: false });
    });

    it("keeps kinds apart", () => {
        const mixed = [...monthly, payment({ id: "y", kind: "PARCELA_ANUAL", due_on: "2035-03-15", paid_on: "2026-09-01", amount: 5995.45, correction_amount: 134.22 })];
        const idx = indexBetweenPayments(mixed);
        expect(idx.get("y")!.sinceContract).toBe(true);
        expect(idx.get("sep")!.pct).toBe(0.24);
    });

    it("has nothing to say about a payment that is only planned", () => {
        const planned = payment({ id: "p", status: "PLANNED", paid_on: null, due_on: "2026-10-15" });
        expect(indexBetweenPayments([...monthly, planned]).get("p")).toBeNull();
    });
});

describe("pendingByKind", () => {
    // the plan of the real contract: 140 monthly, 11 annual, one at the start of the works
    const plan: InvestmentSchedule[] = [
        schedule({ id: "m", installments: 140, amount: 1000, first_due_on: "2026-04-15", label: "Parcelas mensais" }),
        schedule({ id: "a", installments: 11, amount: 5995.45, first_due_on: "2027-03-15", periodicity: "ANNUAL", kind: "PARCELA_ANUAL", label: "Parcelas anuais" }),
        schedule({ id: "o", installments: 1, amount: 19000, first_due_on: "2026-03-17", periodicity: "SINGLE", kind: "INICIO_OBRAS", label: "Início de obras" }),
    ];

    it("counts and totals what is still owed, per kind", () => {
        const groups = pendingByKind(pendingInstalments(plan, []));
        expect(groups.map(g => [g.kind, g.count, g.total])).toEqual([
            ["PARCELA", 140, 140000],
            ["PARCELA_ANUAL", 11, 65949.95],
            ["INICIO_OBRAS", 1, 19000],
        ]);
    });

    it("keeps the order the kinds are listed in, not the order they fall due", () => {
        const groups = pendingByKind(pendingInstalments(plan, []));
        // início de obras is the earliest date but the last kind of the three
        expect(groups[2].kind).toBe("INICIO_OBRAS");
        expect(groups[2].nextDueOn).toBe("2026-03-17");
    });

    it("points at the earliest date still open in each kind", () => {
        const groups = pendingByKind(pendingInstalments(plan, []));
        expect(groups[0].nextDueOn).toBe("2026-04-15");
        expect(groups[1].nextDueOn).toBe("2027-03-15");
    });

    it("shrinks as payments are recorded, and drops a kind once it is settled", () => {
        const paidWorks = payment({ kind: "INICIO_OBRAS", amount: 19000, due_on: "2026-03-17", paid_on: "2026-03-17" });
        const groups = pendingByKind(pendingInstalments(plan, [paidWorks]));
        expect(groups.map(g => g.kind)).toEqual(["PARCELA", "PARCELA_ANUAL"]);
    });

    it("has nothing to group without a plan", () => {
        expect(pendingByKind([])).toEqual([]);
    });
});
