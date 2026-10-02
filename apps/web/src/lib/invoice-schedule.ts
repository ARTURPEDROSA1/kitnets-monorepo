/**
 * When an invoice falls due and which month it belongs to.
 *
 * An invoice's reference month is the month of its due date: that is the month the money is expected
 * in, which is how the income ledger files what it receives. Nothing here needs to know whether the
 * lease charges the month ahead or the month behind — the invoice only says "vencimento em dd/mm/aaaa".
 * A due day the month does not have (31 in February) falls on the month's last day.
 */
import type { LeaseStatus } from "@/types/lease";
import { IN_FORCE } from "@/lib/lease-dashboard";

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `2026-10` + day 31 → `2026-10-31`; `2027-02` + day 31 → `2027-02-28`. */
export function dueDateIn(month: string, dueDay: number): string {
    const [y, m] = month.slice(0, 7).split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(last, Math.max(1, Math.round(dueDay) || 1));
    return `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/** `2026-10-10` → `2026-10-01`: the month an invoice with that due date belongs to. */
export const referenceMonthOf = (dueDate: string): string => `${dueDate.slice(0, 7)}-01`;

/** `2026-10` → "outubro de 2026" */
export function monthLabel(month: string): string {
    const [y, m] = month.slice(0, 7).split("-").map(Number);
    const name = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    return `${name} de ${y}`;
}

/** `2026-10` → "out/2026" */
export function monthShort(month: string): string {
    const [y, m] = month.slice(0, 7).split("-").map(Number);
    const name = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))).replace(".", "");
    return `${name}/${y}`;
}

/** `2026-12` + 1 → `2027-01` */
export function shiftMonth(month: string, by: number): string {
    const [y, m] = month.slice(0, 7).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ScheduleLease {
    status: LeaseStatus;
    start_date: string;
    termination_date?: string | null;
    rent_due_day: number;
    billing_due_day?: number | null;
}

/** The day of the month this lease's invoice falls due: its own billing day when the owner set one, else the rent's. */
export const leaseDueDay = (lease: Pick<ScheduleLease, "rent_due_day" | "billing_due_day">): number => lease.billing_due_day ?? lease.rent_due_day;

export type NoInvoiceReason = "NOT_IN_FORCE" | "BEFORE_START" | "AFTER_TERMINATION";

/**
 * Whether the lease is charged for a due date: it must be in force (a contract past its term keeps
 * being charged until it is terminated), have started, and not have been terminated before it.
 */
export function chargeable(lease: ScheduleLease, dueDate: string): NoInvoiceReason | null {
    if (!IN_FORCE.has(lease.status)) return "NOT_IN_FORCE";
    if (dueDate < lease.start_date.slice(0, 10)) return "BEFORE_START";
    if (lease.termination_date && dueDate > lease.termination_date.slice(0, 10)) return "AFTER_TERMINATION";
    return null;
}

/** Days from `from` to `to` (negative when `to` is earlier); both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
    const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}
