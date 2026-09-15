import { describe, expect, it } from "vitest";
import { addMonthsClamped, dueDateInMonth, formatDateBR, nextOccurrence, parseISODateLocal, toISODate } from "./dates";

describe("formatDateBR", () => {
    it("shows a date-only string on its own day regardless of timezone", () => {
        expect(formatDateBR("2026-03-01")).toBe("01/03/2026");
        expect(formatDateBR("2026-12-31")).toBe("31/12/2026");
    });

    it("shows timestamps in São Paulo time", () => {
        // 02:30Z on the 2nd is still 23:30 on the 1st in São Paulo
        expect(formatDateBR("2026-03-02T02:30:00Z")).toBe("01/03/2026");
    });

    it("handles empty values", () => {
        expect(formatDateBR(null)).toBe("—");
        expect(formatDateBR("", "-")).toBe("-");
    });
});

describe("parseISODateLocal / toISODate", () => {
    it("round-trips at local midnight", () => {
        const d = parseISODateLocal("2026-02-28")!;
        expect(d.getDate()).toBe(28);
        expect(d.getHours()).toBe(0);
        expect(toISODate(d)).toBe("2026-02-28");
        expect(parseISODateLocal("nonsense")).toBeNull();
    });
});

describe("addMonthsClamped", () => {
    it("keeps the anchor day and clamps to short months without drifting", () => {
        const jan31 = new Date(2026, 0, 31);
        expect(toISODate(addMonthsClamped(jan31, 1))).toBe("2026-02-28");
        expect(toISODate(addMonthsClamped(jan31, 2))).toBe("2026-03-31");
        expect(toISODate(addMonthsClamped(jan31, 3))).toBe("2026-04-30");
        expect(toISODate(addMonthsClamped(jan31, 13))).toBe("2027-02-28");
    });

    it("handles leap years", () => {
        expect(toISODate(addMonthsClamped(new Date(2027, 11, 31), 2))).toBe("2028-02-29");
    });
});

describe("nextOccurrence", () => {
    it("finds the next anniversary after today for a 12-month cycle", () => {
        const next = nextOccurrence("2024-05-10", 12, new Date(2026, 8, 15));
        expect(toISODate(next!)).toBe("2027-05-10");
    });

    it("does not drift for a contract that started on the 31st", () => {
        // 31 Jan 2026, every 1 month, today 15 Mar 2026 → 31 Mar, not 28 Mar
        expect(toISODate(nextOccurrence("2026-01-31", 1, new Date(2026, 2, 15))!)).toBe("2026-03-31");
        // … and the following one lands on 30 Apr
        expect(toISODate(nextOccurrence("2026-01-31", 1, new Date(2026, 2, 31))!)).toBe("2026-04-30");
    });

    it("is strictly after today", () => {
        expect(toISODate(nextOccurrence("2025-09-15", 12, new Date(2026, 8, 15))!)).toBe("2027-09-15");
    });

    it("rejects bad input", () => {
        expect(nextOccurrence("2026-01-31", 0)).toBeNull();
        expect(nextOccurrence("bad", 12)).toBeNull();
    });
});

describe("dueDateInMonth", () => {
    it("clamps day 31 to the month's length", () => {
        expect(toISODate(dueDateInMonth(2026, 3, 31))).toBe("2026-04-30");
        expect(toISODate(dueDateInMonth(2026, 1, 30))).toBe("2026-02-28");
        expect(toISODate(dueDateInMonth(2026, 0, 10))).toBe("2026-01-10");
    });
});
