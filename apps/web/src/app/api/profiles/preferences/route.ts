import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import {
    HIDDEN_COLUMNS_PREFIX, SORT_PREFIX, sanitizeHiddenColumns, sanitizeSort, tableKeyFromPrefKey, tableKeyFromSortPrefKey, type TableSort,
} from "@/lib/ui-preferences";

export const dynamic = "force-dynamic";

const TABLE = "user_ui_preferences";
const MAX_TABLES_PER_PUT = 20;

/**
 * GET /api/profiles/preferences
 * → { hiddenColumns: { "<table key>": string[] }, sort: { "<table key>": { key, dir } } }
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
        .or(`key.like.${HIDDEN_COLUMNS_PREFIX}%,key.like.${SORT_PREFIX}%`);
    if (error) {
        console.error("[Preferences GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar as preferências" }, { status: 500 });
    }

    const hiddenColumns: Record<string, string[]> = {};
    const sort: Record<string, TableSort> = {};
    for (const row of data ?? []) {
        const columnsTable = tableKeyFromPrefKey(row.key);
        if (columnsTable) {
            const columns = sanitizeHiddenColumns(row.value);
            if (columns) hiddenColumns[columnsTable] = columns;
            continue;
        }
        const sortTable = tableKeyFromSortPrefKey(row.key);
        if (sortTable) {
            const order = sanitizeSort(row.value);
            if (order) sort[sortTable] = order;
        }
    }
    return NextResponse.json({ hiddenColumns, sort });
}

/**
 * PUT /api/profiles/preferences
 * body { hiddenColumns?: { "<table key>": string[] }, sort?: { "<table key>": { key, dir } } } → { ok: true }
 *
 * Replaces the preferences of each table sent; tables (and kinds) not sent are left alone.
 */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let body: { hiddenColumns?: unknown; sort?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows: Array<{ profile_id: string; key: string; value: string[] | TableSort; updated_at: string }> = [];

    const collect = (
        sent: unknown,
        field: string,
        prefix: string,
        accept: (key: string) => string | null,
        sanitize: (value: unknown) => string[] | TableSort | null
    ): NextResponse | null => {
        if (sent === undefined) return null;
        if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
            return NextResponse.json({ error: `${field} deve ser um objeto por tabela` }, { status: 400 });
        }
        for (const [tableKey, value] of Object.entries(sent as Record<string, unknown>)) {
            const key = `${prefix}${tableKey}`;
            const clean = sanitize(value);
            if (!accept(key) || !clean) {
                return NextResponse.json({ error: `Preferência inválida: ${tableKey.slice(0, 80)}` }, { status: 400 });
            }
            rows.push({ profile_id: profileId, key, value: clean, updated_at: now });
        }
        return null;
    };

    const bad =
        collect(body.hiddenColumns, "hiddenColumns", HIDDEN_COLUMNS_PREFIX, tableKeyFromPrefKey, sanitizeHiddenColumns) ??
        collect(body.sort, "sort", SORT_PREFIX, tableKeyFromSortPrefKey, sanitizeSort);
    if (bad) return bad;
    if (rows.length === 0 || rows.length > MAX_TABLES_PER_PUT) {
        return NextResponse.json({ error: `Envie de 1 a ${MAX_TABLES_PER_PUT} preferências` }, { status: 400 });
    }

    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "profile_id,key" });
    if (error) {
        console.error("[Preferences PUT]", error.message);
        return NextResponse.json({ error: "Erro ao salvar as preferências" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
