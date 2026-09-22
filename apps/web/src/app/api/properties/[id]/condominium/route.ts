import { NextResponse } from "next/server";
import { getOwnedProperty, requireProfile } from "@/lib/api-auth";
import { MONTH_KEY_REGEX } from "@/lib/property-income";
import { CONDO_COST_KEYS, type CondominiumCostInput } from "@/lib/condominium";
import { CONDO_COSTS_TABLE as TABLE, loadCosts, loadMonths } from "@/lib/condominium-server";

export const dynamic = "force-dynamic";

/**
 *   GET    /api/properties/[id]/condominium                → { months, costs }
 *   PUT    /api/properties/[id]/condominium { rows }       → { months, costs }   merge upsert, one row per month
 *   DELETE /api/properties/[id]/condominium?month=YYYY-MM  → { ok }             removes the month's cost row
 *
 * `months` (lib/condominium.ts) joins the condominium charged in the income ledger (revenue) with the
 * cost rows of `condominium_months`, newest first. `costs` are the raw cost rows.
 */

const MAX_ROWS = 300;

type RouteContext = { params: Promise<{ id: string }> };

async function resolveProperty(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) {
        return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    }
    return { ctx: { profileId, supabase, propertyId: id } };
}

export async function GET(_request: Request, context: RouteContext) {
    const r = await resolveProperty(context);
    if ("response" in r) return r.response;
    try {
        return NextResponse.json(await loadMonths(r.ctx.supabase, r.ctx.propertyId));
    } catch (err) {
        console.error("[Condominium GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o condomínio" }, { status: 500 });
    }
}

function validate(raw: unknown, index: number): { row: CondominiumCostInput } | { error: string } {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r.month !== "string" || !MONTH_KEY_REGEX.test(r.month)) return { error: `Linha ${index + 1}: mês inválido (use AAAA-MM)` };
    const row: CondominiumCostInput = { month: r.month };
    for (const key of CONDO_COST_KEYS) {
        if (r[key] === undefined) continue;
        const v = Number(r[key]);
        if (!Number.isFinite(v) || v < 0 || v > 1e9) return { error: `Linha ${index + 1} (${r.month}): ${key} deve ser um número ≥ 0` };
        row[key] = Math.round(v * 100) / 100;
    }
    if (r.notes !== undefined) {
        if (r.notes !== null && typeof r.notes !== "string") return { error: `Linha ${index + 1} (${r.month}): descrição inválida` };
        row.notes = r.notes ? String(r.notes).trim().slice(0, 500) || null : null;
    }
    return { row };
}

export async function PUT(request: Request, context: RouteContext) {
    const r = await resolveProperty(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;

    let body: { rows?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "rows é obrigatório" }, { status: 400 });
    if (body.rows.length > MAX_ROWS) return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por envio` }, { status: 400 });

    const inputs: CondominiumCostInput[] = [];
    for (let i = 0; i < body.rows.length; i++) {
        const v = validate(body.rows[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        inputs.push(v.row);
    }

    try {
        const existing = new Map((await loadCosts(supabase, propertyId)).map(c => [c.month.slice(0, 7), c] as const));
        const merged = new Map<string, Record<string, unknown>>();
        for (const input of inputs) {
            const prev = merged.get(input.month) ?? existing.get(input.month);
            const base: Record<string, unknown> = prev
                ? { ...prev }
                : { energy_cost: 0, internet_cost: 0, water_cost: 0, iptu_amount: 0, maintenance_cost: 0, notes: null };
            delete base.id;
            delete base.updated_at;
            const { month, ...fields } = input;
            merged.set(month, { ...base, ...fields, property_id: propertyId, owner_id: profileId, month: `${month}-01` });
        }
        const { error } = await supabase.from(TABLE).upsert(Array.from(merged.values()) as never, { onConflict: "property_id,month" });
        if (error) throw new Error(error.message);
        return NextResponse.json(await loadMonths(supabase, propertyId));
    } catch (err) {
        console.error("[Condominium PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar o condomínio" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const r = await resolveProperty(context);
    if ("response" in r) return r.response;
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!MONTH_KEY_REGEX.test(month)) return NextResponse.json({ error: "month inválido (use AAAA-MM)" }, { status: 400 });
    const { error } = await r.ctx.supabase.from(TABLE).delete().eq("property_id", r.ctx.propertyId).eq("month", `${month}-01`);
    if (error) {
        console.error("[Condominium DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao remover o mês" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
