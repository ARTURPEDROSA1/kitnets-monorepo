import { describe, expect, it } from "vitest";
import { addMonths, correctByIndex, daysBetween, daysInMonth, formatMonthsCount, lastDayOfMonth, normalizeCalcDate, type IndexMonthValue } from "./index-correction";

const series = (from: string, rates: number[]): IndexMonthValue[] => rates.map((value, i) => ({ month: addMonths(from, i), value }));

// 09/2025 … 08/2026, one rate per month
const TWELVE = series("2025-09", [0.5, 0.4, 0.3, 0.6, 0.7, 0.2, 0.1, 0.4, 0.3, 0.2, 0.5, 0.6]);
const product = (rates: number[]) => rates.reduce((acc, r) => acc * (1 + r / 100), 1);

describe("calendar helpers", () => {
    it("knows the length of every month, leap years included", () => {
        expect(daysInMonth("2024-02")).toBe(29);
        expect(daysInMonth("2025-02")).toBe(28);
        expect(daysInMonth("2025-12")).toBe(31);
        expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
        expect(addMonths("2025-12", 1)).toBe("2026-01");
        expect(addMonths("2026-01", -12)).toBe("2025-01");
    });

    it("counts calendar days across a daylight-saving change and a leap day", () => {
        expect(daysBetween("2025-08-31", "2026-08-31")).toBe(365);
        expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
        expect(daysBetween("2025-10-31", "2025-11-30")).toBe(30);
    });

    it("formats the months of index applied", () => {
        expect(formatMonthsCount(12)).toBe("12");
        expect(formatMonthsCount(12.5)).toBe("12,5");
        expect(formatMonthsCount(0.3333)).toBe("0,3");
    });
});

describe("normalizeCalcDate (links from before day precision)", () => {
    it("keeps an ISO date and turns a month into its last day", () => {
        expect(normalizeCalcDate("2025-08-15")).toBe("2025-08-15");
        expect(normalizeCalcDate("2025-08")).toBe("2025-08-31");
        expect(normalizeCalcDate("2024-02")).toBe("2024-02-29");
        expect(normalizeCalcDate("08/2025")).toBeNull();
        expect(normalizeCalcDate(null)).toBeNull();
    });
});

describe("correctByIndex", () => {
    it("from a month's last day to another month's last day equals the old month convention (rates of the months in between, end month included)", () => {
        const res = correctByIndex(1000, "2025-08-31", "2026-08-31", TWELVE);
        if ("error" in res) throw new Error(res.error);
        expect(res.rows).toHaveLength(12);
        expect(res.rows.every(r => r.fraction === 1 && r.appliedPercent === r.indexPercent)).toBe(true);
        expect(res.correctedValue).toBeCloseTo(1000 * product(TWELVE.map(d => d.value)), 8);
        expect(res.days).toBe(365);
        expect(res.months).toBe(12);
        expect(res.accumulatedPercent).toBeCloseTo((product(TWELVE.map(d => d.value)) - 1) * 100, 8);
    });

    it("applies partial months pro rata die with compound capitalisation", () => {
        const data = series("2025-09", [1, 2]);
        const res = correctByIndex(1000, "2025-09-15", "2025-10-15", data);
        if ("error" in res) throw new Error(res.error);
        expect(res.rows.map(r => [r.month, r.daysApplied, r.daysInMonth])).toEqual([["2025-09", 15, 30], ["2025-10", 15, 31]]);
        expect(res.correctedValue).toBeCloseTo(1000 * Math.pow(1.01, 15 / 30) * Math.pow(1.02, 15 / 31), 8);
        expect(res.days).toBe(30);
        expect(res.months).toBeCloseTo(15 / 30 + 15 / 31, 10);
        expect(res.rows[0].appliedPercent).toBeCloseTo((Math.pow(1.01, 0.5) - 1) * 100, 10);
    });

    it("handles both dates inside the same month", () => {
        const res = correctByIndex(500, "2025-09-10", "2025-09-20", series("2025-09", [1]));
        if ("error" in res) throw new Error(res.error);
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].daysApplied).toBe(10);
        expect(res.correctedValue).toBeCloseTo(500 * Math.pow(1.01, 10 / 30), 8);
        expect(res.days).toBe(10);
    });

    it("needs no rate for a start month that contributes no days, and demands one otherwise", () => {
        const onlyOctober = series("2025-10", [2]);
        const fromLastDay = correctByIndex(1000, "2025-09-30", "2025-10-31", onlyOctober);
        if ("error" in fromLastDay) throw new Error(fromLastDay.error);
        expect(fromLastDay.rows.map(r => r.month)).toEqual(["2025-10"]);
        expect(fromLastDay.correctedValue).toBeCloseTo(1020, 8);

        const fromEarlier = correctByIndex(1000, "2025-09-29", "2025-10-31", onlyOctober);
        expect(fromEarlier).toEqual({ error: "Dados indisponíveis para 09/2025. Ajuste o período." });
    });

    it("refuses an end date past the published months, an inverted period and a bad date", () => {
        expect(correctByIndex(1000, "2026-08-31", "2026-09-01", TWELVE)).toEqual({ error: "Dados indisponíveis para 09/2026. Ajuste o período." });
        expect(correctByIndex(1000, "2026-01-10", "2026-01-10", TWELVE)).toEqual({ error: "A data final deve ser posterior à data inicial." });
        expect(correctByIndex(1000, "2026-02-30", "2026-03-10", TWELVE)).toEqual({ error: "Informe datas válidas (dd/mm/aaaa)." });
    });
});
