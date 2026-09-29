import { describe, expect, it } from "vitest";
import { buildOpening, validateOpening, type BalanceSheetAccount } from "./accounting-opening";
import { missingTemplateAccounts } from "./accounting-server";
import { chartTemplate } from "./accounting-chart";
import { parseAmountInput } from "./accounting-journal";

const acc = (id: string, code: string, type: BalanceSheetAccount["account_type"], extra: Partial<BalanceSheetAccount> = {}): BalanceSheetAccount =>
    ({ id, code, name: id, account_type: type, nature: type === "ATIVO" ? "D" : "C", analytic: true, active: true, system_key: null, ...extra });
const accounts = new Map([
    ["bank", acc("bank", "1.1.1.02", "ATIVO")],
    ["land", acc("land", "1.2.2.01", "ATIVO")],
    ["capital", acc("capital", "2.3.1.01", "PL")],
    ["lucros", acc("lucros", "2.3.3.01", "PL")],
    ["prej", acc("prej", "2.3.3.02", "PL", { nature: "D" })],
    ["rent", acc("rent", "3.1.1.01", "RECEITA" as never)],
    ["group", acc("group", "1.1.1", "ATIVO", { analytic: false })],
]);

describe("buildOpening", () => {
    it("drops empty lines, merges repeats and nets both sides", () => {
        const r = buildOpening([
            { account_id: "bank", debit: 1000, credit: 0 },
            { account_id: "bank", debit: 500, credit: 200 },
            { account_id: "land", debit: 0, credit: 0 },
            { account_id: "capital", debit: 0, credit: 1300 },
        ]);
        expect(r.lines).toEqual([{ account_id: "bank", debit: 1300, credit: 0 }, { account_id: "capital", debit: 0, credit: 1300 }]);
        expect(r.difference).toBe(0);
        expect(r.plugged).toBe(false);
    });

    it("plugs a difference only when asked, on the right side", () => {
        const lines = [{ account_id: "bank", debit: 1000, credit: 0 }, { account_id: "capital", debit: 0, credit: 900 }];
        expect(buildOpening(lines).difference).toBe(100);
        const up = buildOpening(lines, { plug: true, lucrosAccountId: "lucros", prejuizosAccountId: "prej" });
        expect(up.plugged).toBe(true);
        expect(up.lines).toContainEqual({ account_id: "lucros", debit: 0, credit: 100 });
        expect(up.debit).toBe(up.credit);
        const down = buildOpening([{ account_id: "bank", debit: 800, credit: 0 }, { account_id: "capital", debit: 0, credit: 900 }], { plug: true, lucrosAccountId: "lucros", prejuizosAccountId: "prej" });
        expect(down.lines).toContainEqual({ account_id: "prej", debit: 100, credit: 0 });
    });
});

describe("validateOpening", () => {
    it("accepts balanced balance-sheet lines", () => {
        expect(validateOpening([{ account_id: "bank", debit: 10, credit: 0 }, { account_id: "capital", debit: 0, credit: 10 }], accounts)).toEqual([]);
    });
    it("rejects income accounts, groups and differences", () => {
        expect(validateOpening([{ account_id: "rent", debit: 0, credit: 10 }, { account_id: "bank", debit: 10, credit: 0 }], accounts).join()).toMatch(/só tem contas de ativo/);
        expect(validateOpening([{ account_id: "group", debit: 10, credit: 0 }, { account_id: "capital", debit: 0, credit: 10 }], accounts).join()).toMatch(/grupo/);
        expect(validateOpening([{ account_id: "bank", debit: 10, credit: 0 }, { account_id: "capital", debit: 0, credit: 9 }], accounts).join()).toMatch(/precisam ser iguais/);
    });
});

describe("missingTemplateAccounts", () => {
    it("returns the whole template for an empty chart and only new accounts later", () => {
        const all = chartTemplate("COST");
        expect(missingTemplateAccounts([], "COST")).toHaveLength(all.length);
        const existing = all.filter(a => a.systemKey !== "PPI_A_CLASSIFICAR").map(a => ({ code: a.code, system_key: a.systemKey }));
        expect(missingTemplateAccounts(existing, "COST").map(a => a.systemKey)).toEqual(["PPI_A_CLASSIFICAR"]);
    });
    it("leaves a code the contador already used", () => {
        const all = chartTemplate("COST");
        const existing = all.filter(a => a.systemKey !== "DESP_OUTRAS_IMOVEIS").map(a => ({ code: a.code, system_key: a.systemKey }));
        existing.push({ code: "4.1.1.09", system_key: null });
        expect(missingTemplateAccounts(existing, "COST")).toEqual([]);
    });
});

describe("parseAmountInput", () => {
    it("reads Brazilian and plain amounts", () => {
        expect(parseAmountInput("1.500,50")).toBe(1500.5);
        expect(parseAmountInput("1500,5")).toBe(1500.5);
        expect(parseAmountInput("1500.50")).toBe(1500.5);
        expect(parseAmountInput("1.500")).toBe(1500);
        expect(parseAmountInput("R$ 10")).toBe(10);
        expect(parseAmountInput("-2.345,67")).toBe(-2345.67);
        expect(parseAmountInput("")).toBe(0);
    });
});
