/**
 * Lease summary — pure date and index maths for the "Contrato de Aluguel" card on the property page.
 *
 * Rent adjustment: on each anniversary (every `adjustment_frequency` months, 12 by default) the rent is
 * corrected by the index accumulated over the cycle that just ended, counted the way the market counts
 * it (calculoexato.com.br, the imobiliárias): the contract's months run from its day to the same day of
 * the next month (16/09 → 16/10 → 16/11 …) and each takes the whole index of the calendar month it
 * starts in, so a yearly cycle that starts in September compounds September … August. "Accumulated to
 * date" counts nothing before the cycle's first month closes; from then on it is the closed months
 * plus the month in course by the day, and "rent adjusted to date" is what the rent would become if
 * the adjustment happened today.
 *
 * Dates are `YYYY-MM-DD` strings handled in UTC, so a user's time zone never shifts a day.
 */
import { addMonths as addMonthKey } from "@/lib/index-correction";

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
    /** `YYYY-MM-DD` the cycle's first month closes: nothing is counted before it */
    firstClosingDate: string | null;
    /** index accumulated in the cycle to `indexThroughDate`, in % (see `accumulate`); null without a series */
    accumulatedPct: number | null;
    /** the exact factor behind `accumulatedPct` (1 while nothing counts); null without a series */
    accumulatedFactor: number | null;
    /** whole months of the contract counted; 0 = the first one has not closed, or its index is not published */
    monthsCounted: number;
    /** days of the month in course counted on top of them (0 when its index is not published yet) */
    daysCounted: number;
    /** last index month used, `YYYY-MM` */
    indexThrough: string | null;
    /** `YYYY-MM-DD` the accumulated figure runs to: today, or the last monthly anniversary counted */
    indexThroughDate: string | null;
    /** rent × accumulated factor; null without a series */
    adjustedRent: number | null;
    /** the whole cycle's index, in % — what the adjustment is made by; null until every month of the cycle is published */
    closingPct: number | null;
    /** rent × the whole cycle's index; null until then */
    closingRent: number | null;
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
    /** whole months of the contract counted */
    months: number;
    /** days of the month in course counted on top of them */
    days: number;
    /** last index month used, `YYYY-MM` */
    through: string | null;
    /** `YYYY-MM-DD` the figure runs to: today, or the last monthly anniversary counted */
    throughDate: string | null;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
/** To the cent, without a binary tail (253.925 kept as 253.92499…) rounding the wrong way. */
export const cents = (v: number) => Math.round(Number((v * 100).toPrecision(12))) / 100;

const ratesOf = (series: IndexPoint[]) => {
    const rates = new Map<string, number>();
    for (const p of series) if (Number.isFinite(p.value)) rates.set(p.month, p.value);
    return rates;
};

/**
 * The index accumulated in a cycle that started on `cycleStart`, seen on `today`. The contract's
 * months run from the cycle's day to the same day of the next month, and the n-th takes the whole
 * index of the calendar month it starts in (16/09 → 16/10 takes September's): the market's count, so
 * every monthly anniversary lands on the figure calculoexato.com.br gives for it. Nothing counts
 * before the first of them closes. From then on the month in course enters by the day,
 * (1 + index)^(days elapsed ÷ days of that month of the contract), once its index is published.
 * A closed month whose index is not published yet stops the count where it stands. `periods` is the
 * cycle's length in months.
 */
export function accumulate(series: IndexPoint[], cycleStart: string, today: string, periods: number): Accumulated {
    const start = cycleStart.slice(0, 10);
    const rates = ratesOf(series);
    const indexMonth = (n: number) => addMonthKey(start.slice(0, 7), n);   // of the contract's (n + 1)-th month

    let factor = 1, months = 0;
    while (months < periods && addMonths(start, months + 1) <= today) {
        const rate = rates.get(indexMonth(months));
        if (rate === undefined) break;
        factor *= 1 + rate / 100;
        months++;
    }
    if (months === 0) return { factor: 1, pct: 0, months: 0, days: 0, through: null, throughDate: null };

    let days = 0, through = indexMonth(months - 1), throughDate = addMonths(start, months);
    // the month in course, by the day: only on top of every closed month, and never past the cycle
    const from = throughDate, to = addMonths(start, months + 1);
    const rate = rates.get(indexMonth(months));
    if (months < periods && today > from && today < to && rate !== undefined) {
        days = daysBetween(from, today);
        factor *= Math.pow(1 + rate / 100, days / daysBetween(from, to));
        through = indexMonth(months);
        throughDate = today;
    }
    return { factor, pct: round2((factor - 1) * 100), months, days, through, throughDate };
}

/**
 * The whole cycle's index as a factor — its `periods` months, from the calendar month the cycle starts
 * in — or null while one of them is not published. It is what the adjustment is made by: for a yearly
 * cycle from 16/09/2026, September/2026 … August/2027.
 */
export function cycleFactor(series: IndexPoint[], cycleStart: string, periods: number): number | null {
    const rates = ratesOf(series);
    let factor = 1;
    for (let n = 0; n < periods; n++) {
        const rate = rates.get(addMonthKey(cycleStart.slice(0, 7), n));
        if (rate === undefined) return null;
        factor *= 1 + rate / 100;
    }
    return periods > 0 ? factor : null;
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
    let closingPct: number | null = null, closingRent: number | null = null;
    if (series && series.length > 0 && nextAdj && cycleStart) {
        // the cycle's months: the frequency's, fewer when the stored adjustment date cuts the first cycle short
        let periods = 0;
        while (periods < frequencyMonths && addMonths(cycleStart, periods + 1) <= nextAdj) periods++;
        const acc = accumulate(series, cycleStart, today, periods);
        accumulatedPct = acc.pct;
        accumulatedFactor = acc.factor;
        monthsCounted = acc.months;
        daysCounted = acc.days;
        indexThrough = acc.through;
        indexThroughDate = acc.throughDate;
        adjustedRent = cents(lease.monthly_rent * acc.factor);
        const closing = cycleFactor(series, cycleStart, periods);
        if (closing !== null) {
            closingPct = round2((closing - 1) * 100);
            closingRent = cents(lease.monthly_rent * closing);
        }
    }
    return {
        daysElapsed, daysLeft, progressPct, effectiveEnd,
        nextDueDate: due, daysToDue: daysBetween(today, due),
        frequencyMonths,
        nextAdjustmentDate: nextAdj, daysToAdjustment: nextAdj ? daysBetween(today, nextAdj) : null,
        cycleStart, firstClosingDate: cycleStart ? addMonths(cycleStart, 1) : null,
        accumulatedPct, accumulatedFactor, monthsCounted, daysCounted, indexThrough, indexThroughDate, adjustedRent, closingPct, closingRent,
    };
}
