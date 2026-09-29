import { describe, expect, it } from "vitest";
import { chartTemplate, compareCodes, modelAccountActivation, parentCode, typeFromCode, validateNewAccount } from "./accounting-chart";

describe("chartTemplate", () => {
    const chart = chartTemplate("COST");
    const byCode = new Map(chart.map(a => [a.code, a]));

    it("every account has its parent group, and only groups have children", () => {
        for (const a of chart) {
            const p = parentCode(a.code);
            if (!p) continue;
            expect(byCode.get(p), `parent of ${a.code}`).toBeDefined();
            expect(byCode.get(p)!.analytic, `${p} must be a group`).toBe(false);
        }
    });

    it("codes and system keys are unique", () => {
        expect(new Set(chart.map(a => a.code)).size).toBe(chart.length);
        const keys = chart.map(a => a.systemKey).filter(Boolean);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("analytic accounts carry a system key; groups do not", () => {
        for (const a of chart) expect(Boolean(a.systemKey)).toBe(a.analytic);
    });

    it("types follow the code and contra accounts have the opposite nature", () => {
        expect(byCode.get("2.3.1.01")!.type).toBe("PL");
        expect(byCode.get("2.1.1.01")!.type).toBe("PASSIVO");
        expect(byCode.get("1.2.2.05")!.nature).toBe("C");   // depreciação acumulada
        expect(byCode.get("3.2.1.01")!.nature).toBe("D");   // dedução da receita
        expect(byCode.get("2.3.1.02")!.nature).toBe("D");   // capital a integralizar
        expect(byCode.get("1.1.5.01")!.active).toBe(false); // estoque de imóveis
    });

    it("the measurement model switches depreciation and fair-value accounts", () => {
        const cost = new Map(chartTemplate("COST").map(a => [a.systemKey, a.active]));
        const fv = new Map(chartTemplate("FAIR_VALUE").map(a => [a.systemKey, a.active]));
        expect(cost.get("DESP_DEPRECIACAO_PPI")).toBe(true);
        expect(cost.get("PPI_AJUSTE_VALOR_JUSTO")).toBe(false);
        expect(fv.get("DESP_DEPRECIACAO_PPI")).toBe(false);
        expect(fv.get("GANHO_AVJ")).toBe(true);
        expect(modelAccountActivation("FAIR_VALUE").RESERVA_AVJ).toBe(true);
    });
});

describe("codes", () => {
    it("orders numerically", () => {
        expect(["1.10", "1.9", "1.2.1", "2"].sort(compareCodes)).toEqual(["1.2.1", "1.9", "1.10", "2"]);
    });
    it("types by prefix", () => {
        expect(typeFromCode("2.3")).toBe("PL");
        expect(typeFromCode("2.31")).toBe("PASSIVO");
        expect(typeFromCode("5.1")).toBeNull();
    });
});

describe("validateNewAccount", () => {
    const existing = chartTemplate("COST").map(a => ({ code: a.code, analytic: a.analytic, nature: a.nature, account_type: a.type }));

    it("adds an analytic account under a group, inheriting the nature", () => {
        const r = validateNewAccount({ code: "4.1.1.10", name: "Limpeza", analytic: true }, existing);
        expect(r).toEqual({ row: { code: "4.1.1.10", name: "Limpeza", account_type: "DESPESA", nature: "D", analytic: true } });
    });

    it("rejects duplicates, missing groups and children of analytic accounts", () => {
        expect(validateNewAccount({ code: "4.1.1.01", name: "x", analytic: true }, existing)).toHaveProperty("error");
        expect(validateNewAccount({ code: "4.9.9.01", name: "x", analytic: true }, existing)).toHaveProperty("error");
        expect(validateNewAccount({ code: "4.1.1.01.1", name: "x", analytic: true }, existing)).toHaveProperty("error");
        expect(validateNewAccount({ code: "abc", name: "x", analytic: true }, existing)).toHaveProperty("error");
        expect(validateNewAccount({ code: "4.1.1.10", name: " ", analytic: true }, existing)).toHaveProperty("error");
    });
});
