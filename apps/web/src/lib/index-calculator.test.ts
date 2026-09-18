import { describe, expect, it } from "vitest";
import { CALCULATOR_INDEXES, fipezapCalculatorCode, minimumWageMonthlySeries, resolveCalculatorIndex } from "./index-calculator";

describe("CALCULATOR_INDEXES", () => {
    it("covers every index page", () => {
        expect(Object.keys(CALCULATOR_INDEXES).sort()).toEqual(["CDI", "FIPEZAP-LOCACAO", "FIPEZAP-VENDA", "IGPM", "INPC", "IPCA", "IVAR", "REAJUSTE-SALARIO-MINIMO", "SELIC"]);
    });
    it("words each index properly", () => {
        expect(CALCULATOR_INDEXES.IGPM.label).toBe("IGP-M");
        expect(CALCULATOR_INDEXES.SELIC).toMatchObject({ label: "Selic", feminine: true });
        expect(CALCULATOR_INDEXES.IPCA.feminine).toBeUndefined();
    });
});

describe("resolveCalculatorIndex", () => {
    it("finds a plain code in any case, for all bedrooms", () => {
        expect(resolveCalculatorIndex("ipca")).toEqual({ code: "IPCA", spec: CALCULATOR_INDEXES.IPCA, dormitorios: "total" });
        expect(resolveCalculatorIndex("FIPEZAP-VENDA")).toMatchObject({ code: "FIPEZAP-VENDA", dormitorios: "total" });
    });
    it("reads a bedroom suffix on the FipeZap codes only", () => {
        expect(resolveCalculatorIndex("fipezap-venda-2")).toEqual({ code: "FIPEZAP-VENDA", spec: CALCULATOR_INDEXES["FIPEZAP-VENDA"], dormitorios: "2" });
        expect(resolveCalculatorIndex("FIPEZAP-LOCACAO-4")).toMatchObject({ code: "FIPEZAP-LOCACAO", dormitorios: "4" });
        expect(resolveCalculatorIndex("FIPEZAP-VENDA-5")).toBeNull();
        expect(resolveCalculatorIndex("FIPEZAP-VENDA-TOTAL")).toBeNull();
        expect(resolveCalculatorIndex("IPCA-2")).toBeNull();
        expect(resolveCalculatorIndex("NOPE")).toBeNull();
    });
    it("round-trips the codes the FipeZap calculator builds", () => {
        expect(fipezapCalculatorCode("venda", "total")).toBe("FIPEZAP-VENDA");
        expect(fipezapCalculatorCode("locacao", "3")).toBe("FIPEZAP-LOCACAO-3");
        expect(resolveCalculatorIndex(fipezapCalculatorCode("locacao", "3"))).toMatchObject({ code: "FIPEZAP-LOCACAO", dormitorios: "3" });
    });
});

describe("minimumWageMonthlySeries", () => {
    const rows = [
        { reference_date: "2027-01-01", amount_brl: 1700, is_projection: true },
        { reference_date: "2026-01-01", amount_brl: 1621, is_projection: false },
        { reference_date: "2025-01-01", amount_brl: 1518, is_projection: false },
        { reference_date: "2024-01-01", amount_brl: 1412, is_projection: false },
    ];
    it("is 0 every month except the month a new wage took effect", () => {
        const s = minimumWageMonthlySeries(rows, "2026-03");
        expect(s[0]).toEqual({ month: "2024-01", value: 0 });
        expect(s).toHaveLength(27);
        expect(s.filter(p => p.value !== 0).map(p => p.month)).toEqual(["2025-01", "2026-01"]);
        expect(s.find(p => p.month === "2026-01")!.value).toBeCloseTo((1621 / 1518 - 1) * 100, 10);
    });
    it("compounds back to the ratio of the wages, which is what the calculator does", () => {
        const s = minimumWageMonthlySeries(rows, "2026-03");
        // calculator rule: apply from the month after the start through the end month
        const factor = s.filter(p => p.month > "2024-06" && p.month <= "2026-03").reduce((f, p) => f * (1 + p.value / 100), 1);
        expect(1412 * factor).toBeCloseTo(1621, 8);
    });
    it("leaves out projections and future rows, and compounds two changes in one month", () => {
        expect(minimumWageMonthlySeries(rows, "2026-03").some(p => p.month > "2026-03")).toBe(false);
        expect(minimumWageMonthlySeries(rows, "2027-02").find(p => p.month === "2027-01")!.value).toBe(0);   // projection ignored
        const twice = minimumWageMonthlySeries([{ reference_date: "2020-01-01", amount_brl: 1000 }, { reference_date: "2020-02-01", amount_brl: 1039 }, { reference_date: "2020-02-15", amount_brl: 1045 }], "2020-03");
        expect(twice.find(p => p.month === "2020-02")!.value).toBeCloseTo(4.5, 8);
        expect(minimumWageMonthlySeries([], "2026-03")).toEqual([]);
    });
});
