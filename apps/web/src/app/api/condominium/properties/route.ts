import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { loadCondoProperties } from "@/lib/condominium-views-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/condominium/properties → { properties: [{ id, name, address, units, condominium_id }] }
 *
 * The signed-in owner's multi-unit properties (the ones with units registered): each can have one
 * condominium. `condominium_id` is null while the property has none (the "Novo condomínio" dialog
 * offers those). Oldest first, like the Imóveis page. Built by lib/condominium-views-server.ts.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        return NextResponse.json({ properties: await loadCondoProperties(supabase, profileId) });
    } catch (err) {
        console.error("[Condominium properties]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar os imóveis" }, { status: 500 });
    }
}
