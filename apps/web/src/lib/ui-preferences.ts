/**
 * Interface preferences kept in the user's account (`user_ui_preferences`), so they follow the user to any
 * device. Pure helpers shared by the API route and the client.
 *
 * Today there is one kind: the columns hidden in a table, per table and per kind of property.
 *   key    hidden-columns:<table>[:<variant>]      e.g. hidden-columns:income-ledger:multi
 *   value  string[] of column keys                 e.g. ["energy", "received"]
 */

export const HIDDEN_COLUMNS_PREFIX = "hidden-columns:";

const TABLE_KEY = /^[a-z0-9][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9-]{0,39})?$/;
const COLUMN_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_COLUMNS = 60;

/** Kind of property a table is showing: rented as a whole, or unit by unit (kitnets, apartments). */
export type PropertyKind = "single" | "multi";

/** `income-ledger` + `multi` → `income-ledger:multi`: the name a table's choice is stored under. */
export function columnTableKey(table: string, kind?: PropertyKind): string {
    return kind ? `${table}:${kind}` : table;
}

/** Preference key of a table's hidden columns, or null when the table key is not acceptable. */
export function hiddenColumnsPrefKey(tableKey: string): string | null {
    return TABLE_KEY.test(tableKey) ? `${HIDDEN_COLUMNS_PREFIX}${tableKey}` : null;
}

/** `hidden-columns:income-ledger:multi` → `income-ledger:multi`; null for any other key. */
export function tableKeyFromPrefKey(prefKey: string): string | null {
    if (!prefKey.startsWith(HIDDEN_COLUMNS_PREFIX)) return null;
    const tableKey = prefKey.slice(HIDDEN_COLUMNS_PREFIX.length);
    return TABLE_KEY.test(tableKey) ? tableKey : null;
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
