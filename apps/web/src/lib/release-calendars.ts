/**
 * Centralized release date calendars and helpers for index pages.
 * 
 * This avoids duplicating calendars, parseDate(), monthNames, etc.
 * across the page component.
 */

// ─── Types ───────────────────────────────────────────────────────

export type ReleaseCalendar = Record<number, number>;

export interface CalendarEntry {
    date: string;       // DD/MM/YYYY
    ref: string;        // e.g. "Janeiro/2026"
    time: string;       // e.g. "9h"
    label?: string;     // e.g. "Índice de Variação de Aluguéis Residenciais (IVAR)"
}

// ─── IBGE Release Calendar (IPCA / INPC) ─────────────────────────
// Key = release month, Value = release day (2026 official calendar)

export const IBGE_RELEASE_DATES_2026: ReleaseCalendar = {
    1: 10,   // 10/Jan — ref Dez/2025
    2: 10,   // 10/Feb — ref Jan/2026
    3: 12,   // 12/Mar — ref Feb/2026
    4: 10,   // 10/Apr — ref Mar/2026
    5: 12,   // 12/May — ref Apr/2026
    6: 12,   // 12/Jun — ref May/2026
    7: 10,   // 10/Jul — ref Jun/2026
    8: 11,   // 11/Aug — ref Jul/2026
    9: 11,   // 11/Sep — ref Aug/2026
    10: 9,   // 09/Oct — ref Sep/2026
    11: 12,  // 12/Nov — ref Oct/2026
    12: 11,  // 11/Dec — ref Nov/2026
};

export const IBGE_CALENDAR_2026: CalendarEntry[] = [
    { date: '10/01/2026', ref: 'Dezembro/2025', time: '9h' },
    { date: '10/02/2026', ref: 'Janeiro/2026', time: '9h' },
    { date: '12/03/2026', ref: 'Fevereiro/2026', time: '9h' },
    { date: '10/04/2026', ref: 'Março/2026', time: '9h' },
    { date: '12/05/2026', ref: 'Abril/2026', time: '9h' },
    { date: '12/06/2026', ref: 'Maio/2026', time: '9h' },
    { date: '10/07/2026', ref: 'Junho/2026', time: '9h' },
    { date: '11/08/2026', ref: 'Julho/2026', time: '9h' },
    { date: '11/09/2026', ref: 'Agosto/2026', time: '9h' },
    { date: '09/10/2026', ref: 'Setembro/2026', time: '9h' },
    { date: '12/11/2026', ref: 'Outubro/2026', time: '9h' },
    { date: '11/12/2026', ref: 'Novembro/2026', time: '9h' },
    { date: '12/01/2027', ref: 'Dezembro/2026', time: '9h' },
];

// ─── IGP-M Release Calendar ──────────────────────────────────────

export const IGPM_RELEASE_DATES_2026: ReleaseCalendar = {
    1: 29,
    2: 26,
    3: 30,
    4: 29,
};

export const IGPM_CALENDAR_2026: CalendarEntry[] = [
    { date: '29/01/2026', ref: 'Janeiro/2026', time: '8h' },
    { date: '26/02/2026', ref: 'Fevereiro/2026', time: '8h' },
    { date: '30/03/2026', ref: 'Março/2026', time: '8h' },
    { date: '29/04/2026', ref: 'Abril/2026', time: '8h' },
];

// ─── IVAR Release Calendar ───────────────────────────────────────

export const IVAR_CALENDAR_2026: CalendarEntry[] = [
    { date: '06/02/2026', time: '9h', ref: 'Janeiro/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
    { date: '05/03/2026', time: '9h', ref: 'Fevereiro/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
    { date: '08/04/2026', time: '9h', ref: 'Março/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
];

// ─── COPOM / SELIC Calendar ──────────────────────────────────────

export const COPOM_DATES_2026 = [
    new Date(2026, 0, 28),  // Jan 28
    new Date(2026, 2, 18),  // Mar 18
    new Date(2026, 3, 29),  // Apr 29
    new Date(2026, 5, 17),  // Jun 17
    new Date(2026, 7, 5),   // Aug 5
    new Date(2026, 8, 16),  // Sep 16
    new Date(2026, 10, 4),  // Nov 4
    new Date(2026, 11, 9),  // Dec 9
];

// ─── Helpers ─────────────────────────────────────────────────────

/** Parse DD/MM/YYYY string to Date object */
export function parseCalendarDate(d: string): Date {
    const [day, month, year] = d.split('/').map(Number);
    return new Date(year, month - 1, day);
}

/** Get the release day for a given month/year from a calendar, with a fallback default */
export function getReleaseDay(
    calendar: ReleaseCalendar,
    calendarYear: number,
    month: number,
    year: number,
    fallbackDay = 10,
): number {
    return (year === calendarYear && calendar[month]) ? calendar[month] : fallbackDay;
}

/** Get today's date at midnight (00:00:00.000) — compute once per render */
export function getToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

// ─── Month Names (i18n) ──────────────────────────────────────────

export const MONTH_NAMES: Record<string, string[]> = {
    pt: ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    en: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    es: ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
};
