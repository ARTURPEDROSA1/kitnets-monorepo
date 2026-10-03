import { describe, expect, it } from "vitest";
import { accumulate, addMonths, cycleFactor, daysBetween, leaseIndexSeriesCode, leaseSummary, nextAdjustment, nextDueDate, type IndexPoint, type LeaseForSummary } from "./lease-summary";

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
    // the pilot's lease: started on 16/09/2026, yearly, IGP-M
    const s: IndexPoint[] = [{ month: "2026-08", value: 9 }, { month: "2026-09", value: 1.57 }, { month: "2026-10", value: 0.5 }, { month: "2026-11", value: -0.2 }];
    const none = { factor: 1, pct: 0, months: 0, days: 0, through: null, throughDate: null };
    it("counts nothing before the cycle's first month closes", () => {
        expect(accumulate(s, "2026-09-16", "2026-10-03", 12)).toEqual(none);
        expect(accumulate(s, "2026-09-16", "2026-10-15", 12)).toEqual(none);
        expect(accumulate(s, "2026-09-16", "2026-09-10", 12)).toEqual(none);
    });
    it("gives the first month the whole index of the month it starts in, on its monthly anniversary", () => {
        // calculoexato.com.br, base mensal: reajuste em 16/10/2026 = 1,57 % (setembro)
        const a = accumulate(s, "2026-09-16", "2026-10-16", 12);
        expect(a).toMatchObject({ pct: 1.57, months: 1, days: 0, through: "2026-09", throughDate: "2026-10-16" });
        expect(a.factor).toBeCloseTo(1.0157, 12);
        expect(Math.round(1260 * a.factor * 100) / 100).toBe(1279.78);
    });
    it("then takes the month in course by the day, landing on the whole index at the next anniversary", () => {
        // 16/10 → 05/11: 20 of the 31 days of the contract's second month, which takes October's index
        const a = accumulate(s, "2026-09-16", "2026-11-05", 12);
        expect(a.factor).toBeCloseTo(1.0157 * Math.pow(1.005, 20 / 31), 12);
        expect(a).toMatchObject({ months: 1, days: 20, through: "2026-10", throughDate: "2026-11-05" });
        const b = accumulate(s, "2026-09-16", "2026-11-16", 12);
        expect(b.factor).toBeCloseTo(1.0157 * 1.005, 12);
        expect(b).toMatchObject({ months: 2, days: 0, through: "2026-10", throughDate: "2026-11-16" });
    });
    it("stands at the last anniversary while the month in course has no index yet", () => {
        const a = accumulate(s.slice(0, 2), "2026-09-16", "2026-11-05", 12);
        expect(a).toMatchObject({ pct: 1.57, months: 1, days: 0, through: "2026-09", throughDate: "2026-10-16" });
        // a closed month without its index stops the count: December is missing
        expect(accumulate(s, "2026-09-16", "2027-02-01", 12)).toMatchObject({ months: 3, days: 0, through: "2026-11", throughDate: "2026-12-16" });
    });
    it("never runs past the cycle", () => {
        const flatSeries: IndexPoint[] = Array.from({ length: 24 }, (_, i) => ({ month: `${2026 + Math.floor((8 + i) / 12)}-${String(((8 + i) % 12) + 1).padStart(2, "0")}`, value: 1 }));
        const a = accumulate(flatSeries, "2026-09-16", "2027-12-01", 12);
        expect(a.months).toBe(12);
        expect(a.days).toBe(0);
        expect(a.factor).toBeCloseTo(Math.pow(1.01, 12), 12);
        expect(a.through).toBe("2027-08");                        // September/2026 … August/2027
    });
    it("clamps a cycle that starts on the 31st to each month's last day", () => {
        const jan: IndexPoint[] = [{ month: "2026-01", value: 1 }, { month: "2026-02", value: 2 }];
        expect(accumulate(jan, "2026-01-31", "2026-02-27", 12).months).toBe(0);
        expect(accumulate(jan, "2026-01-31", "2026-02-28", 12)).toMatchObject({ months: 1, through: "2026-01", throughDate: "2026-02-28" });
    });
});

describe("cycleFactor", () => {
    it("is the whole cycle's index, only once every month of it is published", () => {
        const s: IndexPoint[] = [{ month: "2026-09", value: 1 }, { month: "2026-10", value: 2 }, { month: "2026-11", value: 3 }];
        expect(cycleFactor(s, "2026-09-16", 3)).toBeCloseTo(1.01 * 1.02 * 1.03, 12);
        expect(cycleFactor(s, "2026-09-16", 4)).toBeNull();
        expect(cycleFactor(s, "2026-08-16", 3)).toBeNull();
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
    it("accumulates the cycle's closed months, then the month in course by the day, and projects the rent", () => {
        // cycle from 24/04/2026: April … July closed on 24/08; 25 of the 31 days of the month from 24/08 (August's index)
        const s = leaseSummary(lease(), flat("2025-01", 20, 1), today);
        expect(s.nextAdjustmentDate).toBe("2027-04-24");
        expect(s.cycleStart).toBe("2026-04-24");
        expect(s.firstClosingDate).toBe("2026-05-24");
        expect(s.monthsCounted).toBe(4);
        expect(s.daysCounted).toBe(25);
        expect(s.indexThrough).toBe("2026-08");
        expect(s.indexThroughDate).toBe(today);
        expect(s.accumulatedFactor).toBeCloseTo(Math.pow(1.01, 4 + 25 / 31), 12);
        expect(s.accumulatedPct).toBe(4.9);
        expect(s.adjustedRent).toBeCloseTo(4000 * Math.pow(1.01, 4 + 25 / 31), 1);
        expect(s.closingPct).toBeNull();                          // the cycle's months run to March/2027
        expect(s.daysToAdjustment).toBe(daysBetween(today, "2027-04-24"));
    });
    it("waits for the first month of the contract, then matches the market's figure on its anniversary", () => {
        const pilot = lease({ start_date: "2026-09-16", end_date: "2029-03-16", monthly_rent: 1260 });
        const igpm = [{ month: "2026-08", value: 0.4 }, { month: "2026-09", value: 1.57 }];
        const early = leaseSummary(pilot, igpm, "2026-10-03");
        expect(early).toMatchObject({ cycleStart: "2026-09-16", firstClosingDate: "2026-10-16", nextAdjustmentDate: "2027-09-16", monthsCounted: 0, accumulatedPct: 0, adjustedRent: 1260, indexThroughDate: null });
        const first = leaseSummary(pilot, igpm, "2026-10-16");
        expect(first).toMatchObject({ monthsCounted: 1, daysCounted: 0, accumulatedPct: 1.57, adjustedRent: 1279.78, indexThroughDate: "2026-10-16" });
    });
    it("gives the whole cycle's index once its last month is published: what the adjustment is made by", () => {
        // first cycle of a lease that started on 24/04/2025 (April/2025 … March/2026), seen on 10/04/2026 with March out
        const s = leaseSummary(lease(), flat("2024-01", 27, 1), "2026-04-10");
        expect(s.cycleStart).toBe("2025-04-24");
        expect(s.monthsCounted).toBe(11);
        expect(s.daysCounted).toBe(17);                           // of the month from 24/03, which takes March's index
        expect(s.closingPct).toBe(12.68);                         // 1.01^12 − 1
        expect(s.closingRent).toBe(4507.3);
    });
    it("rounds a half cent the way a decimal calculator does", () => {
        // 250 × 1.0157 = 253.925, which binary floats hold as 253.92499…
        const s = leaseSummary(lease({ start_date: "2026-09-16", end_date: null, monthly_rent: 250 }), [{ month: "2026-09", value: 1.57 }], "2026-10-16");
        expect(s.adjustedRent).toBe(253.93);
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
