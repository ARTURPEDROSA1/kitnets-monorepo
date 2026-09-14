import { describe, expect, it } from "vitest";
import { matchProperty, normalizeMemo, routingProblem, rowsFromExtraction, suggestRouting } from "./bank-ledger";

const props = [{ id: "a", name: "Vale do Sol", aliases: ["Maria Silva"] }, { id: "b", name: "Santo Antonio" }];

describe("normalizeMemo / matchProperty", () => {
    it("strips accents, digits and punctuation", () => {
        expect(normalizeMemo("PIX RECEBIDO 12/09 - Aluguel Vale do Sol #4402")).toBe("pix recebido aluguel vale do sol");
    });
    it("matches by name or alias and rejects ambiguity", () => {
        expect(matchProperty("Pix Maria Silva aluguel", props)).toBe("a");
        expect(matchProperty("TED SANTO ANTÔNIO", props)).toBe("b");
        expect(matchProperty("Vale do Sol e Santo Antonio", props)).toBeNull();
        expect(matchProperty("Tarifa bancária", props)).toBeNull();
    });
});

describe("suggestRouting", () => {
    const rows = [
        { date: "2026-09-05", amount: -3850.04, memo: "PARC CRED IMOB 906687", reference: "1" },
        { date: "2026-09-06", amount: 3950, memo: "PIX RECEBIDO MARIA SILVA", reference: "2" },
        { date: "2026-09-10", amount: -29.9, memo: "TARIFA CESTA", reference: "3" },
        { date: "2026-09-12", amount: -120, memo: "SUPERMERCADO", reference: "4" },
        { date: "2026-09-13", amount: 500, memo: "RENDIMENTO CDB", reference: "5" },
    ];
    it("uses history first, then kind and memo matching", () => {
        const history = [{ memo: "PARC CRED IMOB 906687", destination: "INVESTMENT" as const, property_id: "a", kind: "PRESTACAO" as const, created_at: "2026-08-01" }];
        const out = suggestRouting(rows, "OFX", props, history, new Set(["3"]));
        expect(out[0]).toMatchObject({ destination: "INVESTMENT", property_id: "a", kind: "PRESTACAO", reason: "history" });
        expect(out[1]).toMatchObject({ destination: "INCOME", property_id: "a", reason: "memo" });
        expect(out[2]).toMatchObject({ destination: "INVESTMENT", kind: "TARIFA", property_id: null, duplicate: true });
        expect(out[3]).toMatchObject({ destination: "IGNORED", kind: null });
        expect(out[4]).toMatchObject({ destination: "IGNORED" });
    });
    it("falls back to the only property", () => {
        const out = suggestRouting(rows.slice(2, 3), "CSV", [props[1]], [], new Set());
        expect(out[0]).toMatchObject({ destination: "INVESTMENT", property_id: "b", reason: "single-property" });
    });
});

describe("routingProblem", () => {
    it("flags what is missing", () => {
        expect(routingProblem({ destination: "IGNORED", property_id: null, kind: null, amount: -1, duplicate: false })).toBeNull();
        expect(routingProblem({ destination: "INVESTMENT", property_id: null, kind: "TARIFA", amount: -1, duplicate: false })).toBe("escolha o imóvel");
        expect(routingProblem({ destination: "INVESTMENT", property_id: "a", kind: null, amount: -1, duplicate: false })).toBe("escolha o tipo");
        expect(routingProblem({ destination: "INVESTMENT", property_id: "a", kind: "TARIFA", amount: 10, duplicate: false })).toBe("investimento precisa ser uma saída");
        expect(routingProblem({ destination: "INCOME", property_id: "a", kind: null, amount: -10, duplicate: false })).toBe("receita precisa ser uma entrada");
        expect(routingProblem({ destination: "INCOME", property_id: "a", kind: null, amount: 10, duplicate: true })).toBe("já importado");
    });
});

describe("rowsFromExtraction", () => {
    it("normalises AI rows and drops invalid ones", () => {
        const rows = rowsFromExtraction({ rows: [
            { date: "2026-09-05", amount: "-3.850,04", memo: "Parc Cred Imob" },
            { date: "05/09/2026", amount: 10, memo: "bad date" },
            { date: "2026-09-06", amount: 0, memo: "zero" },
            { date: "2026-09-07", amount: 3950, description: "Pix" },
        ] }, (d, a, m) => `${d}|${a}|${m}`);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ amount: -3850.04, memo: "Parc Cred Imob", reference: "2026-09-05|-3850.04|Parc Cred Imob" });
        expect(rows[1].memo).toBe("Pix");
    });
});
