/**
 * Interface preferences kept in the user's account (`user_ui_preferences`), so they follow the user to any
 * device. Pure helpers shared by the API route and the client.
 *
 * Seven kinds today, four per table (and per kind of property where the table differs by it):
 *   hidden-columns:<table>[:<variant>]   string[] of column keys           e.g. ["energy", "received"]
 *   column-widths:<table>[:<variant>]    { <column>: px }                  e.g. { notes: 320 }  (dragged header edges)
 *   sort:<table>[:<variant>]             { key, dir }                      e.g. { key: "due_on", dir: "asc" }
 *   filters:<table>:<record id>          { <column>: { text | min/max | values[] } }
 *   sidebar:collapsed-groups             string[] of menu group keys       e.g. ["contabil"]  (lib/sidebar-groups.ts)
 *   notifications:owner                  { marketing, security }           what the owner wants to receive (/proprietario)
 *   view:<page>                          "lista" | "linha" …               how a page shows its records (Contratos: table or timeline)
 *
 * Hidden columns, widths and sort are how the user wants a kind of table to look, so they are per table. Filters
 * are a question asked of one property's (or one investment's) rows, so they are per record: a filter on
 * one property's ledger never reaches another property's.
 */

export const HIDDEN_COLUMNS_PREFIX = "hidden-columns:";
export const COLUMN_WIDTHS_PREFIX = "column-widths:";
export const SORT_PREFIX = "sort:";
export const FILTERS_PREFIX = "filters:";
export const SIDEBAR_PREFIX = "sidebar:";
export const NOTIFICATIONS_PREFIX = "notifications:";
export const VIEW_PREFIX = "view:";
/** the one sidebar setting today: the menu groups the user collapsed */
export const SIDEBAR_GROUPS_KEY = "collapsed-groups";

const TABLE_KEY = /^[a-z0-9][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9-]{0,39})?$/;
const COLUMN_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_COLUMNS = 60;
const MAX_FILTER_TEXT = 200;
const MAX_FILTER_VALUES = 500;
/** How narrow and how wide a column can be dragged, in px. */
export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 1200;

/** Kind of property a table is showing: rented as a whole, or unit by unit (kitnets, apartments). */
export type PropertyKind = "single" | "multi";

/** How a table is ordered: by which column, which way. Mirrors `SortState` of the table machinery. */
export interface TableSort { key: string; dir: "asc" | "desc" }

/** One column's filter as stored: enum values as a list (a Set does not survive JSON), the rest as typed. */
export interface StoredFilter { text?: string; min?: string; max?: string; values?: string[] }
export type TableFilters = Record<string, StoredFilter>;

/** Column → width in px, for the columns the user dragged; the others keep their automatic width. */
export type ColumnWidths = Record<string, number>;

/** `income-ledger` + `multi` → `income-ledger:multi`: the name a table's choice is stored under. */
export function columnTableKey(table: string, kind?: PropertyKind): string {
    return kind ? `${table}:${kind}` : table;
}

/** `income-ledger` + a property id → `income-ledger:<uuid>`: the name one record's table filters are stored under. */
export function recordTableKey(table: string, recordId: string): string {
    return `${table}:${recordId.trim().toLowerCase()}`;
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
/** Preference key of a table's column widths, or null when the table key is not acceptable. */
export const columnWidthsPrefKey = (tableKey: string) => prefKeyOf(COLUMN_WIDTHS_PREFIX, tableKey);
/** `column-widths:income-ledger:multi` → `income-ledger:multi`; null for any other key. */
export const tableKeyFromColumnWidthsPrefKey = (prefKey: string) => tableKeyOf(COLUMN_WIDTHS_PREFIX, prefKey);
/** Preference key of a table's sort, or null when the table key is not acceptable. */
export const sortPrefKey = (tableKey: string) => prefKeyOf(SORT_PREFIX, tableKey);
/** `sort:investment-payments` → `investment-payments`; null for any other key. */
export const tableKeyFromSortPrefKey = (prefKey: string) => tableKeyOf(SORT_PREFIX, prefKey);
/** Preference key of a sidebar setting (`sidebar:collapsed-groups`), or null when the name is not acceptable. */
export const sidebarPrefKey = (name: string) => prefKeyOf(SIDEBAR_PREFIX, name);
/** `sidebar:collapsed-groups` → `collapsed-groups`; null for any other key. */
export const tableKeyFromSidebarPrefKey = (prefKey: string) => tableKeyOf(SIDEBAR_PREFIX, prefKey);
/** Preference key of a table's filters, or null when the table key is not acceptable. */
export const filtersPrefKey = (tableKey: string) => prefKeyOf(FILTERS_PREFIX, tableKey);
/** `filters:investment-payments` → `investment-payments`; null for any other key. */
export const tableKeyFromFiltersPrefKey = (prefKey: string) => tableKeyOf(FILTERS_PREFIX, prefKey);
/** Preference key of a notification setting (`notifications:owner`), or null when the name is not acceptable. */
export const notificationsPrefKey = (name: string) => prefKeyOf(NOTIFICATIONS_PREFIX, name);
/** `notifications:owner` → `owner`; null for any other key. */
export const tableKeyFromNotificationsPrefKey = (prefKey: string) => tableKeyOf(NOTIFICATIONS_PREFIX, prefKey);

/** Preference key of how a page shows its records (`view:contratos`), or null when the name is not acceptable. */
export const viewPrefKey = (page: string) => prefKeyOf(VIEW_PREFIX, page);
/** `view:contratos` → `contratos`; null for any other key. */
export const tableKeyFromViewPrefKey = (prefKey: string) => tableKeyOf(VIEW_PREFIX, prefKey);

const VIEW_MODE = /^[a-z][a-z0-9-]{0,19}$/;
/** A page's view as stored: a short slug ("lista", "linha"); null for anything else. The page decides which it knows. */
export function sanitizeViewMode(value: unknown): string | null {
    return typeof value === "string" && VIEW_MODE.test(value) ? value : null;
}

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

/** A width the table accepts: whole pixels, never narrower or wider than the limits. */
export const clampColumnWidth = (px: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(px)));

/** A clean map of column → width in px, or null when the value is junk; `{}` is a choice too — "all automatic". */
export function sanitizeColumnWidths(value: unknown): ColumnWidths | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_COLUMNS) return null;
    const out: ColumnWidths = {};
    for (const [column, px] of entries) {
        if (!COLUMN_KEY.test(column)) return null;
        if (typeof px !== "number" || !Number.isFinite(px) || px <= 0) return null;
        out[column] = clampColumnWidth(px);
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

/** What the owner wants to receive (/proprietario): e-mails de marketing, alertas de segurança. */
export interface NotificationPrefs { marketing: boolean; security: boolean }
/** The one entry under `notifications:` today. */
export const NOTIFICATIONS_KEY = "owner";
/** A clean pair of booleans, or null when the value is not one. */
export function sanitizeNotificationPrefs(value: unknown): NotificationPrefs | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.marketing !== "boolean" || typeof v.security !== "boolean") return null;
    return { marketing: v.marketing, security: v.security };
}
