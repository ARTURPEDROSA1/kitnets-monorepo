import { describe, expect, it } from "vitest";
import {
    inferTotalPrice,
    indexCode,
    investmentKind,
    isEmptyInvestmentExtraction,
    normalizeInvestmentExtraction,
    periodicityFromSpan,
} from "./new-investment-extract";

/** What a model returns for the studio's quadro resumo, with the sloppiness models actually show. */
const quadroResumo = {
    investment: {
        name: "Sun Place",
        unit_label: "Studio 204",
        kind: "studio",
        developer: "Acácio SPE",
        total_price: "R$ 141.900,00",
        down_payment: "14.190,00",
        financed_amount: 127710,
        contract_date: "01/07/2026",
        keys_expected_on: null,
        index_before_keys: "índice positivo acumulado do INCC-M",
        index_after_keys: "IGP-M",
        state: "sc",
        postal_code: "88220-000",
    },
    schedules: [
        { label: "Entrada", kind: "ENTRADA", installments: 2, amount: "7.095,00", first_due_on: "31/08/2026", last_due_on: "30/09/2026", periodicity: "mensal", index_code: "Sem correção" },
        { label: "Parcelas mensais", installments: 36, amount: 3547.5, first_due_on: "20/10/2026", last_due_on: "20/09/2029", periodicity: "mensal", index_code: "INCC-M" },
    ],
};

describe("normalizeInvestmentExtraction", () => {
    const data = normalizeInvestmentExtraction(quadroResumo);

    it("reads Brazilian money and dates", () => {
        expect(data.investment.total_price).toBe(141900);
        expect(data.investment.down_payment).toBe(14190);
        expect(data.investment.contract_date).toBe("2026-07-01");
    });

    it("maps the index the way the contract writes it", () => {
        expect(data.investment.index_before_keys).toBe("INCC");
        expect(data.investment.index_after_keys).toBe("IGPM");
        expect(data.schedules[0].index_code).toBe("NONE");
        expect(data.schedules[1].index_code).toBe("INCC");
    });

    it("keeps each block of the quadro resumo apart", () => {
        expect(data.schedules).toHaveLength(2);
        expect(data.schedules[0]).toMatchObject({ kind: "ENTRADA", installments: 2, amount: 7095, first_due_on: "2026-08-31" });
        expect(data.schedules[1]).toMatchObject({ kind: "PARCELA", installments: 36, amount: 3547.5, first_due_on: "2026-10-20" });
    });

    it("normalises the state and the CEP", () => {
        expect(data.investment.state).toBe("SC");
        expect(data.investment.postal_code).toBe("88220000");
    });

    it("survives an empty object", () => {
        const empty = normalizeInvestmentExtraction({});
        expect(empty.schedules).toEqual([]);
        expect(empty.investment.total_price).toBeNull();
        expect(isEmptyInvestmentExtraction(empty)).toBe(true);
    });

    it("accepts the investment fields at the top level", () => {
        const flat = normalizeInvestmentExtraction({ name: "Infinity Paradise", total_price: 240000, schedules: [] });
        expect(flat.investment.name).toBe("Infinity Paradise");
        expect(flat.investment.total_price).toBe(240000);
    });

    it("drops a block with neither a date nor an amount", () => {
        const data = normalizeInvestmentExtraction({ schedules: [{ label: "?", installments: 3 }] });
        expect(data.schedules).toEqual([]);
    });

    it("reads a month-only due date as the first of that month", () => {
        const data = normalizeInvestmentExtraction({ schedules: [{ label: "Parcelas", amount: 1000, first_due_on: "10/2026", installments: 1 }] });
        expect(data.schedules[0].first_due_on).toBe("2026-10-01");
    });

    it("calls an annual block by its own kind", () => {
        // clause (d): 11 parcelas anuais de R$ 5.995,45 a partir de 15/03/2027
        const data = normalizeInvestmentExtraction({
            schedules: [{ label: "Parcelas anuais", installments: 11, amount: 5995.45, first_due_on: "15/03/2027", last_due_on: "15/03/2037", periodicity: "anual" }],
        });
        expect(data.schedules[0]).toMatchObject({ kind: "PARCELA_ANUAL", periodicity: "ANNUAL" });
    });

    it("believes the dates over a mislabelled periodicity", () => {
        const data = normalizeInvestmentExtraction({
            schedules: [{ label: "Anuais", installments: 11, amount: 5995.45, first_due_on: "15/03/2027", last_due_on: "15/03/2037", periodicity: "mensal" }],
        });
        expect(data.schedules[0].periodicity).toBe("ANNUAL");
    });
});

describe("payment kinds", () => {
    it("reads the start of the works as its own kind, not as the keys", () => {
        // clause (e): "R$ 19.000,00 … no início de obras"
        const data = normalizeInvestmentExtraction({
            schedules: [{ label: "Pagamento no início de obras", installments: 1, amount: 19000, first_due_on: "17/03/2026", periodicity: "SINGLE" }],
        });
        expect(data.schedules[0].kind).toBe("INICIO_OBRAS");
    });

    it("still reads the handover instalment as CHAVES", () => {
        const data = normalizeInvestmentExtraction({
            schedules: [{ label: "Parcela na entrega das chaves", installments: 1, amount: 50000, first_due_on: "20/09/2029", periodicity: "SINGLE" }],
        });
        expect(data.schedules[0].kind).toBe("CHAVES");
    });

    it("accepts the kind when the model names it outright", () => {
        const data = normalizeInvestmentExtraction({
            schedules: [{ label: "Bloco E", kind: "INICIO_OBRAS", installments: 1, amount: 19000, first_due_on: "17/03/2026" }],
        });
        expect(data.schedules[0].kind).toBe("INICIO_OBRAS");
    });
});

describe("periodicityFromSpan", () => {
    it("reads the step between the first and the last due date", () => {
        expect(periodicityFromSpan(36, "2026-10-20", "2029-09-20")).toBe("MONTHLY");
        expect(periodicityFromSpan(11, "2027-03-15", "2037-03-15")).toBe("ANNUAL");
        expect(periodicityFromSpan(4, "2026-01-10", "2027-07-10")).toBe("SEMIANNUAL");
        expect(periodicityFromSpan(3, "2026-01-10", "2026-07-10")).toBe("QUARTERLY");
    });

    it("says nothing when there is nothing to infer from", () => {
        expect(periodicityFromSpan(1, "2026-01-10", "2026-01-10")).toBeNull();
        expect(periodicityFromSpan(12, "2026-01-10", null)).toBeNull();
    });
});

describe("investmentKind", () => {
    it("recognises the words a contract uses", () => {
        expect(investmentKind("vaga de garagem")).toBe("PARKING");
        expect(investmentKind("STUDIO")).toBe("STUDIO");
        expect(investmentKind("sala comercial")).toBe("COMMERCIAL");
        expect(investmentKind("lote")).toBe("LOT");
        expect(investmentKind(null)).toBe("APARTMENT");
    });
});

describe("indexCode", () => {
    it("defaults to no correction and never invents one", () => {
        expect(indexCode(null)).toBe("NONE");
        expect(indexCode("Sem correção")).toBe("NONE");
        expect(indexCode("CUB positivo do mês")).toBe("CUB");
        expect(indexCode("tabela própria da construtora")).toBe("OTHER");
    });
});

describe("inferTotalPrice", () => {
    it("keeps the price the contract states", () => {
        expect(inferTotalPrice(normalizeInvestmentExtraction(quadroResumo))).toBe(141900);
    });

    it("adds the plan up when no price is stated", () => {
        const data = normalizeInvestmentExtraction({ schedules: quadroResumo.schedules });
        // 2 × 7.095 + 36 × 3.547,50
        expect(inferTotalPrice(data)).toBe(141900);
    });

    it("is null when there is nothing to add", () => {
        expect(inferTotalPrice(normalizeInvestmentExtraction({}))).toBeNull();
    });
});
