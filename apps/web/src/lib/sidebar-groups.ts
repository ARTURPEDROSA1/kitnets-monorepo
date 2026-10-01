/**
 * The sidebar menu groups of the logged-in area and the validation of a saved "collapsed groups"
 * list. Shared by the browser store (lib/sidebar-preferences.ts) and the API route that keeps the
 * list per user (app/api/user-preferences), so both accept exactly the same keys.
 */
export const SIDEBAR_GROUP_KEYS = ["operacao", "contabil", "ferramentas", "configuracoes"] as const;

export type SidebarGroupKey = (typeof SIDEBAR_GROUP_KEYS)[number];

/**
 * The known group keys of `input`, in menu order and without repeats; null when `input` is not a
 * list of strings at all (a bad request), [] when nothing known is in it.
 */
export function sanitizeCollapsedGroups(input: unknown): SidebarGroupKey[] | null {
    if (!Array.isArray(input) || input.some((k) => typeof k !== "string")) return null;
    const wanted = new Set(input as string[]);
    return SIDEBAR_GROUP_KEYS.filter((k) => wanted.has(k));
}
