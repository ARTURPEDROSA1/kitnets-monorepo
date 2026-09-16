import { describe, expect, it } from "vitest";
import { groupMonthly, inPeriod, monthLabel, periodLabel, periodRange } from "./period-filter";

const now = new Date(2026, 8, 15);   // 15/set/2026

describe("periodRange / periodLabel", () => {
    it("Este ano runs from January to the current month", () => {
        expect(periodRange({ kind: "ytd" }, now)).toEqual({ start: "2026-01", end: "2026-09" });
        expect(periodLabel({ kind: "ytd" }, now)).toBe("2026 até set/2026");
    });
    it("N anos are the last 12·N months including the current one", () => {
        expect(periodRange({ kind: "1y" }, now)).toEqual({ start: "2025-10", end: "2026-09" });
        expect(periodRange({ kind: "3y" }, now)).toEqual({ start: "2023-10", end: "2026-09" });
    });
    it("custom swaps a reversed range and tolerates missing ends", () => {
        expect(periodRange({ kind: "custom", start: "2026-06", end: "2026-01" })).toEqual({ start: "2026-01", end: "2026-06" });
        expect(periodRange({ kind: "custom", start: "2025-03" })).toEqual({ start: "2025-03", end: null });
        expect(periodLabel({ kind: "custom", start: "2025-03" })).toBe("desde mar/2025");
    });
    it("inPeriod is inclusive on both ends", () => {
        const r = { start: "2026-01", end: "2026-03" };
        expect(inPeriod("2026-01", r)).toBe(true);
        expect(inPeriod("2026-03", r)).toBe(true);
        expect(inPeriod("2026-04", r)).toBe(false);
        expect(inPeriod("2019-12", { start: null, end: null })).toBe(true);
    });
    it("monthLabel renders the short Portuguese month", () => {
        expect(monthLabel("2026-08")).toBe("ago/2026");
    });
});

describe("groupMonthly", () => {
    const pts = [
        { key: "2025-11", month: "nov/2025", receita: 100, despesas: 10, previsto: false, note: "a" },
        { key: "2025-12", month: "dez/2025", receita: 100, despesas: 10.005, previsto: false, note: "b" },
        { key: "2026-01", month: "jan/2026", receita: 200, despesas: 20, previsto: false, note: "c" },
        { key: "2026-02", month: "fev/2026", receita: 200, despesas: 20, previsto: true, note: "d" },
        { key: "2026-04", month: "abr/2026", receita: 300, despesas: 30, previsto: false, note: "e" },
    ];
    it("month leaves the points untouched", () => {
        expect(groupMonthly(pts, "month")).toBe(pts);
    });
    it("quarter sums numbers, ORs booleans and keeps the first text", () => {
        expect(groupMonthly(pts, "quarter")).toEqual([
            { key: "2025-T4", month: "4T/2025", receita: 200, despesas: 20.01, previsto: false, note: "a" },
            { key: "2026-T1", month: "1T/2026", receita: 400, despesas: 40, previsto: true, note: "c" },
            { key: "2026-T2", month: "2T/2026", receita: 300, despesas: 30, previsto: false, note: "e" },
        ]);
    });
    it("year groups by calendar year", () => {
        expect(groupMonthly(pts, "year").map(p => [p.key, p.month, p.receita])).toEqual([["2025", "2025", 200], ["2026", "2026", 700]]);
    });
    it("a specific quarter keeps only that quarter of each year", () => {
        expect(groupMonthly(pts, "q1").map(p => [p.key, p.receita])).toEqual([["2026-T1", 400]]);
        expect(groupMonthly(pts, "q3")).toEqual([]);
    });
});
