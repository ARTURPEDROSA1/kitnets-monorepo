/**
 * Lease summary — pure date and index maths for the "Contrato de Aluguel" card on the property page.
 *
 * Rent adjustment, as Brazilian leases do it: on each anniversary (every `adjustment_frequency` months,
 * 12 by default) the rent is corrected by the index accumulated over the cycle that just ended. A cycle
 * that starts in April counts the monthly figures of April … March, and the new rent applies from April.
 * So "accumulated to date" compounds the months of the current cycle already published, and
 * "rent adjusted to date" is what the rent would become if the adjustment happened today.
 *
 * Dates are `YYYY-MM-DD` strings handled in UTC, so a user's time zone never shifts a day.
 */
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
    /** compound index of the cycle's months already published, in %; null without a series */
    accumulatedPct: number | null;
    monthsCounted: number;
    /** last month included, `YYYY-MM` */
    indexThrough: string | null;
    /** rent × (1 + accumulated); null without a series */
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

/** Compound variation of the series' months inside `[fromMonth, toMonth]`, in %. */
export function accumulate(series: IndexPoint[], fromMonth: string, toMonth: string): { pct: number; months: number; through: string | null } {
    let factor = 1, months = 0, through: string | null = null;
    for (const p of [...series].sort((a, b) => (a.month < b.month ? -1 : 1))) {
        if (p.month < fromMonth || p.month > toMonth || !Number.isFinite(p.value)) continue;
        factor *= 1 + p.value / 100;
        months++;
        through = p.month;
    }
    return { pct: Math.round((factor - 1) * 10000) / 100, months, through };
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

    let accumulatedPct: number | null = null, monthsCounted = 0, indexThrough: string | null = null, adjustedRent: number | null = null;
    if (series && series.length > 0 && nextAdj && cycleStart) {
        // the cycle's months: from the cycle's first month to the month before the adjustment
        const acc = accumulate(series, cycleStart.slice(0, 7), addMonths(nextAdj.slice(0, 7) + "-01", -1).slice(0, 7));
        accumulatedPct = acc.pct;
        monthsCounted = acc.months;
        indexThrough = acc.through;
        adjustedRent = Math.round(lease.monthly_rent * (1 + acc.pct / 100) * 100) / 100;
    }
    return {
        daysElapsed, daysLeft, progressPct, effectiveEnd,
        nextDueDate: due, daysToDue: daysBetween(today, due),
        frequencyMonths,
        nextAdjustmentDate: nextAdj, daysToAdjustment: nextAdj ? daysBetween(today, nextAdj) : null,
        cycleStart, accumulatedPct, monthsCounted, indexThrough, adjustedRent,
    };
}
