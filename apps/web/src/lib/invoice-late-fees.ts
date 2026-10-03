/**
 * What an invoice costs when paid after its due date, as Brazilian leases state it: a fine (multa)
 * once, as a percentage of the amount, and interest (juros de mora) per month, counted pro rata by
 * day. The boleto's bank does this on its own from the terms the invoice carries; the card payment
 * has to do it here, from the same terms, so both ways cost the tenant the same.
 *
 * The terms are the owner's decisions (billing_settings, snapshotted on the invoice): an undecided
 * term charges nothing — never a rate assumed in its place.
 */
import { daysBetween } from "@/lib/invoice-schedule";

export interface LateTerms {
    /** `YYYY-MM-DD` */
    due_date: string;
    fine_pct: number | null;
    interest_pct_month: number | null;
}

export interface LateCharges {
    daysLate: number;
    fine: number;
    interest: number;
    /** fine + interest */
    extra: number;
    /** the invoice's amount + extra */
    total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fine and interest due on `amount` when paid on `payDate` (`YYYY-MM-DD`). Nothing on or before the due date. */
export function lateCharges(amount: number, terms: LateTerms, payDate: string): LateCharges {
    const daysLate = Math.max(0, daysBetween(terms.due_date, payDate));
    if (daysLate === 0 || !(amount > 0)) return { daysLate, fine: 0, interest: 0, extra: 0, total: round2(amount) };
    const fine = terms.fine_pct != null ? round2(amount * terms.fine_pct / 100) : 0;
    // juros simples, pro rata die on a 30-day month
    const interest = terms.interest_pct_month != null ? round2(amount * (terms.interest_pct_month / 100) * daysLate / 30) : 0;
    const extra = round2(fine + interest);
    return { daysLate, fine, interest, extra, total: round2(amount + extra) };
}

/** Whether a late invoice can still be paid on `payDate`: within the window the owner decided (no window decided = no limit). */
export function stillPayable(terms: Pick<LateTerms, "due_date"> & { days_payable_after_due: number | null }, payDate: string): boolean {
    if (terms.days_payable_after_due == null) return true;
    return daysBetween(terms.due_date, payDate) <= terms.days_payable_after_due;
}
