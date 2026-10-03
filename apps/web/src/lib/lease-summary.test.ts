import { describe, expect, it } from "vitest";
import { correctByIndex } from "./index-correction";
import { accumulate, addMonths, daysBetween, leaseIndexSeriesCode, leaseSummary, nextAdjustment, nextDueDate, type IndexPoint, type LeaseForSummary } from "./lease-summary";

const lease = (over: Partial<LeaseForSummary> = {}): LeaseForSummary => ({
    start_date: "2025-04-24", end_date: "2027-10-23", termination_date: null, rent_due_day: 10, monthly_rent: 4000,
    adjustment_index: "IGP_M", adjustment_frequency: 12, next_adjustment_date: null, ...over,
});
const flat = (from: string, n: number, value: number): IndexPoint[] => {
    const out: IndexPoint[] = []; let d = from + "-01";
    for (let i = 0; i < n; i++) { out.push({ month: d.slice(0, 7), value }); d = addMonths(d, 1); }
    return out;
};

describe("date helpers", () => {
    it("counts days and shifts months, clamping to the month's length", () => {
        expect(daysBetween("2026-09-01", "2026-09-18")).toBe(17);
        expect(daysBetween("2026-09-18", "2026-09-01")).toBe(-17);
        expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
        expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
        expect(addMonths("2026-04-24", -12)).toBe("2025-04-24");
        expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    });
    it("finds the next rent due date", () => {
        expect(nextDueDate(10, "2026-09-05")).toBe("2026-09-10");
        expect(nextDueDate(10, "2026-09-10")).toBe("2026-09-10");   // due today still counts
        expect(nextDueDate(10, "2026-09-18")).toBe("2026-10-10");
        expect(nextDueDate(31, "2027-02-01")).toBe("2027-02-28");   // short month
        expect(nextDueDate(5, "2026-12-20")).toBe("2027-01-05");    // across the year
    });
});

describe("nextAdjustment", () => {
    it("uses the stored date while it is ahead", () => {
        expect(nextAdjustment(lease({ next_adjustment_date: "2027-04-24" }), "2026-09-18")).toBe("2027-04-24");
    });
    it("rolls a missing or stale date forward to the next anniversary", () => {
        expect(nextAdjustment(lease(), "2026-09-18")).toBe("2027-04-24");
        expect(nextAdjustment(lease({ next_adjustment_date: "2026-04-24" }), "2026-09-18")).toBe("2027-04-24");
        expect(nextAdjustment(lease(), "2025-05-01")).toBe("2026-04-24");
        expect(nextAdjustment(lease({ adjustment_frequency: 6 }), "2026-09-18")).toBe("2026-10-24");
    });
    it("an adjustment due today has happened: the next one is a cycle ahead", () => {
        expect(nextAdjustment(lease(), "2026-04-24")).toBe("2027-04-24");
    });
});

describe("accumulate", () => {
    const s: IndexPoint[] = [{ month: "2026-03", value: 9 }, { month: "2026-04", value: 1 }, { month: "2026-05", value: 2 }, { month: "2026-06", value: -0.5 }, { month: "2026-07", value: 9 }];
    const none = { factor: 1, pct: 0, months: 0, days: 0, through: null, throughDate: null };
    it("compounds whole months from a month's last day to another's", () => {
        const a = accumulate(s, "2026-03-31", "2026-06-30");
        expect(a.pct).toBe(2.5);                                  // 1.01 × 1.02 × 0.995 − 1 = 2.5049 %
        expect(a.factor).toBeCloseTo(1.01 * 1.02 * 0.995, 10);
        expect(a).toMatchObject({ months: 3, days: 91, through: "2026-06", throughDate: "2026-06-30" });
    });
    it("takes a partial month pro rata die, the start day left out and the end day counted", () => {
        // 16/04 → 10/05: 14 of April's 30 days, 10 of May's 31
        const a = accumulate(s, "2026-04-16", "2026-05-10");
        expect(a.factor).toBeCloseTo(Math.pow(1.01, 14 / 30) * Math.pow(1.02, 10 / 31), 10);
        expect(a.days).toBe(24);
        expect(a.months).toBeCloseTo(14 / 30 + 10 / 31, 10);
        expect(a.throughDate).toBe("2026-05-10");
    });
    it("is the /indices calculator's own answer for the same dates", () => {
        const calc = correctByIndex(1260, "2026-04-16", "2026-06-09", s);
        if ("error" in calc) throw new Error(calc.error);
        expect(accumulate(s, "2026-04-16", "2026-06-09").factor * 1260).toBeCloseTo(calc.correctedValue, 8);
    });
    it("stops at the last day of the last month published", () => {
        const a = accumulate(s, "2026-06-20", "2026-09-18");      // August is not out: July closes the count
        expect(a).toMatchObject({ through: "2026-07", throughDate: "2026-07-31", days: 41 });
        expect(a.factor).toBeCloseTo(Math.pow(0.995, 10 / 30) * 1.09, 10);
    });
    it("has nothing before the first month is published, or for a period that has not begun", () => {
        expect(accumulate(s, "2030-01-10", "2030-12-10")).toEqual(none);
        expect(accumulate(s, "2026-08-05", "2026-08-20")).toEqual(none);
        expect(accumulate(s, "2026-05-10", "2026-05-10")).toEqual(none);
        expect(accumulate(s, "2026-05-10", "2026-04-10")).toEqual(none);
    });
});

describe("leaseSummary", () => {
    const today = "2026-09-18";
    it("reports the term: days elapsed, days left and progress", () => {
        const s = leaseSummary(lease(), null, today);
        expect(s.daysElapsed).toBe(daysBetween("2025-04-24", today));
        expect(s.daysLeft).toBe(daysBetween(today, "2027-10-23"));
        expect(s.daysElapsed + s.daysLeft!).toBe(daysBetween("2025-04-24", "2027-10-23"));
        expect(s.progressPct).toBe(56);
        expect(s.nextDueDate).toBe("2026-10-10");
        expect(s.daysToDue).toBe(22);
    });
    it("accumulates the current cycle day by day, to the last month published, and projects the rent", () => {
        // cycle from 24/04/2026; the series is published through Aug/2026 → 6 of April's 30 days, then May … August whole
        const s = leaseSummary(lease(), flat("2025-01", 20, 1), today);
        expect(s.nextAdjustmentDate).toBe("2027-04-24");
        expect(s.cycleStart).toBe("2026-04-24");
        expect(s.monthsCounted).toBeCloseTo(4.2, 10);
        expect(s.daysCounted).toBe(daysBetween("2026-04-24", "2026-08-31"));
        expect(s.indexThrough).toBe("2026-08");
        expect(s.indexThroughDate).toBe("2026-08-31");
        expect(s.accumulatedFactor).toBeCloseTo(Math.pow(1.01, 4.2), 10);
        expect(s.accumulatedPct).toBe(4.27);                      // 1.01^4.2 − 1
        expect(s.adjustedRent).toBe(Math.round(4000 * Math.pow(1.01, 4.2) * 100) / 100);
        expect(s.daysToAdjustment).toBe(daysBetween(today, "2027-04-24"));
    });
    it("a lease that started on the 16th takes only the rest of that month's index", () => {
        // 16/09/2026 → 03/10/2026 with September at 1.57 % and October not out: 14 of 30 days
        const s = leaseSummary(lease({ start_date: "2026-09-16", end_date: "2029-03-16", monthly_rent: 1260 }), [{ month: "2026-08", value: 0.4 }, { month: "2026-09", value: 1.57 }], "2026-10-03");
        expect(s.cycleStart).toBe("2026-09-16");
        expect(s.nextAdjustmentDate).toBe("2027-09-16");
        expect(s.daysCounted).toBe(14);
        expect(s.indexThroughDate).toBe("2026-09-30");
        expect(s.accumulatedPct).toBe(0.73);                      // 1.0157^(14/30) − 1
        expect(s.adjustedRent).toBe(1269.19);
    });
    it("counts to today inside a published month, never before the lease started", () => {
        // first cycle of a lease that started on 24/04/2025, seen on 01/03/2026 with every month published
        const s = leaseSummary(lease(), flat("2024-01", 40, 1), "2026-03-01");
        expect(s.cycleStart).toBe("2025-04-24");
        expect(s.indexThrough).toBe("2026-03");
        expect(s.indexThroughDate).toBe("2026-03-01");
        expect(s.daysCounted).toBe(daysBetween("2025-04-24", "2026-03-01"));
        expect(s.monthsCounted).toBeCloseTo(6 / 30 + 10 + 1 / 31, 10);   // rest of April, May … February, one day of March
    });
    it("has a series but nothing to count while the cycle's first month is not published", () => {
        const s = leaseSummary(lease({ start_date: "2026-09-10", end_date: null }), flat("2025-01", 20, 1), today);
        expect(s.accumulatedPct).toBe(0);
        expect(s.monthsCounted).toBe(0);
        expect(s.indexThroughDate).toBeNull();
        expect(s.adjustedRent).toBe(4000);
    });
    it("handles leases without an end date, without adjustment and without a series", () => {
        const open = leaseSummary(lease({ end_date: null }), null, today);
        expect(open.daysLeft).toBeNull();
        expect(open.progressPct).toBeNull();
        const none = leaseSummary(lease({ adjustment_index: "NONE" }), flat("2025-01", 20, 1), today);
        expect(none.nextAdjustmentDate).toBeNull();
        expect(none.accumulatedPct).toBeNull();
        expect(none.adjustedRent).toBeNull();
        expect(leaseSummary(lease({ adjustment_index: "CUSTOM" }), null, today).nextAdjustmentDate).toBe("2027-04-24");
    });
    it("counts a terminated lease to its termination date and an expired one as overdue", () => {
        expect(leaseSummary(lease({ termination_date: "2026-12-31" }), null, today).effectiveEnd).toBe("2026-12-31");
        const expired = leaseSummary(lease({ end_date: "2026-08-31" }), null, today);
        expect(expired.daysLeft).toBe(-18);
        expect(expired.progressPct).toBe(100);
    });
    it("maps the lease index to its series", () => {
        expect(leaseIndexSeriesCode("IGP_M")).toBe("igpm");
        expect(leaseIndexSeriesCode("IPCA")).toBe("ipca");
        expect(leaseIndexSeriesCode("CUSTOM")).toBeNull();
        expect(leaseIndexSeriesCode(null)).toBeNull();
    });
});
