import { describe, expect, it } from "vitest";
import { chargeable, daysBetween, dueDateIn, leaseDueDay, monthLabel, monthShort, referenceMonthOf, shiftMonth, type ScheduleLease } from "./invoice-schedule";

const lease = (over: Partial<ScheduleLease> = {}): ScheduleLease => ({ status: "ACTIVE", start_date: "2026-03-15", termination_date: null, rent_due_day: 10, ...over });

describe("due dates", () => {
    it("falls on the due day, or on the month's last day when the month is shorter", () => {
        expect(dueDateIn("2026-10", 10)).toBe("2026-10-10");
        expect(dueDateIn("2026-10", 31)).toBe("2026-10-31");
        expect(dueDateIn("2026-11", 31)).toBe("2026-11-30");
        expect(dueDateIn("2027-02", 31)).toBe("2027-02-28");
        expect(dueDateIn("2028-02", 30)).toBe("2028-02-29");
    });

    it("the reference month is the due date's month", () => {
        expect(referenceMonthOf("2026-10-10")).toBe("2026-10-01");
        expect(referenceMonthOf("2027-01-05")).toBe("2027-01-01");
    });

    it("the invoice's own due day wins over the rent's", () => {
        expect(leaseDueDay({ rent_due_day: 10, billing_due_day: null })).toBe(10);
        expect(leaseDueDay({ rent_due_day: 10, billing_due_day: 5 })).toBe(5);
    });
});

describe("months", () => {
    it("shifts across the year", () => {
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(shiftMonth("2026-10", 0)).toBe("2026-10");
    });

    it("labels them in Portuguese", () => {
        expect(monthLabel("2026-10")).toBe("outubro de 2026");
        expect(monthLabel("2026-10-01")).toBe("outubro de 2026");
        expect(monthShort("2026-10")).toBe("out/2026");
    });

    it("counts days", () => {
        expect(daysBetween("2026-10-02", "2026-10-10")).toBe(8);
        expect(daysBetween("2026-10-10", "2026-10-02")).toBe(-8);
        expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    });
});

describe("chargeable", () => {
    it("a lease in force is charged from its start", () => {
        expect(chargeable(lease(), "2026-10-10")).toBeNull();
        expect(chargeable(lease(), "2026-03-15")).toBeNull();
        expect(chargeable(lease(), "2026-03-10")).toBe("BEFORE_START");
    });

    it("a contract past its term keeps being charged while it is in force", () => {
        expect(chargeable(lease({ status: "EXPIRING_SOON" }), "2030-01-10")).toBeNull();
    });

    it("stops at the termination", () => {
        expect(chargeable(lease({ termination_date: "2026-10-05" }), "2026-10-10")).toBe("AFTER_TERMINATION");
        expect(chargeable(lease({ termination_date: "2026-10-10" }), "2026-10-10")).toBeNull();
    });

    it("a draft, expired, terminated or cancelled lease is not charged", () => {
        for (const status of ["DRAFT", "EXPIRED", "TERMINATED", "CANCELLED"] as const) {
            expect(chargeable(lease({ status }), "2026-10-10")).toBe("NOT_IN_FORCE");
        }
    });
});
