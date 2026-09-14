import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, UUID_REGEX } from "@/lib/api-auth";
import { VALUATION_SOURCE_VALUES, type ValuationInput, type ValuationSource } from "@/lib/property-valuations";
import { loadValuations, VALUATIONS_TABLE } from "@/lib/property-valuations-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function resolve(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id);
    if (!property) return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    return { ctx: { profileId, supabase, propertyId: id } };
}

function validate(raw: unknown): { row: ValuationInput } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Linha inválida" };
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" && UUID_REGEX.test(r.id) ? r.id : undefined;
    if (typeof r.valued_on !== "string" || !ISO_DATE.test(r.valued_on)) return { error: "Data inválida (use AAAA-MM-DD)" };
    const amount = typeof r.amount === "number" ? r.amount : Number(String(r.amount ?? "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) return { error: "Valor inválido" };
    const source = (typeof r.source === "string" ? r.source.toUpperCase() : "MANUAL") as ValuationSource;
    if (!VALUATION_SOURCE_VALUES.includes(source)) return { error: "Fonte inválida" };
    const note = r.note === null || r.note === undefined ? null : String(r.note).trim().slice(0, 500) || null;
    return { row: { id, valued_on: r.valued_on, amount: Math.round(amount * 100) / 100, source, note } };
}

/** GET /api/properties/[id]/valuations → { rows } (newest first) */
export async function GET(_request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    try {
        return NextResponse.json({ rows: await loadValuations(r.ctx.supabase, r.ctx.propertyId) });
    } catch (err) {
        console.error("[Valuations GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar avaliações" }, { status: 500 });
    }
}

/** PUT /api/properties/[id]/valuations  body: { rows: ValuationInput[] } → { rows } (insert or update by id) */
export async function PUT(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;
    let body: { rows?: unknown[] };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0 || rows.length > 200) return NextResponse.json({ error: "Envie entre 1 e 200 avaliações" }, { status: 400 });
    const validated: ValuationInput[] = [];
    for (const raw of rows) {
        const v = validate(raw);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        validated.push(v.row);
    }
    for (const v of validated) {
        const payload = { property_id: propertyId, owner_id: profileId, valued_on: v.valued_on, amount: v.amount, source: v.source, note: v.note ?? null };
        const q = v.id
            ? supabase.from(VALUATIONS_TABLE).update(payload).eq("id", v.id).eq("property_id", propertyId)
            : supabase.from(VALUATIONS_TABLE).insert(payload);
        const { error } = await q;
        if (error) {
            console.error("[Valuations PUT]", error.message);
            return NextResponse.json({ error: "Erro ao salvar avaliação" }, { status: 500 });
        }
    }
    try {
        return NextResponse.json({ rows: await loadValuations(supabase, propertyId) });
    } catch (err) {
        console.error("[Valuations PUT reload]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar avaliações" }, { status: 500 });
    }
}

/** DELETE /api/properties/[id]/valuations?id=<uuid> → { ok } */
export async function DELETE(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { supabase, propertyId } = r.ctx;
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const { error } = await supabase.from(VALUATIONS_TABLE).delete().eq("id", id).eq("property_id", propertyId);
    if (error) {
        console.error("[Valuations DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir avaliação" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

