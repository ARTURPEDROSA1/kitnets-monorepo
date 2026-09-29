import { describe, expect, it } from "vitest";
import {
    checklistSummary, closeChecklist, depreciationEntry, diffEntries, fairValueEntry, financingEntry, monthEnd, monthRange, rentAccrual, rentRef,
    resolveEntries, shiftMonth, type AutoLine, type CloseFacts, type IncomeRowForAccrual, type PostableEntry, type StoredEntry,
} from "./accounting-accruals";

const cents = (v: number) => Math.round(v * 100);
const balanced = (lines: AutoLine[]) => lines.reduce((s, l) => s + cents(l.debit), 0) === lines.reduce((s, l) => s + cents(l.credit), 0);
const amount = (lines: AutoLine[], key: string, side: "debit" | "credit") => lines.filter(l => l.key === key).reduce((s, l) => s + l[side], 0);

const row = (p: Partial<IncomeRowForAccrual> = {}): IncomeRowForAccrual => ({
    property_id: "p1", month: "2026-09-01", received_amount: 3950, energy_portion: 350, other_income: 109.8, agency_fee_pct: 10, status: "CONFIRMED",
    unit_id: null, unit_name: null, other_expenses: 50, condo_amount: 0, fee_on_condo: false, ...p,
});

describe("months", () => {
    it("knows the last day, moves across years and lists ranges", () => {
        expect(monthEnd("2026-02")).toBe("2026-02-28");
        expect(monthEnd("2028-02")).toBe("2028-02-29");
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
        expect(monthRange("2026-03", "2026-02")).toEqual([]);
    });
});

describe("rentAccrual", () => {
    it("posts the gross rent, the agency fee and the energy as revenue (policy RECEITA)", () => {
        // the property-income example: gross 4.000, fee 10 %, energy 350 → received 3.950
        const r = rentAccrual(row(), { propertyName: "Vale do Sol", policy: "RECEITA" });
        expect(r.invalid).toBe(false);
        const lines = r.entry!.lines;
        expect(balanced(lines)).toBe(true);
        expect(amount(lines, "ALUGUEIS_A_RECEBER", "debit")).toBe(3950);
        expect(amount(lines, "DESP_TAXA_ADM", "debit")).toBe(400);
        expect(amount(lines, "RECEITA_ALUGUEL", "credit")).toBe(4000);
        expect(amount(lines, "RECEITA_REEMBOLSOS", "credit")).toBe(350);
        expect(r.entry!.entry_date).toBe("2026-09-30");
        expect(r.entry!.source_ref).toBe("rent:p1:-:2026-09");
        expect(r.entry!.description).toBe("Aluguel set/2026 — Vale do Sol");
        // the energy cost and other expenses the owner pays come from the bank, not from here
        expect(lines.some(l => l.key === "DESP_UTILIDADES")).toBe(false);
    });

    it("sends energy and condominium back against the expense under REPASSE, fee on the condominium included", () => {
        // condominium 250 with the fee on it: 225 comes inside the deposit
        const r = rentAccrual(row({ received_amount: 4175, condo_amount: 250, fee_on_condo: true, unit_id: "u1", unit_name: "Kitnet 2" }), { propertyName: "Vale do Sol", policy: "REPASSE" });
        const lines = r.entry!.lines;
        expect(balanced(lines)).toBe(true);
        expect(amount(lines, "ALUGUEIS_A_RECEBER", "debit")).toBe(4175);
        expect(amount(lines, "DESP_TAXA_ADM", "debit")).toBe(425);
        expect(amount(lines, "RECEITA_ALUGUEL", "credit")).toBe(4000);
        expect(amount(lines, "DESP_UTILIDADES", "credit")).toBe(350);
        expect(amount(lines, "DESP_CONDOMINIO", "credit")).toBe(250);
        expect(lines.every(l => l.property_id === "p1" && l.unit_id === "u1")).toBe(true);
        expect(rentRef({ property_id: "p1", unit_id: "u1", month: "2026-09-01" })).toBe("rent:p1:u1:2026-09");
        expect(r.entry!.description).toContain("· Kitnet 2");
    });

    it("posts only the rent while the reimbursements policy is not decided", () => {
        const r = rentAccrual(row(), { propertyName: "Vale do Sol", policy: null });
        expect(r.waitingPolicy).toBe(true);
        const lines = r.entry!.lines;
        expect(balanced(lines)).toBe(true);
        expect(amount(lines, "ALUGUEIS_A_RECEBER", "debit")).toBe(3600);
        expect(amount(lines, "RECEITA_ALUGUEL", "credit")).toBe(4000);
        expect(lines.some(l => l.key === "RECEITA_REEMBOLSOS")).toBe(false);
    });

    it("needs no policy when there is nothing to reimburse, and posts nothing for a vacant month", () => {
        const r = rentAccrual(row({ energy_portion: 0, received_amount: 3600 }), { propertyName: "X", policy: null });
        expect(r.waitingPolicy).toBe(false);
        expect(r.entry!.lines).toHaveLength(3);
        const vacant = rentAccrual(row({ received_amount: 0, energy_portion: 0, condo_amount: 250 }), { propertyName: "X", policy: "RECEITA" });
        expect(vacant.entry).toBeNull();
        expect(vacant.invalid).toBe(false);
    });

    it("marks an expected month and refuses a row that does not add up", () => {
        expect(rentAccrual(row({ status: "EXPECTED" }), { propertyName: "X", policy: "RECEITA" }).entry!.description).toContain("(previsto)");
        const bad = rentAccrual(row({ received_amount: 100, energy_portion: 350 }), { propertyName: "X", policy: "RECEITA" });
        expect(bad.invalid).toBe(true);
        expect(bad.entry).toBeNull();
    });
});

describe("depreciationEntry", () => {
    const names = new Map([["p1", "Vale do Sol"], ["p2", "Casa X"]]);

    it("depreciates buildings per property over the useful life and stops at the cost", () => {
        const r = depreciationEntry({
            month: "2026-09", usefulLifeYears: 25,
            cost: new Map([["p1", 300000], ["p2", 120000], ["", 60000]]),
            accumulated: new Map([["p2", 119800]]),
            propertyNames: names,
        });
        const lines = r.entry!.lines;
        expect(balanced(lines)).toBe(true);
        expect(lines.find(l => l.key === "DESP_DEPRECIACAO_PPI" && l.property_id === "p1")!.debit).toBe(1000);
        // only 200 left on p2 (monthly would be 400)
        expect(lines.find(l => l.key === "DESP_DEPRECIACAO_PPI" && l.property_id === "p2")!.debit).toBe(200);
        // the opening balance without a property is depreciated as one group
        expect(lines.find(l => l.key === "DESP_DEPRECIACAO_PPI" && l.property_id === null)!.debit).toBe(200);
        expect(r.total).toBe(1400);
        expect(r.entry!.source_ref).toBe("dep:2026-09");
        expect(r.entry!.entry_date).toBe("2026-09-30");
    });

    it("posts nothing without a building cost or a useful life", () => {
        expect(depreciationEntry({ month: "2026-09", usefulLifeYears: 25, cost: new Map([["p1", 0]]), accumulated: new Map(), propertyNames: names }).entry).toBeNull();
        expect(depreciationEntry({ month: "2026-09", usefulLifeYears: 0, cost: new Map([["p1", 1000]]), accumulated: new Map(), propertyNames: names }).entry).toBeNull();
        expect(depreciationEntry({ month: "2026-09", usefulLifeYears: 25, cost: new Map([["p1", 1000]]), accumulated: new Map([["p1", 1000]]), propertyNames: names }).entry).toBeNull();
    });
});

describe("fairValueEntry", () => {
    it("adjusts each property to its valuation of the year and reports the missing ones", () => {
        const r = fairValueEntry({
            year: 2026,
            carrying: new Map([["p1", 400000], ["p2", 250000], ["p3", 90000], ["", 10000]]),
            valuations: new Map([["p1", { amount: 450000, valued_on: "2026-12-10" }], ["p2", { amount: 240000, valued_on: "2026-11-30" }]]),
            propertyNames: new Map([["p1", "A"], ["p2", "B"], ["p3", "C"]]),
        });
        const lines = r.entry!.lines;
        expect(balanced(lines)).toBe(true);
        expect(amount(lines, "GANHO_AVJ", "credit")).toBe(50000);
        expect(amount(lines, "PERDA_AVJ", "debit")).toBe(10000);
        expect(r.gain).toBe(50000);
        expect(r.loss).toBe(10000);
        expect(r.missing).toEqual(["C"]);
        expect(r.untagged).toBe(10000);
        expect(r.entry!.entry_date).toBe("2026-12-31");
        expect(r.entry!.source_ref).toBe("fv:2026");
    });
});

describe("financingEntry", () => {
    it("moves interest and insurance out of the loan and never more than the instalment", () => {
        const e = financingEntry({ bankRowId: "b1", date: "2026-09-05", amount: 2500, propertyId: "p1", interest: 1800, insurance: 120 }, "Vale do Sol")!;
        expect(balanced(e.lines)).toBe(true);
        expect(amount(e.lines, "DESP_JUROS_FINANCIAMENTO", "debit")).toBe(1800);
        expect(amount(e.lines, "DESP_FINANCEIRAS_OUTRAS", "debit")).toBe(120);
        expect(amount(e.lines, "FINANCIAMENTOS_CP", "credit")).toBe(1920);
        expect(e.source_ref).toBe("fin:b1");
        expect(e.entry_date).toBe("2026-09-05");
        const capped = financingEntry({ bankRowId: "b2", date: "2026-09-05", amount: 1000, propertyId: null, interest: 900, insurance: 300 }, null)!;
        expect(amount(capped.lines, "FINANCIAMENTOS_CP", "credit")).toBe(1000);
        expect(financingEntry({ bankRowId: "b3", date: "2026-09-05", amount: 1000, propertyId: null, interest: 0, insurance: 0 }, null)).toBeNull();
    });
});

describe("resolveEntries and diffEntries", () => {
    const accounts = new Map([
        ["ALUGUEIS_A_RECEBER", { id: "a1", code: "1.1.2.01", name: "Aluguéis a receber", analytic: true, active: true }],
        ["RECEITA_ALUGUEL", { id: "a2", code: "3.1.1.01", name: "Receita de aluguéis", analytic: true, active: true }],
        ["DESP_TAXA_ADM", { id: "a3", code: "4.1.1.01", name: "Taxa", analytic: true, active: false }],
    ]);

    it("maps keys to accounts and refuses an entry with an inactive account", () => {
        const ok = rentAccrual(row({ agency_fee_pct: 0, energy_portion: 0, received_amount: 1000 }), { propertyName: "X", policy: "RECEITA" }).entry!;
        const withFee = rentAccrual(row({ energy_portion: 0, received_amount: 900 }), { propertyName: "Y", policy: "RECEITA" }).entry!;
        const r = resolveEntries([ok, withFee], accounts);
        expect(r.entries).toHaveLength(1);
        expect(r.entries[0].lines.map(l => l.account_id)).toEqual(["a1", "a2"]);
        expect(r.errors[0]).toMatch(/4\.1\.1\.01 Taxa está inativa/);
    });

    it("creates, replaces, removes and keeps by source_ref", () => {
        const entry = (ref: string, value: number): PostableEntry => ({
            source: "ACCRUAL", source_ref: ref, entry_date: "2026-09-30", description: `Aluguel ${ref}`,
            lines: [
                { account_id: "a1", debit: value, credit: 0, property_id: "p1", unit_id: null, memo: null },
                { account_id: "a2", debit: 0, credit: value, property_id: "p1", unit_id: null, memo: null },
            ],
        });
        const stored = (ref: string, value: number, id: string): StoredEntry => ({ ...entry(ref, value), id, lines: [...entry(ref, value).lines].reverse() });
        const d = diffEntries([entry("r1", 100), entry("r2", 200), entry("r3", 300)], [stored("r1", 100, "e1"), stored("r2", 250, "e2"), stored("r9", 50, "e9")]);
        expect(d.unchanged).toBe(1);                        // same lines in another order
        expect(d.replace.map(x => x.id)).toEqual(["e2"]);
        expect(d.create.map(x => x.source_ref)).toEqual(["r3"]);
        expect(d.remove.map(x => x.id)).toEqual(["e9"]);
    });
});

describe("closeChecklist", () => {
    const facts = (p: Partial<CloseFacts> = {}): CloseFacts => ({
        month: "2026-08", today: "2026-09-29", openingDate: "2026-08-01", status: "OPEN", previousOpen: [], openingPosted: true,
        bank: { rows: 12, questions: 0, ready: 0 }, reconciliation: { asOf: "2026-08-31", statement: 1000, book: 1000 },
        auto: { create: 0, replace: 0, remove: 0, unchanged: 5, errors: [] },
        rent: { rows: 5, entries: 5, grossRent: 20000, expected: 0, waitingPolicy: 0, invalid: [] },
        leasesWithoutIncome: [], mixedRows: [], receivablesCredit: [],
        measurement: "COST", policiesDecided: true, depreciation: 1000, ppi: { depreciable: 300000, toClassify: 0, untagged: 0 },
        fairValue: null, financing: { reclassified: 0, withoutSplit: [] }, financingDebitBalance: 0,
        imob: { cost: 0, depreciatedInMonth: false }, revenue: { month: 20000, average3: null },
        ...p,
    });

    it("lets a clean month close", () => {
        const s = checklistSummary(closeChecklist(facts()));
        expect(s).toEqual({ errors: 0, warnings: 0, canClose: true });
    });

    it("blocks on open previous months, bank questions, an undecided reimbursements policy and the current month", () => {
        const items = closeChecklist(facts({ previousOpen: ["2026-07"], bank: { rows: 3, questions: 2, ready: 0 }, rent: { rows: 1, entries: 1, grossRent: 1, expected: 0, waitingPolicy: 1, invalid: [] }, month: "2026-09" }));
        const errors = items.filter(i => i.level === "error").map(i => i.id);
        expect(errors).toEqual(expect.arrayContaining(["previous", "bank", "reimbursements", "finished"]));
        expect(checklistSummary(items).canClose).toBe(false);
    });

    it("warns about what needs the owner's attention without blocking", () => {
        const items = closeChecklist(facts({
            reconciliation: null, measurement: null, policiesDecided: false, depreciation: null,
            leasesWithoutIncome: ["Vale do Sol · Kitnet 3"], receivablesCredit: [{ label: "Casa X", balance: 350 }],
            financing: { reclassified: 0, withoutSplit: ["05/08/2026 R$ 2.500,00: sem vínculo"] },
        }));
        const warnings = items.filter(i => i.level === "warning").map(i => i.id);
        expect(warnings).toEqual(expect.arrayContaining(["reconciliation", "model", "leases", "receivables", "financing"]));
        expect(checklistSummary(items).errors).toBe(0);
    });

    it("blocks the December close under fair value without the valuations", () => {
        const items = closeChecklist(facts({ month: "2025-12", measurement: "FAIR_VALUE", depreciation: null, fairValue: { missing: ["Casa X"], untagged: 0, gain: 0, loss: 0 } }));
        expect(items.find(i => i.id === "fv-missing")?.level).toBe("error");
    });

    it("flags a revenue swing and changed records in a closed month", () => {
        const items = closeChecklist(facts({ status: "CLOSED", auto: { create: 1, replace: 0, remove: 0, unchanged: 4, errors: [] }, revenue: { month: 30000, average3: 20000 } }));
        expect(items.find(i => i.id === "auto")?.level).toBe("warning");
        expect(items.find(i => i.id === "revenue")?.title).toMatch(/50% acima/);
    });
});
