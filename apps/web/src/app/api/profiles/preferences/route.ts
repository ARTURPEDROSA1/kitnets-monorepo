import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { HIDDEN_COLUMNS_PREFIX, sanitizeHiddenColumns, tableKeyFromPrefKey } from "@/lib/ui-preferences";

export const dynamic = "force-dynamic";

const TABLE = "user_ui_preferences";

/**
 * GET /api/profiles/preferences
 * → { hiddenColumns: { "<table key>": string[] } }
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
        .like("key", `${HIDDEN_COLUMNS_PREFIX}%`);
    if (error) {
        console.error("[Preferences GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar as preferências" }, { status: 500 });
    }

    const hiddenColumns: Record<string, string[]> = {};
    for (const row of data ?? []) {
        const tableKey = tableKeyFromPrefKey(row.key);
        const columns = sanitizeHiddenColumns(row.value);
        if (tableKey && columns) hiddenColumns[tableKey] = columns;
    }
    return NextResponse.json({ hiddenColumns });
}

/**
 * PUT /api/profiles/preferences
 * body { hiddenColumns: { "<table key>": string[] } } → { ok: true }
 *
 * Replaces the hidden columns of each table sent; tables not sent are left alone.
 */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let body: { hiddenColumns?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    const sent = body.hiddenColumns;
    if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
        return NextResponse.json({ error: "hiddenColumns é obrigatório" }, { status: 400 });
    }
    const entries = Object.entries(sent as Record<string, unknown>);
    if (entries.length === 0 || entries.length > 20) {
        return NextResponse.json({ error: "Envie de 1 a 20 tabelas" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const rows: Array<{ profile_id: string; key: string; value: string[]; updated_at: string }> = [];
    for (const [tableKey, value] of entries) {
        const key = `${HIDDEN_COLUMNS_PREFIX}${tableKey}`;
        const columns = sanitizeHiddenColumns(value);
        if (!tableKeyFromPrefKey(key) || !columns) {
            return NextResponse.json({ error: `Preferência inválida: ${tableKey.slice(0, 80)}` }, { status: 400 });
        }
        rows.push({ profile_id: profileId, key, value: columns, updated_at: now });
    }

    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "profile_id,key" });
    if (error) {
        console.error("[Preferences PUT]", error.message);
        return NextResponse.json({ error: "Erro ao salvar as preferências" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
