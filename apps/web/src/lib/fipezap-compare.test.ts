import { describe, expect, it } from "vitest";
import { annualiseYield, average, compound, decemberDates, deltaClass, fill, filterFrom, fmtBRL, fmtPct, monthLong, monthShort, rankBy, rankPosition, rebaseSeries, yearlyHeatClass } from "./fipezap-compare";

describe("formatting", () => {
    it("formats percentages with a sign and a real minus", () => {
        expect(fmtPct(0.76)).toBe("+0,76%");
        expect(fmtPct(-1.2)).toBe("−1,20%");
        expect(fmtPct(0)).toBe("0,00%");
        expect(fmtPct(6.5, { digits: 1, sign: false })).toBe("6,5%");
        expect(fmtPct(6.5, { lang: "en" })).toBe("+6.50%");
        expect(fmtPct(null)).toBe("–");
    });
    it("formats reais with sensible decimals", () => {
        expect(fmtBRL(9954).replace(/ /g, " ")).toBe("R$ 9.954");
        expect(fmtBRL(53.79).replace(/ /g, " ")).toBe("R$ 53,79");
        expect(fmtBRL(undefined)).toBe("–");
    });
    it("names months", () => {
        expect(monthShort("2026-08-01")).toBe("ago/26");
        expect(monthShort("2026-08-01", "en")).toBe("Aug/26");
        expect(monthLong("2026-08-01")).toBe("agosto de 2026");
        expect(monthLong("2026-08-01", "en")).toBe("August 2026");
        expect(monthLong("2026-08-01", "es")).toBe("agosto de 2026");
    });
});

describe("arithmetic", () => {
    it("compounds, annualises and averages, ignoring gaps", () => {
        expect(compound([1, 1])).toBeCloseTo(2.01, 6);
        expect(compound([null, 2, undefined])).toBeCloseTo(2, 6);
        expect(compound([])).toBeNull();
        expect(annualiseYield(0.5)).toBeCloseTo(6.1678, 3);
        expect(annualiseYield(null)).toBeNull();
        expect(average([1, null, 3])).toBe(2);
        expect(average([])).toBeNull();
    });
    it("rebases from FIPE's levels when available, else by compounding", () => {
        const monthly = [{ month: "2024-01-01", value: 1 }, { month: "2024-02-01", value: 1 }, { month: "2024-03-01", value: -1 }];
        const byMonthly = rebaseSeries(monthly, "2024-02-01");
        expect(byMonthly.map(p => p.month)).toEqual(["2024-02-01", "2024-03-01"]);
        expect(byMonthly[0].value).toBe(100);
        expect(byMonthly[1].value).toBeCloseTo(99, 6);
        const levels = [{ month: "2024-03-01", value: 210 }, { month: "2024-01-01", value: 200 }, { month: "2024-02-01", value: 205 }];
        const byLevels = rebaseSeries(monthly, "2024-02-01", levels);
        expect(byLevels.map(p => Math.round(p.value * 100) / 100)).toEqual([100, 102.44]);
        expect(rebaseSeries(monthly, "2024-02-01", [])).toHaveLength(2);
    });
    it("filters by month and lists Decembers", () => {
        const pts = [{ month: "2020-01-01" }, { month: "2021-06-01" }, { month: "2022-12-01" }];
        expect(filterFrom(pts, "2021-01-01")).toHaveLength(2);
        expect(filterFrom(pts, null, "2021-12-01")).toHaveLength(2);
        expect(decemberDates(2012, 2014)).toEqual(["2012-12-01", "2013-12-01", "2014-12-01"]);
    });
    it("ranks with nulls last and stable ties", () => {
        const rows = [{ slug: "a", v: 1 }, { slug: "b", v: null }, { slug: "c", v: 3 }, { slug: "d", v: 1 }];
        expect(rankBy(rows, r => r.v).map(r => r.slug)).toEqual(["c", "a", "d", "b"]);
        expect(rankBy(rows, r => r.v, "asc").map(r => r.slug)).toEqual(["a", "d", "c", "b"]);
        expect(rankPosition(rankBy(rows, r => r.v), "d")).toBe(3);
        expect(rankPosition(rows, "zz")).toBeNull();
    });
});

describe("classes and templates", () => {
    it("colours the yearly cells against inflation", () => {
        expect(yearlyHeatClass(null, 4)).toMatch(/muted/);
        expect(yearlyHeatClass(15, 4)).toMatch(/bg-emerald-500/);
        expect(yearlyHeatClass(9, 4)).toMatch(/bg-emerald-200/);
        expect(yearlyHeatClass(6, 4)).toMatch(/bg-emerald-50/);
        expect(yearlyHeatClass(4.5, 4)).toMatch(/bg-muted/);
        expect(yearlyHeatClass(-6, 4)).toMatch(/bg-rose-500/);
        expect(yearlyHeatClass(-1, 4)).toMatch(/bg-rose-200/);
        expect(yearlyHeatClass(2, 4)).toMatch(/bg-rose-50/);
        expect(yearlyHeatClass(2, null)).toMatch(/bg-emerald-50/);
    });
    it("colours deltas by sign only", () => {
        expect(deltaClass(0.3)).toMatch(/emerald/);
        expect(deltaClass(-0.3)).toMatch(/rose/);
        expect(deltaClass(0)).toBe("text-muted-foreground");
        expect(deltaClass(null)).toBe("text-muted-foreground");
    });
    it("fills templates and leaves unknown placeholders visible", () => {
        expect(fill("{a} e {b}", { a: "x", b: 2 })).toBe("x e 2");
        expect(fill("{a} e {c}", { a: "x", c: null })).toBe("x e {c}");
    });
});
