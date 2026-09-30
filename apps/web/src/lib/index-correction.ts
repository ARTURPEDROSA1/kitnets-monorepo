/**
 * Correction of an amount by a monthly index between two dates: the calculator of every /indices page.
 *
 * The series (IPCA, IGP-M, INPC, IVAR, FipeZAP, CDI, Selic, salário mínimo) publish one rate per month.
 * The period counts the calendar days elapsed between the two dates — the start day is not counted,
 * the end day is — so a whole month runs from its last day to the next month's last day, and the old
 * month-precision links ("2025-08" → "2026-08") keep meaning "the rates of 09/2025 through 08/2026".
 * A partial month applies its rate pro rata die with compound capitalisation:
 * factor = (1 + i)^(days applied / days in the month). For CDI and Selic this approximates the
 * business-day compounding the market uses; the difference is cents on a thousand.
 */

export interface IndexMonthValue {
    /** "YYYY-MM" */
    month: string;
    /** the month's variation in % */
    value: number;
}

export interface CorrectionRow {
    /** "YYYY-MM" */
    month: string;
    /** the published rate of the month, % */
    indexPercent: number;
    /** calendar days of this month inside the period */
    daysApplied: number;
    daysInMonth: number;
    /** daysApplied / daysInMonth (1 for a whole month) */
    fraction: number;
    /** the rate actually applied, % (pro rata die when the month is partial) */
    appliedPercent: number;
    factor: number;
    /** the amount after this month's stretch */
    valueAtMonth: number;
    deltaMonth: number;
}

export interface CorrectionResult {
    correctedValue: number;
    totalCorrection: number;
    accumulatedPercent: number;
    /** calendar days elapsed between the dates */
    days: number;
    /** months of index applied (sum of the fractions) */
    months: number;
    /** ISO dates */
    startDate: string;
    endDate: string;
    rows: CorrectionRow[];
}

export type CorrectionOutcome = CorrectionResult | { error: string };

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_MONTH = /^\d{4}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" → number of days in that month. */
export function daysInMonth(month: string): number {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function firstDayOfMonth(month: string): string {
    return `${month}-01`;
}

export function lastDayOfMonth(month: string): string {
    return `${month}-${pad(daysInMonth(month))}`;
}

/** "YYYY-MM-DD" → "YYYY-MM" */
export function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
    const [y, m] = month.split("-").map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Whole days since the epoch, UTC, so daylight-saving never produces a 23-hour day. */
function dayNumber(date: string): number {
    const [y, m, d] = date.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
    return dayNumber(to) - dayNumber(from);
}

/** "2026-03-17" → "17/03/2026" */
export function formatDateBR(date: string): string {
    const [y, m, d] = date.split("-");
    return `${d}/${m}/${y}`;
}

/** "2026-03" → "03/2026" */
export function formatMonthBR(month: string): string {
    const [y, m] = month.split("-");
    return `${m}/${y}`;
}

/** "12" for whole months, "12,5" otherwise. */
export function formatMonthsCount(months: number): string {
    const rounded = Math.round(months * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

/**
 * A date from a calculator link: an ISO date as is, or the old month form, which meant the month's
 * last day (the start month was left out of the correction, the end month was counted whole).
 */
export function normalizeCalcDate(param: string | null | undefined): string | null {
    if (!param) return null;
    if (ISO_DATE.test(param)) return param;
    if (ISO_MONTH.test(param)) return lastDayOfMonth(param);
    return null;
}

function isRealDate(date: string): boolean {
    if (!ISO_DATE.test(date)) return false;
    const [y, m, d] = date.split("-").map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(`${y}-${pad(m)}`);
}

/** Corrects `originalValue` from `startDate` to `endDate` (ISO dates) by the monthly series `data`. */
export function correctByIndex(originalValue: number, startDate: string, endDate: string, data: IndexMonthValue[]): CorrectionOutcome {
    if (!isRealDate(startDate) || !isRealDate(endDate)) return { error: "Informe datas válidas (dd/mm/aaaa)." };
    if (endDate <= startDate) return { error: "A data final deve ser posterior à data inicial." };

    const rates = new Map<string, number>();
    for (const d of data) rates.set(d.month, d.value);

    const startMonth = monthOf(startDate);
    const endMonth = monthOf(endDate);
    const startDay = Number(startDate.slice(8, 10));
    const endDay = Number(endDate.slice(8, 10));

    const rows: CorrectionRow[] = [];
    let value = originalValue;
    let months = 0;
    for (let month = startMonth; month <= endMonth; month = addMonths(month, 1)) {
        const dim = daysInMonth(month);
        const from = month === startMonth ? startDay : 0;   // days of the month already gone when the period starts
        const to = month === endMonth ? endDay : dim;        // last day of the month inside the period
        const daysApplied = to - from;
        if (daysApplied <= 0) continue;                      // a period starting on the month's last day takes nothing from it

        const rate = rates.get(month);
        if (rate === undefined) return { error: `Dados indisponíveis para ${formatMonthBR(month)}. Ajuste o período.` };

        const fraction = daysApplied / dim;
        const whole = daysApplied === dim;
        const factor = whole ? 1 + rate / 100 : Math.pow(1 + rate / 100, fraction);
        const next = value * factor;
        rows.push({
            month,
            indexPercent: rate,
            daysApplied,
            daysInMonth: dim,
            fraction,
            appliedPercent: whole ? rate : (factor - 1) * 100,
            factor,
            valueAtMonth: next,
            deltaMonth: next - value,
        });
        value = next;
        months += fraction;
    }

    return {
        correctedValue: value,
        totalCorrection: value - originalValue,
        accumulatedPercent: (value / originalValue - 1) * 100,
        days: daysBetween(startDate, endDate),
        months,
        startDate,
        endDate,
        rows,
    };
}
