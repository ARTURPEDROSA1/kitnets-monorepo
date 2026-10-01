import { describe, expect, it } from "vitest";
import { MONTHLY_PRESETS, YEARLY_PRESETS, addMonths, clampRange, defaultMonthlyPeriod, filterByRange, formatMonthYear, formatRangeLabel, presetIsRedundant, presetRange, summarizeSeries } from "./index-period";

describe("defaultMonthlyPeriod", () => {
    it("opens on the year to date once it has two months, on six months before that", () => {
        expect(defaultMonthlyPeriod("2026-09-01")).toBe("ytd");
        expect(defaultMonthlyPeriod("2026-02-01")).toBe("ytd");
        expect(defaultMonthlyPeriod("2026-01-01")).toBe("6m");
        expect(defaultMonthlyPeriod("")).toBe("6m");
        expect(defaultMonthlyPeriod(undefined)).toBe("6m");
    });
});

const preset = (key: string, list = MONTHLY_PRESETS) => list.find((p) => p.key === key)!;

describe("presetRange (monthly series)", () => {
    const earliest = "1995-01-01";
    const latest = "2026-08-01";

    it("counts published months back from the latest point, the latest one included", () => {
        expect(presetRange(preset("6m"), earliest, latest)).toEqual({ start: "2026-03-01", end: latest });
        expect(presetRange(preset("1y"), earliest, latest)).toEqual({ start: "2025-09-01", end: latest });
        expect(presetRange(preset("5y"), earliest, latest)).toEqual({ start: "2021-09-01", end: latest });
    });

    it("YTD runs from January of the latest point's year; Máx is the whole series", () => {
        expect(presetRange(preset("ytd"), earliest, latest)).toEqual({ start: "2026-01-01", end: latest });
        expect(presetRange(preset("max"), earliest, latest)).toEqual({ start: earliest, end: latest });
    });

    it("never starts before the series does, and says when a preset would show everything anyway", () => {
        expect(presetRange(preset("10y"), "2020-03-01", latest)).toEqual({ start: "2020-03-01", end: latest });
        expect(presetIsRedundant(preset("10y"), "2020-03-01", latest)).toBe(true);
        expect(presetIsRedundant(preset("5y"), "2020-03-01", latest)).toBe(false);
        expect(presetIsRedundant(preset("max"), "2020-03-01", latest)).toBe(false);
    });

    it("yearly presets count years", () => {
        expect(presetRange(preset("5y", YEARLY_PRESETS), "1994-07-01", "2025-01-01")).toEqual({ start: "2021-01-01", end: "2025-01-01" });
        expect(presetRange(preset("20y", YEARLY_PRESETS), "1994-07-01", "2025-01-01")).toEqual({ start: "2006-01-01", end: "2025-01-01" });
    });
});

describe("helpers", () => {
    it("shifts months across years", () => {
        expect(addMonths("2026-01", -1)).toBe("2025-12");
        expect(addMonths("2025-11", 3)).toBe("2026-02");
    });

    it("formats months in Portuguese", () => {
        expect(formatMonthYear("2026-08-01")).toBe("ago/2026");
        expect(formatRangeLabel({ start: "2021-09-01", end: "2026-08-01" })).toBe("set/2021 – ago/2026");
    });

    it("clamps a custom range to the series and keeps it in order", () => {
        expect(clampRange({ start: "1980-01-01", end: "2030-01-01" }, "1995-01-01", "2026-08-01")).toEqual({ start: "1995-01-01", end: "2026-08-01" });
        expect(clampRange({ start: "2026-05-01", end: "2026-02-01" }, "1995-01-01", "2026-08-01")).toEqual({ start: "2026-02-01", end: "2026-05-01" });
        expect(clampRange({ start: "2026-02-01" }, "1995-01-01", "2026-08-01")).toEqual({ start: "2026-02-01", end: "2026-08-01" });
    });

    it("filters rows by reference date, both ends included", () => {
        const rows = ["2026-01-01", "2026-02-01", "2026-03-01"].map((reference_date) => ({ reference_date }));
        expect(filterByRange(rows, { start: "2026-02-01", end: "2026-03-01" }).map((r) => r.reference_date)).toEqual(["2026-02-01", "2026-03-01"]);
    });
});

describe("summarizeSeries", () => {
    const points = [
        { date: "2026-03-01", value: 1 },
        { date: "2026-01-01", value: 0.5 },
        { date: "2026-02-01", value: -0.25 },
    ];

    it("compounds variations and finds the extremes whatever the input order", () => {
        const s = summarizeSeries(points)!;
        expect(s.count).toBe(3);
        expect(s.first).toEqual({ date: "2026-01-01", value: 0.5 });
        expect(s.last).toEqual({ date: "2026-03-01", value: 1 });
        expect(s.accumulated).toBeCloseTo((1.005 * 0.9975 * 1.01 - 1) * 100, 10);
        expect(s.average).toBeCloseTo(1.25 / 3, 10);
        expect(s.max).toEqual({ date: "2026-03-01", value: 1 });
        expect(s.min).toEqual({ date: "2026-02-01", value: -0.25 });
    });

    it("measures levels from the first point to the last", () => {
        const s = summarizeSeries([{ date: "2020-01-01", value: 1000 }, { date: "2025-01-01", value: 1500 }], "level")!;
        expect(s.accumulated).toBeCloseTo(50, 10);
        expect(summarizeSeries([], "level")).toBeNull();
    });
});
