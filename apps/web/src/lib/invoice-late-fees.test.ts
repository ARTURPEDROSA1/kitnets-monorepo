import { describe, expect, it } from "vitest";
import { lateCharges, stillPayable } from "./invoice-late-fees";

const terms = { due_date: "2026-10-20", fine_pct: 2, interest_pct_month: 1 };

describe("lateCharges", () => {
    it("nothing on or before the due date", () => {
        expect(lateCharges(1000, terms, "2026-10-20")).toEqual({ daysLate: 0, fine: 0, interest: 0, extra: 0, total: 1000 });
        expect(lateCharges(1000, terms, "2026-10-01").daysLate).toBe(0);
    });

    it("fine once, interest per day on a 30-day month", () => {
        // 15 days late: fine 2 % = 20.00; interest 1 % × 15/30 = 5.00
        expect(lateCharges(1000, terms, "2026-11-04")).toEqual({ daysLate: 15, fine: 20, interest: 5, extra: 25, total: 1025 });
        // 1 day late on R$ 150: fine 3.00, interest 150 × 1 % / 30 = 0.05
        expect(lateCharges(150, terms, "2026-10-21")).toEqual({ daysLate: 1, fine: 3, interest: 0.05, extra: 3.05, total: 153.05 });
    });

    it("an undecided term charges nothing in its place", () => {
        expect(lateCharges(1000, { ...terms, fine_pct: null }, "2026-11-04")).toMatchObject({ fine: 0, interest: 5, total: 1005 });
        expect(lateCharges(1000, { ...terms, interest_pct_month: null }, "2026-11-04")).toMatchObject({ fine: 20, interest: 0, total: 1020 });
        expect(lateCharges(1000, { ...terms, fine_pct: null, interest_pct_month: null }, "2026-11-04")).toMatchObject({ extra: 0, total: 1000 });
    });

    it("rounds each part to the centavo", () => {
        const c = lateCharges(249.9, { due_date: "2026-10-20", fine_pct: 2, interest_pct_month: 1 }, "2026-10-27");
        expect(c.fine).toBe(5);          // 4.998
        expect(c.interest).toBe(0.58);   // 249.9 × 0.01 × 7/30 = 0.5831
        expect(c.total).toBe(255.48);
    });
});

describe("stillPayable", () => {
    it("within the owner's window, or always when none was decided", () => {
        expect(stillPayable({ due_date: "2026-10-20", days_payable_after_due: 30 }, "2026-11-19")).toBe(true);
        expect(stillPayable({ due_date: "2026-10-20", days_payable_after_due: 30 }, "2026-11-20")).toBe(false);
        expect(stillPayable({ due_date: "2026-10-20", days_payable_after_due: 0 }, "2026-10-20")).toBe(true);
        expect(stillPayable({ due_date: "2026-10-20", days_payable_after_due: 0 }, "2026-10-21")).toBe(false);
        expect(stillPayable({ due_date: "2026-10-20", days_payable_after_due: null }, "2027-01-01")).toBe(true);
    });
});
