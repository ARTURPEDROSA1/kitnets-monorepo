/**
 * Interface preferences kept in the user's account (`user_ui_preferences`), so they follow the user to any
 * device. Pure helpers shared by the API route and the client.
 *
 * Three kinds today, all per table (and per kind of property where the table differs by it):
 *   hidden-columns:<table>[:<variant>]   string[] of column keys           e.g. ["energy", "received"]
 *   sort:<table>[:<variant>]             { key, dir }                      e.g. { key: "due_on", dir: "asc" }
 *   filters:<table>[:<variant>]          { <column>: { text | min/max | values[] } }
 */

export const HIDDEN_COLUMNS_PREFIX = "hidden-columns:";
export const SORT_PREFIX = "sort:";
export const FILTERS_PREFIX = "filters:";

const TABLE_KEY = /^[a-z0-9][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9-]{0,39})?$/;
const COLUMN_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_COLUMNS = 60;
const MAX_FILTER_TEXT = 200;
const MAX_FILTER_VALUES = 500;

/** Kind of property a table is showing: rented as a whole, or unit by unit (kitnets, apartments). */
export type PropertyKind = "single" | "multi";

/** How a table is ordered: by which column, which way. Mirrors `SortState` of the table machinery. */
export interface TableSort { key: string; dir: "asc" | "desc" }

/** One column's filter as stored: enum values as a list (a Set does not survive JSON), the rest as typed. */
export interface StoredFilter { text?: string; min?: string; max?: string; values?: string[] }
export type TableFilters = Record<string, StoredFilter>;

/** `income-ledger` + `multi` → `income-ledger:multi`: the name a table's choice is stored under. */
export function columnTableKey(table: string, kind?: PropertyKind): string {
    return kind ? `${table}:${kind}` : table;
}

const prefKeyOf = (prefix: string, tableKey: string) => (TABLE_KEY.test(tableKey) ? `${prefix}${tableKey}` : null);
const tableKeyOf = (prefix: string, prefKey: string) => {
    if (!prefKey.startsWith(prefix)) return null;
    const tableKey = prefKey.slice(prefix.length);
    return TABLE_KEY.test(tableKey) ? tableKey : null;
};

/** Preference key of a table's hidden columns, or null when the table key is not acceptable. */
export const hiddenColumnsPrefKey = (tableKey: string) => prefKeyOf(HIDDEN_COLUMNS_PREFIX, tableKey);
/** `hidden-columns:income-ledger:multi` → `income-ledger:multi`; null for any other key. */
export const tableKeyFromPrefKey = (prefKey: string) => tableKeyOf(HIDDEN_COLUMNS_PREFIX, prefKey);
/** Preference key of a table's sort, or null when the table key is not acceptable. */
export const sortPrefKey = (tableKey: string) => prefKeyOf(SORT_PREFIX, tableKey);
/** `sort:investment-payments` → `investment-payments`; null for any other key. */
export const tableKeyFromSortPrefKey = (prefKey: string) => tableKeyOf(SORT_PREFIX, prefKey);
/** Preference key of a table's filters, or null when the table key is not acceptable. */
export const filtersPrefKey = (tableKey: string) => prefKeyOf(FILTERS_PREFIX, tableKey);
/** `filters:investment-payments` → `investment-payments`; null for any other key. */
export const tableKeyFromFiltersPrefKey = (prefKey: string) => tableKeyOf(FILTERS_PREFIX, prefKey);

/** A clean list of column keys (no duplicates, no junk), or null when the value is not a list of them. */
export function sanitizeHiddenColumns(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length > MAX_COLUMNS) return null;
    const out: string[] = [];
    for (const v of value) {
        if (typeof v !== "string" || !COLUMN_KEY.test(v)) return null;
        if (!out.includes(v)) out.push(v);
    }
    return out;
}

/** A clean `{ key, dir }`, or null when the value is not one. */
export function sanitizeSort(value: unknown): TableSort | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { key, dir } = value as { key?: unknown; dir?: unknown };
    if (typeof key !== "string" || !COLUMN_KEY.test(key)) return null;
    if (dir !== "asc" && dir !== "desc") return null;
    return { key, dir };
}

const shortText = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null) return undefined;
    return typeof v === "string" && v.length <= MAX_FILTER_TEXT ? v : null;
};

/**
 * A clean map of column → filter, or null when the value is junk. Filters that say nothing (blank text,
 * no bounds, no value list) are dropped; `{}` is a choice too — "no filters".
 */
export function sanitizeFilters(value: unknown): TableFilters | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_COLUMNS) return null;
    const out: TableFilters = {};
    for (const [column, raw] of entries) {
        if (!COLUMN_KEY.test(column)) return null;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const f = raw as Record<string, unknown>;
        const text = shortText(f.text), min = shortText(f.min), max = shortText(f.max);
        if (text === null || min === null || max === null) return null;
        let values: string[] | undefined;
        if (f.values !== undefined && f.values !== null) {
            if (!Array.isArray(f.values) || f.values.length > MAX_FILTER_VALUES) return null;
            values = [];
            for (const v of f.values) {
                if (typeof v !== "string" || v.length > MAX_FILTER_TEXT) return null;
                if (!values.includes(v)) values.push(v);
            }
        }
        const clean: StoredFilter = {};
        if (text?.trim()) clean.text = text;
        if (min?.trim()) clean.min = min;
        if (max?.trim()) clean.max = max;
        if (values) clean.values = values;
        if (Object.keys(clean).length > 0) out[column] = clean;
    }
    return out;
}
