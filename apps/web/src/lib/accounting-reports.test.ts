import { describe, expect, it } from "vitest";
import { buildLedger, buildTrialBalance, formatBalance, receivablesByProperty, trialBalanceTotals } from "./accounting-reports";
import type { JournalEntry } from "./accounting-journal";

const accounts = [
    { id: "g1", code: "1", name: "Ativo", account_type: "ATIVO" as const, analytic: false },
    { id: "g11", code: "1.1", name: "Ativo circulante", account_type: "ATIVO" as const, analytic: false },
    { id: "bank", code: "1.1.1.02", name: "Bancos", account_type: "ATIVO" as const, analytic: true },
    { id: "ar", code: "1.1.2.01", name: "Aluguéis a receber", account_type: "ATIVO" as const, analytic: true },
    { id: "g3", code: "3", name: "Receitas", account_type: "RECEITA" as const, analytic: false },
    { id: "rent", code: "3.1.1.01", name: "Receita de aluguéis", account_type: "RECEITA" as const, analytic: true },
    { id: "cap", code: "2.3.1.01", name: "Capital", account_type: "PL" as const, analytic: true },
];

const entry = (id: string, date: string, lines: Array<[string, number, number, string | null]>): JournalEntry => ({
    id, entry_date: date, description: id, source: "MANUAL", source_ref: null, reverses_entry_id: null, created_by: null, created_at: `${date}T12:00:00Z`,
    lines: lines.map(([account_id, debit, credit, property_id], i) => ({ id: `${id}-${i}`, line_no: i + 1, account_id, debit, credit, property_id, unit_id: null, memo: null })),
});

describe("buildTrialBalance", () => {
    it("sums accounts into their groups and keeps debits equal to credits", () => {
        const rows = buildTrialBalance(accounts, [
            { account_id: "bank", opening: 1000, debit: 3950, credit: 0 },
            { account_id: "ar", opening: 0, debit: 3950, credit: 3950 },
            { account_id: "rent", opening: 0, debit: 0, credit: 3950 },
            { account_id: "cap", opening: -1000, debit: 0, credit: 0 },
        ]);
        const byCode = new Map(rows.map(r => [r.code, r]));
        expect(byCode.get("1")!.closing).toBe(4950);
        expect(byCode.get("1.1")!.debit).toBe(7900);
        expect(byCode.get("1.1.2.01")!.closing).toBe(0);
        expect(byCode.get("3")!.closing).toBe(-3950);
        expect(rows.map(r => r.code)).toEqual(["1", "1.1", "1.1.1.02", "1.1.2.01", "2.3.1.01", "3", "3.1.1.01"]);
        const t = trialBalanceTotals(rows);
        expect(t.debit).toBe(t.credit);
        expect(t.closing).toBe(0);
        expect(formatBalance(-3950)).toMatch(/3\.950,00 C$/);
        expect(formatBalance(0)).toBe("—");
    });
});

describe("buildLedger and receivablesByProperty", () => {
    const entries = [
        entry("deposit", "2026-09-10", [["bank", 3950, 0, null], ["ar", 0, 3950, "p1"]]),
        entry("accrual", "2026-09-30", [["ar", 3950, 0, "p1"], ["rent", 0, 3950, "p1"]]),
        entry("other", "2026-09-30", [["ar", 1200, 0, "p2"], ["rent", 0, 1200, "p2"]]),
    ];

    it("runs each account's balance from the opening, in date order", () => {
        const ledger = buildLedger(accounts, new Map([["bank", 1000]]), entries);
        const bank = ledger.find(a => a.code === "1.1.1.02")!;
        expect(bank.opening).toBe(1000);
        expect(bank.closing).toBe(4950);
        const ar = ledger.find(a => a.code === "1.1.2.01")!;
        expect(ar.lines.map(l => l.balance)).toEqual([-3950, 0, 1200]);
        expect(ledger.some(a => a.code === "2.3.1.01")).toBe(false);
    });

    it("shows accrued and received per property", () => {
        const rows = receivablesByProperty(new Map([["p3", 500]]), entries, "ar");
        const p1 = rows.find(r => r.property_id === "p1")!;
        expect([p1.accrued, p1.received, p1.closing]).toEqual([3950, 3950, 0]);
        expect(rows.find(r => r.property_id === "p2")!.closing).toBe(1200);
        expect(rows.find(r => r.property_id === "p3")!.closing).toBe(500);
    });
});
