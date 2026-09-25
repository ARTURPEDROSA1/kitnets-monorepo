import { NextResponse } from "next/server";
import { getOwnedProperty, requireProfile } from "@/lib/api-auth";
import { loadPropertyUnits } from "@/lib/property-units-server";
import { CONDOMINIUMS_TABLE } from "@/lib/condominium-server";
import { CONDOMINIUM_COLUMNS, loadCondominiumList } from "@/lib/condominium-views-server";

export const dynamic = "force-dynamic";

/**
 *   GET  /api/condominium                        → { condominiums }   the owner's condominiums with their card KPIs and the property's photos
 *   POST /api/condominium { property_id, name }  → { condominium }    creates the condominium of a multi-unit property
 *
 * A condominium belongs to one multi-unit property (a property with units) and a property has one condominium.
 * The list is built by lib/condominium-views-server.ts, which the Condomínio page preloads with as well.
 */

export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        return NextResponse.json({ condominiums: await loadCondominiumList(supabase, profileId) });
    } catch (err) {
        console.error("[Condominiums GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar os condomínios" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let body: { property_id?: unknown; name?: unknown; notes?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    const propertyId = typeof body.property_id === "string" ? body.property_id : "";
    const property = await getOwnedProperty(supabase, profileId, propertyId, "id, name");
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const units = (await loadPropertyUnits(supabase, profileId)).get(propertyId) ?? [];
    if (units.length === 0) {
        return NextResponse.json({ error: "Só um imóvel com unidades cadastradas (multifamiliar) tem condomínio. Cadastre as unidades em Imóveis primeiro." }, { status: 400 });
    }
    const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 120) || `Condomínio ${String(property.name ?? "").trim() || "do imóvel"}`;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;

    const { data, error } = await supabase
        .from(CONDOMINIUMS_TABLE)
        .insert({ owner_id: profileId, property_id: propertyId, name, notes })
        .select(CONDOMINIUM_COLUMNS)
        .single();
    if (error) {
        if (error.code === "23505") return NextResponse.json({ error: "Este imóvel já tem um condomínio." }, { status: 409 });
        console.error("[Condominiums POST]", error.message);
        return NextResponse.json({ error: "Erro ao criar o condomínio" }, { status: 500 });
    }
    return NextResponse.json({ condominium: data }, { status: 201 });
}
