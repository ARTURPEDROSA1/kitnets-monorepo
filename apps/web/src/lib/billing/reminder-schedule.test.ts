import { describe, expect, it } from "vitest";
import { reminderDue, type ReminderInvoice } from "./reminder-schedule";

const invoice = (over: Partial<ReminderInvoice> = {}): ReminderInvoice => ({ status: "ISSUED", due_date: "2026-10-20", days_payable_after_due: 30, payable: true, remindersSent: [], ...over });
const settings = { reminder_days_before: 3, overdue_notice_days: 5 };

describe("reminderDue", () => {
    it("reminds within the window before the due date, once", () => {
        expect(reminderDue(invoice(), settings, "2026-10-16")).toBeNull();        // 4 days: not yet
        expect(reminderDue(invoice(), settings, "2026-10-17")).toBe("BEFORE");    // 3 days
        expect(reminderDue(invoice(), settings, "2026-10-19")).toBe("BEFORE");    // a run that missed a day
        expect(reminderDue(invoice(), settings, "2026-10-20")).toBeNull();        // the due day itself: the invoice, not a reminder
        expect(reminderDue(invoice({ remindersSent: [0] }), settings, "2026-10-18")).toBeNull();
    });

    it("notices the overdue invoice from N days late, while it still pays, once", () => {
        expect(reminderDue(invoice(), settings, "2026-10-24")).toBeNull();        // 4 days late
        expect(reminderDue(invoice(), settings, "2026-10-25")).toBe("OVERDUE");   // 5 days late
        expect(reminderDue(invoice(), settings, "2026-11-10")).toBe("OVERDUE");   // still within the 30-day window
        expect(reminderDue(invoice(), settings, "2026-11-20")).toBeNull();        // window closed: nothing to pay with
        expect(reminderDue(invoice({ days_payable_after_due: null }), settings, "2027-01-01")).toBe("OVERDUE");
        expect(reminderDue(invoice({ remindersSent: [1] }), settings, "2026-10-25")).toBeNull();
        expect(reminderDue(invoice({ remindersSent: [0] }), settings, "2026-10-25")).toBe("OVERDUE");
    });

    it("an undecided number means no reminder of that kind", () => {
        expect(reminderDue(invoice(), { reminder_days_before: null, overdue_notice_days: 5 }, "2026-10-18")).toBeNull();
        expect(reminderDue(invoice(), { reminder_days_before: 3, overdue_notice_days: null }, "2026-10-30")).toBeNull();
        expect(reminderDue(invoice(), { reminder_days_before: null, overdue_notice_days: null }, "2026-10-18")).toBeNull();
    });

    it("nothing for a settled invoice or one with no way to pay", () => {
        expect(reminderDue(invoice({ status: "PAID" }), settings, "2026-10-18")).toBeNull();
        expect(reminderDue(invoice({ status: "CANCELLED" }), settings, "2026-10-25")).toBeNull();
        expect(reminderDue(invoice({ payable: false }), settings, "2026-10-18")).toBeNull();
    });
});
