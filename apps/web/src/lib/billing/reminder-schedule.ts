/**
 * Which reminder an open invoice is due today, from the owner's decisions (billing_settings): a
 * reminder `reminder_days_before` days before the due date, an overdue notice `overdue_notice_days`
 * days after it. Each goes out once per invoice (invoice_deliveries kind REMINDER, sequence 0 / 1);
 * an undecided number means no reminder of that kind — nothing is assumed in its place. Pure.
 */
import { daysBetween } from "@/lib/invoice-schedule";
import { stillPayable } from "@/lib/invoice-late-fees";

export interface ReminderSettings {
    reminder_days_before: number | null;
    overdue_notice_days: number | null;
}

export interface ReminderInvoice {
    status: string;
    /** `YYYY-MM-DD` */
    due_date: string;
    days_payable_after_due: number | null;
    /** the tenant has a way to pay: a live boleto, or the card */
    payable: boolean;
    /** sequences of REMINDER deliveries already created (sent or not) */
    remindersSent: readonly number[];
}

export type ReminderKind = "BEFORE" | "OVERDUE";

/**
 * The reminder to queue today, or null. The window before the due date runs from `days_before` days
 * before up to the day before (a run that missed a day still sends it); the overdue notice from
 * `overdue_days` after, while the invoice still pays.
 */
export function reminderDue(invoice: ReminderInvoice, settings: ReminderSettings, today: string): ReminderKind | null {
    if (invoice.status !== "DRAFT" && invoice.status !== "ISSUED") return null;
    if (!invoice.payable) return null;
    const toDue = daysBetween(today, invoice.due_date);
    if (settings.reminder_days_before != null && toDue > 0 && toDue <= settings.reminder_days_before && !invoice.remindersSent.includes(0)) return "BEFORE";
    if (settings.overdue_notice_days != null && -toDue >= settings.overdue_notice_days && stillPayable(invoice, today) && !invoice.remindersSent.includes(1)) return "OVERDUE";
    return null;
}
