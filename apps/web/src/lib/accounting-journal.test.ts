import { describe, expect, it } from "vitest";
import { balancesByAccount, entryTotals, isValidIsoDate, postingErrorMessage, toPostPayload, validateEntryDraft, type EntryDraft } from "./accounting-journal";

const accounts = new Map([
    ["bank", { id: "bank", code: "1.1.1.02", name: "Bancos", analytic: true, active: true, nature: "D" as const }],
    ["rent", { id: "rent", code: "3.1.1.01", name: "Aluguéis", analytic: true, active: true, nature: "C" as const }],
    ["group", { id: "group", code: "1.1.1", name: "Disponível", analytic: false, active: true, nature: "D" as const }],
    ["off", { id: "off", code: "1.1.5.01", name: "Estoque", analytic: true, active: false, nature: "D" as const }],
]);

const ok: EntryDraft = {
    entry_date: "2026-09-10",
    description: "Aluguel de setembro",
    lines: [{ account_id: "bank", debit: 1500 }, { account_id: "rent", credit: 1500 }],
};

describe("validateEntryDraft", () => {
    it("accepts a balanced entry", () => {
        expect(validateEntryDraft(ok, { accounts })).toEqual([]);
    });

    it("rejects unbalanced, one-line, two-sided and bad-account entries", () => {
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "bank", debit: 1500 }, { account_id: "rent", credit: 1400 }] }, { accounts }).join()).toMatch(/precisam ser iguais/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "bank", debit: 1500 }] }, { accounts }).join()).toMatch(/duas linhas/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "bank", debit: 10, credit: 10 }, { account_id: "rent", credit: 0 }] }, { accounts }).join()).toMatch(/só no débito ou só no crédito/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "group", debit: 10 }, { account_id: "rent", credit: 10 }] }, { accounts }).join()).toMatch(/é um grupo/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "off", debit: 10 }, { account_id: "rent", credit: 10 }] }, { accounts }).join()).toMatch(/inativa/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "x", debit: 10 }, { account_id: "rent", credit: 10 }] }, { accounts }).join()).toMatch(/escolha a conta/);
    });

    it("rejects closed months, dates before the opening and more than two decimals", () => {
        expect(validateEntryDraft(ok, { accounts, closedMonths: new Set(["2026-09"]) }).join()).toMatch(/09\/2026 está fechado/);
        expect(validateEntryDraft(ok, { accounts, openingDate: "2026-10-01" }).join()).toMatch(/anterior ao início/);
        expect(validateEntryDraft({ ...ok, lines: [{ account_id: "bank", debit: 10.005 }, { account_id: "rent", credit: 10.005 }] }, { accounts }).join()).toMatch(/duas casas/);
        expect(validateEntryDraft({ ...ok, entry_date: "2026-02-30" }, { accounts }).join()).toMatch(/Data inválida/);
    });

    it("does not accept automation sources by hand", () => {
        expect(validateEntryDraft({ ...ok, source: "REVERSAL" }, { accounts }).join()).toMatch(/Origem inválida/);
        expect(validateEntryDraft({ ...ok, source: "OPENING" }, { accounts })).toEqual([]);
    });
});

describe("helpers", () => {
    it("adds in cents", () => {
        expect(entryTotals([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }])).toEqual({ debit: 0.3, credit: 0.3, balanced: true });
    });
    it("checks real calendar dates", () => {
        expect(isValidIsoDate("2026-02-28")).toBe(true);
        expect(isValidIsoDate("2026-02-29")).toBe(false);
    });
    it("builds the posting payload", () => {
        const p = toPostPayload({ ...ok, lines: [{ account_id: "bank", debit: 1500, property_id: "" }, { account_id: "rent", credit: 1500, memo: " u1 " }] }, "Fulano");
        expect(p.entry).toEqual({ entry_date: "2026-09-10", description: "Aluguel de setembro", source: "MANUAL", created_by: "Fulano" });
        expect(p.lines[0]).toEqual({ account_id: "bank", debit: 1500, credit: 0, property_id: null, unit_id: null, memo: null });
        expect(p.lines[1].memo).toBe("u1");
    });
    it("signs balances by nature", () => {
        const b = balancesByAccount([{ account_id: "bank", debit: 1500, credit: 0 }, { account_id: "rent", debit: 0, credit: 1500 }, { account_id: "bank", debit: 0, credit: 200 }], accounts);
        expect(b.get("bank")).toBe(1300);
        expect(b.get("rent")).toBe(1500);
    });
    it("maps database errors", () => {
        expect(postingErrorMessage('duplicate key value violates unique constraint "journal_entries_owner_source_ref"')).toBe("Esse lançamento já foi gerado");
        expect(postingErrorMessage("O mês de 09/2026 está fechado: não é possível lançar nele")).toMatch(/fechado/);
    });
});
