import { describe, expect, it } from "vitest";
import { chartTemplate } from "./accounting-chart";
import {
    BANK_OPTIONS, KIND_TO_KEY, answerHistory, bankEntryPayload, resolveAnswer, ruleFor, suggestCounterpart,
    type BankRowForPosting, type SuggestContext,
} from "./accounting-bank-posting";
import { keepFilledIncomeMonths, type RoutedRow } from "./bank-ledger";
import { chunk, fetchAllPages } from "./accounting-server";

const accounts = chartTemplate("COST").map((a, i) => ({ id: `a${i}`, code: a.code, analytic: a.analytic, active: a.active, system_key: a.systemKey }));
const byKey = new Map(accounts.filter(a => a.system_key).map(a => [a.system_key!, a]));
const id = (key: string) => byKey.get(key)!.id;
const ctx = (history = new Map()): SuggestContext => ({ accountsByKey: byKey, accountsById: new Map(accounts.map(a => [a.id, a])), history });

const row = (p: Partial<BankRowForPosting>): BankRowForPosting => ({
    id: "r1", occurred_on: "2026-09-10", amount: -100, memo: "", destination: "IGNORED", property_id: null, kind: null, account_id: null, account_option: null, ...p,
});

describe("options and kinds", () => {
    it("every option and kind points to a template account", () => {
        for (const o of BANK_OPTIONS) expect(byKey.has(o.systemKey), o.id).toBe(true);
        for (const k of Object.values(KIND_TO_KEY)) expect(byKey.has(k), k).toBe(true);
    });
});

describe("suggestCounterpart", () => {
    it("the owner's answer wins", () => {
        const s = suggestCounterpart(row({ memo: "Tarifa pacote", account_id: id("DESP_MANUTENCAO"), account_option: "MANUTENCAO" }), ctx());
        expect(s.counterpart).toEqual({ accountId: id("DESP_MANUTENCAO"), source: "ANSWER", optionId: "MANUTENCAO" });
    });

    it("uses the routing from the import: income month and investment kind", () => {
        expect(suggestCounterpart(row({ amount: 1500, destination: "INCOME", memo: "PIX recebido" }), ctx()).counterpart?.accountId).toBe(id("ALUGUEIS_A_RECEBER"));
        expect(suggestCounterpart(row({ destination: "INVESTMENT", kind: "REFORMA" }), ctx()).counterpart).toEqual({ accountId: id("PPI_BENFEITORIAS"), source: "ROUTING", optionId: null });
        expect(suggestCounterpart(row({ destination: "INVESTMENT", kind: "PRESTACAO" }), ctx()).counterpart?.accountId).toBe(id("FINANCIAMENTOS_CP"));
    });

    it("learns from a previous answer with the same memo shape", () => {
        const history = answerHistory([{ memo: "PIX ENVIADO Joao Silva 123", account_id: id("LUCROS_A_DISTRIBUIR"), account_option: "DISTRIBUICAO", occurred_on: "2026-08-01" }]);
        const s = suggestCounterpart(row({ memo: "PIX ENVIADO Joao Silva 456" }), ctx(history));
        expect(s.counterpart).toEqual({ accountId: id("LUCROS_A_DISTRIBUIR"), source: "HISTORY", optionId: "DISTRIBUICAO" });
    });

    it("posts unambiguous memo rules and asks about the others", () => {
        expect(suggestCounterpart(row({ memo: "TARIFA PACOTE SERVICOS" }), ctx()).counterpart?.accountId).toBe(id("DESP_TARIFAS"));
        expect(suggestCounterpart(row({ memo: "Pagamento IPTU 2026 parcela 3" }), ctx()).counterpart?.accountId).toBe(id("DESP_IPTU"));
        expect(suggestCounterpart(row({ memo: "CEMIG DISTRIBUICAO" }), ctx()).counterpart?.accountId).toBe(id("DESP_UTILIDADES"));
        expect(suggestCounterpart(row({ amount: 12.34, memo: "RENDIMENTO POUPANCA" }), ctx()).counterpart?.accountId).toBe(id("RECEITA_APLICACOES"));

        const darf = suggestCounterpart(row({ memo: "PAGAMENTO DARF 2089" }), ctx());
        expect(darf.counterpart).toBeNull();
        expect(darf.suggestedOptionId).toBe("DARF_IRPJ");
        const obra = suggestCounterpart(row({ memo: "LEROY MERLIN" }), ctx());
        expect(obra.counterpart).toBeNull();
        expect(obra.suggestedOptionId).toBe("BENFEITORIA");
        expect(suggestCounterpart(row({ memo: "PIX ENVIADO Fulano" }), ctx())).toEqual({ counterpart: null, suggestedOptionId: null });
    });

    it("ignores an answer or history for an inactive account", () => {
        const off = new Map(accounts.map(a => [a.id, a.system_key === "DESP_MANUTENCAO" ? { ...a, active: false } : a]));
        const s = suggestCounterpart(row({ memo: "x", account_id: id("DESP_MANUTENCAO") }), { ...ctx(), accountsById: off });
        expect(s.counterpart).toBeNull();
    });
});

describe("money in tied to a property", () => {
    it("asks, with rent preselected", () => {
        expect(suggestCounterpart(row({ amount: 900, memo: "PIX RECEBIDO MARIA SOUZA", property_id: "p1" }), ctx())).toEqual({ counterpart: null, suggestedOptionId: "ALUGUEL" });
    });
});

describe("keepFilledIncomeMonths", () => {
    const routed = (p: Partial<RoutedRow>): RoutedRow => ({ date: "2025-03-05", amount: 1000, memo: "PIX", reference: "x", source: "OFX", destination: "INCOME", property_id: "p1", kind: null, duplicate: false, reason: "memo", ...p });
    it("keeps deposits out of months that already have income rows", () => {
        const out = keepFilledIncomeMonths([routed({}), routed({ date: "2025-04-05" }), routed({ destination: "INVESTMENT", kind: "REFORMA", amount: -10 })], new Set(["p1|2025-03"]));
        expect(out[0]).toMatchObject({ destination: "IGNORED", reason: "income-exists" });
        expect(out[1]).toMatchObject({ destination: "INCOME", reason: "memo" });
        expect(out[2]).toMatchObject({ destination: "INVESTMENT" });
    });
});

describe("paging helpers", () => {
    it("pages until a short page and slices long lists", async () => {
        const all = Array.from({ length: 2500 }, (_, i) => i);
        const calls: Array<[number, number]> = [];
        const got = await fetchAllPages<number>(async (a, b) => { calls.push([a, b]); return { data: all.slice(a, b + 1), error: null }; });
        expect(got).toHaveLength(2500);
        expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
});

describe("ruleFor", () => {
    it("depends on the direction", () => {
        expect(ruleFor("RESGATE CDB", "IN")).toEqual({ option: "RESGATE", confident: true });
        expect(ruleFor("APLICACAO CDB", "OUT")).toEqual({ option: "APLICACAO", confident: true });
        expect(ruleFor("", "OUT")).toBeNull();
    });
});

describe("bankEntryPayload", () => {
    it("money in debits the bank; money out credits it; the property tags the counterpart", () => {
        const inflow = bankEntryPayload(row({ amount: 1500, memo: " PIX  recebido ", property_id: "p1" }), "bank", "cp");
        expect(inflow.entry).toEqual({ entry_date: "2026-09-10", description: "Extrato: PIX recebido", source: "BANK", source_ref: "r1", created_by: "Automação (extrato)" });
        expect(inflow.lines).toEqual([
            { account_id: "bank", debit: 1500, credit: 0, property_id: null, unit_id: null, memo: null },
            { account_id: "cp", debit: 0, credit: 1500, property_id: "p1", unit_id: null, memo: null },
        ]);
        const outflow = bankEntryPayload(row({ amount: -80.456 }), "bank", "cp");
        expect(outflow.lines[0]).toMatchObject({ account_id: "cp", debit: 80.46, credit: 0 });
        expect(outflow.lines[1]).toMatchObject({ account_id: "bank", debit: 0, credit: 80.46 });
        expect(outflow.entry.description).toBe("Lançamento do extrato");
    });
});

describe("resolveAnswer", () => {
    it("checks the option's direction and the account", () => {
        expect(resolveAnswer(-50, { option: "MANUTENCAO" }, ctx())).toEqual({ accountId: id("DESP_MANUTENCAO"), optionId: "MANUTENCAO" });
        expect(resolveAnswer(50, { option: "MANUTENCAO" }, ctx())).toHaveProperty("error");
        expect(resolveAnswer(50, { option: "NOPE" }, ctx())).toHaveProperty("error");
        expect(resolveAnswer(50, { account_id: id("OUTRAS_RECEITAS") }, ctx())).toEqual({ accountId: id("OUTRAS_RECEITAS"), optionId: null });
        expect(resolveAnswer(50, { account_id: byKey.get("OUTRAS_RECEITAS")!.id.replace(/\d+/, "9999") }, ctx())).toHaveProperty("error");
        expect(resolveAnswer(50, {}, ctx())).toHaveProperty("error");
    });
});
