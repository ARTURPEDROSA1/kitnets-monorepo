import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { CONDO_COSTS_TABLE, CONDOMINIUMS_TABLE } from "@/lib/condominium-server";

export const dynamic = "force-dynamic";

/**
 *   PATCH  /api/condominium/[id] { name?, notes?, solar_payback_from_result? } → { condominium }
 *   DELETE /api/condominium/[id]                   → { ok }   also removes the property's condominium cost rows
 *
 * The condominium charged to the units stays in Receitas de Aluguel: deleting a condominium only removes
 * the record and the costs entered on the Condomínio page.
 */

type RouteContext = { params: Promise<{ id: string }> };

async function resolve(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) return { response: NextResponse.json({ error: "Condomínio não encontrado" }, { status: 404 }) };
    const { data } = await supabase.from(CONDOMINIUMS_TABLE).select("id, property_id").eq("id", id).eq("owner_id", profileId).maybeSingle();
    if (!data) return { response: NextResponse.json({ error: "Condomínio não encontrado" }, { status: 404 }) };
    return { ctx: { profileId, supabase, id, propertyId: data.property_id } };
}

export async function PATCH(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    let body: { name?: unknown; notes?: unknown; solar_payback_from_result?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    const patch: { name?: string; notes?: string | null; solar_payback_from_result?: boolean } = {};
    if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
        if (!name) return NextResponse.json({ error: "Informe o nome do condomínio" }, { status: 400 });
        patch.name = name;
    }
    if (body.notes !== undefined) patch.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;
    if (body.solar_payback_from_result !== undefined) {
        if (typeof body.solar_payback_from_result !== "boolean") return NextResponse.json({ error: "solar_payback_from_result deve ser verdadeiro ou falso" }, { status: 400 });
        patch.solar_payback_from_result = body.solar_payback_from_result;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });

    const { data, error } = await r.ctx.supabase.from(CONDOMINIUMS_TABLE).update(patch).eq("id", r.ctx.id).select("id, property_id, name, notes, solar_payback_from_result, created_at, updated_at").single();
    if (error) {
        console.error("[Condominium PATCH]", error.message);
        return NextResponse.json({ error: "Erro ao salvar o condomínio" }, { status: 500 });
    }
    return NextResponse.json({ condominium: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { supabase, id, propertyId } = r.ctx;
    const costs = await supabase.from(CONDO_COSTS_TABLE).delete().eq("property_id", propertyId);
    if (costs.error) {
        console.error("[Condominium DELETE costs]", costs.error.message);
        return NextResponse.json({ error: "Erro ao remover os custos do condomínio" }, { status: 500 });
    }
    const { error } = await supabase.from(CONDOMINIUMS_TABLE).delete().eq("id", id);
    if (error) {
        console.error("[Condominium DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao remover o condomínio" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
