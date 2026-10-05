import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import {
    COLUMN_WIDTHS_PREFIX, FILTERS_PREFIX, HIDDEN_COLUMNS_PREFIX, NOTIFICATIONS_PREFIX, SIDEBAR_PREFIX, SORT_PREFIX, VIEW_PREFIX,
    sanitizeColumnWidths, sanitizeFilters, sanitizeHiddenColumns, sanitizeNotificationPrefs, sanitizeSort, sanitizeViewMode,
    tableKeyFromColumnWidthsPrefKey, tableKeyFromFiltersPrefKey, tableKeyFromNotificationsPrefKey, tableKeyFromPrefKey, tableKeyFromSidebarPrefKey, tableKeyFromSortPrefKey, tableKeyFromViewPrefKey,
} from "@/lib/ui-preferences";
import { sanitizeCollapsedGroups } from "@/lib/sidebar-groups";

export const dynamic = "force-dynamic";

const TABLE = "user_ui_preferences";
const MAX_ROWS_PER_PUT = 20;

/** The kinds of preference this route carries: the field in the JSON, the key prefix in the table, the checks. */
const SECTIONS = {
    hiddenColumns: { prefix: HIDDEN_COLUMNS_PREFIX, tableKey: tableKeyFromPrefKey, sanitize: sanitizeHiddenColumns },
    // the widths of the columns the user dragged, in px
    columnWidths: { prefix: COLUMN_WIDTHS_PREFIX, tableKey: tableKeyFromColumnWidthsPrefKey, sanitize: sanitizeColumnWidths },
    sort: { prefix: SORT_PREFIX, tableKey: tableKeyFromSortPrefKey, sanitize: sanitizeSort },
    filters: { prefix: FILTERS_PREFIX, tableKey: tableKeyFromFiltersPrefKey, sanitize: sanitizeFilters },
    // the sidebar's collapsed menu groups (lib/sidebar-groups.ts), one entry: "collapsed-groups"
    sidebar: { prefix: SIDEBAR_PREFIX, tableKey: tableKeyFromSidebarPrefKey, sanitize: sanitizeCollapsedGroups },
    // what the owner wants to receive (/proprietario), one entry: "owner"
    notifications: { prefix: NOTIFICATIONS_PREFIX, tableKey: tableKeyFromNotificationsPrefKey, sanitize: sanitizeNotificationPrefs },
    // how a page shows its records: "contratos" → "lista" | "linha"
    views: { prefix: VIEW_PREFIX, tableKey: tableKeyFromViewPrefKey, sanitize: sanitizeViewMode },
} as const;
type Section = keyof typeof SECTIONS;
const SECTION_NAMES = Object.keys(SECTIONS) as Section[];

/**
 * GET /api/profiles/preferences
 * → { hiddenColumns: { "<table key>": string[] }, columnWidths: { "<table key>": { "<column>": px } }, sort: { "<table key>": { key, dir } }, filters: { "<table key>": {…} } }
 *
 * The signed-in user's interface preferences (lib/ui-preferences.ts). They live in the account, so the
 * choice made on one device is there on the next.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { data, error } = await supabase
        .from(TABLE)
        .select("key, value")
        .eq("profile_id", profileId)
        .or(SECTION_NAMES.map(name => `key.like.${SECTIONS[name].prefix}%`).join(","));
    if (error) {
        console.error("[Preferences GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar as preferências" }, { status: 500 });
    }

    const out: Record<Section, Record<string, unknown>> = { hiddenColumns: {}, columnWidths: {}, sort: {}, filters: {}, sidebar: {}, notifications: {}, views: {} };
    for (const row of data ?? []) {
        for (const name of SECTION_NAMES) {
            const tableKey = SECTIONS[name].tableKey(row.key);
            if (!tableKey) continue;
            const clean = SECTIONS[name].sanitize(row.value);
            if (clean) out[name][tableKey] = clean;
            break;
        }
    }
    return NextResponse.json(out);
}

/**
 * PUT /api/profiles/preferences
 * body { hiddenColumns?: {…}, columnWidths?: {…}, sort?: {…}, filters?: {…} }, each keyed by table → { ok: true }
 *
 * Replaces the preferences of each table sent; tables (and kinds) not sent are left alone.
 */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let body: Partial<Record<Section, unknown>>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows: Array<{ profile_id: string; key: string; value: unknown; updated_at: string }> = [];
    for (const name of SECTION_NAMES) {
        const sent = body[name];
        if (sent === undefined) continue;
        if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
            return NextResponse.json({ error: `${name} deve ser um objeto por tabela` }, { status: 400 });
        }
        for (const [tableKey, value] of Object.entries(sent as Record<string, unknown>)) {
            const key = `${SECTIONS[name].prefix}${tableKey}`;
            const clean = SECTIONS[name].sanitize(value);
            if (!SECTIONS[name].tableKey(key) || !clean) {
                return NextResponse.json({ error: `Preferência inválida: ${tableKey.slice(0, 80)}` }, { status: 400 });
            }
            rows.push({ profile_id: profileId, key, value: clean, updated_at: now });
        }
    }
    if (rows.length === 0 || rows.length > MAX_ROWS_PER_PUT) {
        return NextResponse.json({ error: `Envie de 1 a ${MAX_ROWS_PER_PUT} preferências` }, { status: 400 });
    }

    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "profile_id,key" });
    if (error) {
        console.error("[Preferences PUT]", error.message);
        return NextResponse.json({ error: "Erro ao salvar as preferências" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
