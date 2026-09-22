import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { loadPropertyUnits } from "@/lib/property-units-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/condominium/properties → { properties: [{ id, name, address, units }] }
 *
 * The signed-in owner's multi-unit properties (the ones with units registered): each runs a condominium.
 * Oldest first, like the Imóveis page.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    try {
        const units = await loadPropertyUnits(supabase, profileId);
        const ids = [...units.entries()].filter(([, list]) => list.length > 0).map(([id]) => id);
        if (ids.length === 0) return NextResponse.json({ properties: [] });
        const { data, error } = await supabase
            .from("properties")
            .select("id, name, address, city, state, created_at")
            .in("id", ids)
            .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return NextResponse.json({
            properties: (data ?? []).map(p => ({
                id: p.id,
                name: p.name || "Imóvel",
                address: [p.address, p.city, p.state].filter(Boolean).join(", "),
                units: units.get(p.id)?.length ?? 0,
            })),
        });
    } catch (err) {
        console.error("[Condominium properties]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar os imóveis" }, { status: 500 });
    }
}
