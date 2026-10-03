/**
 * Lease summary — pure date and index maths for the "Contrato de Aluguel" card on the property page.
 *
 * Rent adjustment: on each anniversary (every `adjustment_frequency` months, 12 by default) the rent is
 * corrected by the index accumulated over the cycle that just ended. The cycle runs from its first day
 * (the lease's start, or the previous adjustment) and is counted day by day, with the /indices
 * calculator's own math (lib/index-correction.ts): a lease that started on the 16th takes only the rest
 * of that month's index, pro rata die. So "accumulated to date" is what that calculator answers from
 * the cycle's first day to today — or to the last day of the last month published — and "rent adjusted
 * to date" is what the rent would become if the adjustment happened today.
 *
 * Dates are `YYYY-MM-DD` strings handled in UTC, so a user's time zone never shifts a day.
 */
import { addMonths as addMonthKey, correctByIndex, lastDayOfMonth } from "@/lib/index-correction";

export interface LeaseForSummary {
    start_date: string;
    end_date: string | null;
    termination_date?: string | null;
    rent_due_day: number;
    monthly_rent: number;
    adjustment_index: string | null;
    adjustment_frequency: number | null;
    next_adjustment_date: string | null;
}

export interface IndexPoint { month: string; value: number }   // month = `YYYY-MM`, value = monthly variation in %

export interface LeaseSummary {
    /** days from the start date to today (0 before the lease starts) */
    daysElapsed: number;
    /** days from today to the end date; negative when overdue; null without an end date */
    daysLeft: number | null;
    /** 0–100 share of the term already elapsed; null without an end date */
    progressPct: number | null;
    /** the lease's last day: the termination date when there is one, else the end date */
    effectiveEnd: string | null;
    nextDueDate: string;
    daysToDue: number;
    /** months between adjustments */
    frequencyMonths: number;
    /** null when the lease has no adjustment (index NONE) */
    nextAdjustmentDate: string | null;
    daysToAdjustment: number | null;
    /** first day of the current cycle (the previous adjustment, or the lease start) */
    cycleStart: string | null;
    /** index accumulated from the cycle's first day to `indexThroughDate`, day by day, in %; null without a series */
    accumulatedPct: number | null;
    /** the exact factor behind `accumulatedPct` (1 while nothing counts); null without a series */
    accumulatedFactor: number | null;
    /** months of index applied, a month cut by the cycle's start or by today counting as its fraction; 0 = nothing published for the cycle yet */
    monthsCounted: number;
    /** calendar days of index applied */
    daysCounted: number;
    /** last month included, `YYYY-MM` */
    indexThrough: string | null;
    /** `YYYY-MM-DD` the accumulated figure runs to: today, or the last day of the last month published */
    indexThroughDate: string | null;
    /** rent × accumulated factor; null without a series */
    adjustedRent: number | null;
}

const DAY = 86400000;
const parse = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY);

/** `YYYY-MM-DD` shifted by whole months, clamped to the month's length (31/01 + 1 month = 28/02). */
export function addMonths(date: string, months: number): string {
    const [y, m, d] = date.slice(0, 10).split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

/** Next date the rent falls due: this month's due day when it has not passed, else next month's. */
export function nextDueDate(dueDay: number, today: string): string {
    const day = Math.min(31, Math.max(1, Math.round(dueDay) || 1));
    const monthStart = today.slice(0, 7) + "-01";
    const inMonth = (base: string) => {
        const [y, m] = base.split("-").map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return `${base.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
    };
    const thisMonth = inMonth(monthStart);
    return thisMonth >= today ? thisMonth : inMonth(addMonths(monthStart, 1));
}

/**
 * Next adjustment date: the stored one when it is still ahead; otherwise (missing, or left in the past
 * because nobody rolled it forward) the next anniversary of the start date at the lease's frequency.
 */
export function nextAdjustment(lease: Pick<LeaseForSummary, "start_date" | "next_adjustment_date" | "adjustment_frequency">, today: string): string {
    const freq = lease.adjustment_frequency && lease.adjustment_frequency > 0 ? lease.adjustment_frequency : 12;
    let next = lease.next_adjustment_date && lease.next_adjustment_date.slice(0, 10) > lease.start_date.slice(0, 10)
        ? lease.next_adjustment_date.slice(0, 10)
        : addMonths(lease.start_date, freq);
    for (let i = 0; next <= today && i < 600; i++) next = addMonths(next, freq);
    return next;
}

export interface Accumulated {
    /** what an amount is multiplied by */
    factor: number;
    /** the same, in %, two decimals */
    pct: number;
    /** months of index applied (a partial month counts as its fraction) */
    months: number;
    /** calendar days of index applied */
    days: number;
    /** last month included, `YYYY-MM` */
    through: string | null;
    /** `YYYY-MM-DD` the figure runs to */
    throughDate: string | null;
}

/**
 * The index accumulated from `from` to `to`, counted day by day exactly as the /indices calculator
 * does (the start day is not counted, the end day is; a partial month enters pro rata die, compounded).
 * A month not published yet ends the count at the last day of the month before it.
 */
export function accumulate(series: IndexPoint[], from: string, to: string): Accumulated {
    const none: Accumulated = { factor: 1, pct: 0, months: 0, days: 0, through: null, throughDate: null };
    const published = series.filter(p => Number.isFinite(p.value));
    const months = new Set(published.map(p => p.month));
    // the last month published in a row from the period's first one
    let last: string | null = null;
    for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.has(m); m = addMonthKey(m, 1)) last = m;
    if (!last) return none;
    const end = to.slice(0, 10) < lastDayOfMonth(last) ? to.slice(0, 10) : lastDayOfMonth(last);
    const result = correctByIndex(1, from.slice(0, 10), end, published);
    if ("error" in result || result.rows.length === 0) return none;
    return {
        factor: result.correctedValue,
        pct: Math.round(result.accumulatedPercent * 100) / 100,
        months: result.months,
        days: result.days,
        through: result.rows[result.rows.length - 1].month,
        throughDate: end,
    };
}

/** Code of the calculator series (`/api/indices/{code}/calculator-data`) for a lease's index; null when there is none. */
export function leaseIndexSeriesCode(index: string | null | undefined): string | null {
    switch (index) {
        case "IPCA": return "ipca";
        case "IGP_M": return "igpm";
        case "INPC": return "inpc";
        case "IVAR": return "ivar";
        default: return null;   // CUSTOM, NONE, unset
    }
}

export const LEASE_INDEX_LABELS: Record<string, string> = { IPCA: "IPCA", IGP_M: "IGP-M", INPC: "INPC", IVAR: "IVAR", CUSTOM: "Outro índice", NONE: "Sem reajuste" };

export function leaseSummary(lease: LeaseForSummary, series: IndexPoint[] | null, today: string): LeaseSummary {
    const start = lease.start_date.slice(0, 10);
    const effectiveEnd = (lease.termination_date ?? lease.end_date)?.slice(0, 10) ?? null;
    const daysElapsed = Math.max(0, daysBetween(start, today));
    const daysLeft = effectiveEnd ? daysBetween(today, effectiveEnd) : null;
    const total = effectiveEnd ? daysBetween(start, effectiveEnd) : null;
    const progressPct = total && total > 0 ? Math.min(100, Math.max(0, Math.round((daysBetween(start, today) / total) * 100))) : null;

    const due = nextDueDate(lease.rent_due_day, today);
    const frequencyMonths = lease.adjustment_frequency && lease.adjustment_frequency > 0 ? lease.adjustment_frequency : 12;
    const adjusts = lease.adjustment_index !== "NONE";
    const nextAdj = adjusts ? nextAdjustment(lease, today) : null;
    const cycleStart = nextAdj ? (() => { const s = addMonths(nextAdj, -frequencyMonths); return s < start ? start : s; })() : null;

    let accumulatedPct: number | null = null, accumulatedFactor: number | null = null, monthsCounted = 0, daysCounted = 0;
    let indexThrough: string | null = null, indexThroughDate: string | null = null, adjustedRent: number | null = null;
    if (series && series.length > 0 && nextAdj && cycleStart) {
        // from the cycle's first day to today (never past the adjustment that closes it)
        const acc = accumulate(series, cycleStart, today < nextAdj ? today : nextAdj);
        accumulatedPct = acc.pct;
        accumulatedFactor = acc.factor;
        monthsCounted = acc.months;
        daysCounted = acc.days;
        indexThrough = acc.through;
        indexThroughDate = acc.throughDate;
        adjustedRent = Math.round(lease.monthly_rent * acc.factor * 100) / 100;
    }
    return {
        daysElapsed, daysLeft, progressPct, effectiveEnd,
        nextDueDate: due, daysToDue: daysBetween(today, due),
        frequencyMonths,
        nextAdjustmentDate: nextAdj, daysToAdjustment: nextAdj ? daysBetween(today, nextAdj) : null,
        cycleStart, accumulatedPct, accumulatedFactor, monthsCounted, daysCounted, indexThrough, indexThroughDate, adjustedRent,
    };
}
