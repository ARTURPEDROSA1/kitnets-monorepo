import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { sanitizeCollapsedGroups } from "@/lib/sidebar-groups";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's interface preferences, kept per profile so they follow the user across
 * devices (migration 20260930120000_user_preferences). Today: the sidebar menu groups they
 * collapsed. The browser keeps a copy in localStorage for the first paint and calls here after
 * sign-in to take the server's version (lib/sidebar-preferences.ts).
 */

/** GET /api/user-preferences → { sidebarCollapsedGroups: string[] | null }  (null: nothing saved yet) */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        const { data, error } = await supabase
            .from("user_preferences")
            .select("sidebar_collapsed_groups")
            .eq("owner_id", profileId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return NextResponse.json({
            sidebarCollapsedGroups: data ? sanitizeCollapsedGroups(data.sidebar_collapsed_groups) ?? [] : null,
        });
    } catch (err) {
        console.error("[user-preferences GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar as preferências" }, { status: 500 });
    }
}

/** PUT /api/user-preferences  body: { sidebarCollapsedGroups: string[] } → { sidebarCollapsedGroups } */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { sidebarCollapsedGroups?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    const groups = sanitizeCollapsedGroups(body?.sidebarCollapsedGroups);
    if (groups === null) return NextResponse.json({ error: "sidebarCollapsedGroups deve ser uma lista de grupos" }, { status: 400 });
    try {
        const { error } = await supabase
            .from("user_preferences")
            .upsert({ owner_id: profileId, sidebar_collapsed_groups: groups }, { onConflict: "owner_id" });
        if (error) throw new Error(error.message);
        return NextResponse.json({ sidebarCollapsedGroups: groups });
    } catch (err) {
        console.error("[user-preferences PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar as preferências" }, { status: 500 });
    }
}
