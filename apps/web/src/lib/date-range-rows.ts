/**
 * Slicing a cached series in memory. The public index pages used to send their date window to
 * Supabase on every request; now the whole series of a place sits in the data cache for an hour
 * (lib/indexes.ts `cachedRead`) and the window is applied here, so a page view costs no database
 * egress unless the cache is cold.
 */
export interface DatedRow { reference_date: string }

/** Rows with `start <= reference_date <= end` (ISO dates, each bound optional); order kept. */
export function sliceByDateRange<T extends DatedRow>(rows: readonly T[], start?: string | null, end?: string | null): T[] {
    if (!start && !end) return [...rows];
    return rows.filter(r => (!start || r.reference_date >= start) && (!end || r.reference_date <= end));
}
