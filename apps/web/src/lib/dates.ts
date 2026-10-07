/**
 * Date helpers for calendar dates (leases, due dates, birthdays).
 *
 * Postgres `date` columns arrive as "YYYY-MM-DD". `new Date("YYYY-MM-DD")`
 * parses that as UTC midnight, which in Brazil (UTC-3) is the evening of the
 * previous day, so every such date rendered one day early. These helpers
 * never let a date-only string touch the UTC parser.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-midnight Date from "YYYY-MM-DD" (or the date part of a timestamp). */
export function parseISODateLocal(iso: string): Date | null {
    const m = DATE_ONLY.exec(iso.slice(0, 10));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" from a Date, using its local calendar fields. */
export function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * "DD/MM/YYYY" for display. Date-only strings are split, never parsed;
 * timestamps and Date objects are shown in São Paulo time.
 */
export function formatDateBR(value: string | Date | null | undefined, empty = "—"): string {
    if (value == null || value === "") return empty;
    if (typeof value === "string") {
        const m = DATE_ONLY.exec(value);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        const t = new Date(value);
        if (Number.isNaN(t.getTime())) return value;
        return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(t);
    }
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(value);
}

export function daysInMonth(year: number, monthIndex: number): number {
    return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Adds calendar months keeping the anchor day, clamped to the target month's
 * length: Jan 31 + 1 → Feb 28/29, and + 2 → Mar 31 (not Mar 28, which is
 * what repeated `setMonth` produces).
 */
export function addMonthsClamped(date: Date, months: number, anchorDay = date.getDate()): Date {
    const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
    first.setDate(Math.min(anchorDay, daysInMonth(first.getFullYear(), first.getMonth())));
    return first;
}

/**
 * First date strictly after `today` in the series start + k × everyMonths
 * (k ≥ 1), each occurrence anchored on the start day. Used for the next rent
 * adjustment date.
 */
export function nextOccurrence(startISO: string, everyMonths: number, today: Date = new Date()): Date | null {
    const start = parseISODateLocal(startISO);
    if (!start || !Number.isInteger(everyMonths) || everyMonths <= 0) return null;
    const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const anchorDay = start.getDate();
    for (let k = 1; k < 1200; k++) {
        const candidate = addMonthsClamped(start, k * everyMonths, anchorDay);
        if (candidate > ref) return candidate;
    }
    return null;
}

/** The due date of a given month for a contractual due day, clamped (31 → 30 in April). */
export function dueDateInMonth(year: number, monthIndex: number, dueDay: number): Date {
    return new Date(year, monthIndex, Math.min(Math.max(1, dueDay), daysInMonth(year, monthIndex)));
}

/**
 * How many things end, and exactly when: "1 vence em 13 dias", "2 vencem em 13 e 45 dias", "1 vence hoje",
 * "3 vencem hoje, amanhã e em 45 dias" — the days left of each, nearest first, never a vague "em 90 dias".
 * Past four, the nearest three and "+N". `days` are whole days from today (≥ 0); empty → "".
 */
export function dueInDaysText(days: number[], verb: { one: string; many: string } = { one: "vence", many: "vencem" }): string {
    const sorted = days.filter(d => Number.isFinite(d) && d >= 0).map(d => Math.round(d)).sort((a, b) => a - b);
    if (sorted.length === 0) return "";
    const shown = sorted.length > 4 ? sorted.slice(0, 3) : sorted;
    const more = sorted.length - shown.length;
    const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`);
    const special = shown.filter(d => d <= 1).map(d => (d === 0 ? "hoje" : "amanhã"));
    const counted = shown.filter(d => d > 1);
    const inDays = counted.length > 0 ? `em ${list(counted.map(String))} ${counted.length === 1 && counted[0] === 1 ? "dia" : "dias"}` : "";
    const when = special.length > 0 && inDays ? list([...special, inDays]) : special.length > 0 ? list(special) : inDays;
    const n = sorted.length;
    return `${n.toLocaleString("pt-BR")} ${n === 1 ? verb.one : verb.many} ${when}${more > 0 ? ` (+${more})` : ""}`;
}
