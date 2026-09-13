import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, UUID_REGEX, type AdminSupabase } from "@/lib/api-auth";
import { TAX_KIND_VALUES, type PropertyTax, type PropertyTaxInput, type TaxKind, type TaxPayer } from "@/lib/property-taxes";

export const dynamic = "force-dynamic";

/**
 *   GET    /api/properties/[id]/taxes            → { rows }  (year desc)
 *   PUT    /api/properties/[id]/taxes { rows }   → { rows }  rows with id are updated, without id inserted
 *   DELETE /api/properties/[id]/taxes?id=<uuid>  → { ok }
 */

type RouteContext = { params: Promise<{ id: string }> };
const TABLE = "property_taxes";
const COLUMNS = "id, property_id, year, kind, amount, paid_by, paid_on, comment, created_at, updated_at";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYERS: TaxPayer[] = ["TENANT", "LANDLORD"];

async function resolve(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) {
        return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    }
    return { ctx: { profileId, supabase, propertyId: id } };
}

async function loadRows(supabase: AdminSupabase, propertyId: string): Promise<PropertyTax[]> {
    const { data, error } = await supabase
        .from(TABLE).select(COLUMNS).eq("property_id", propertyId)
        .order("year", { ascending: false }).order("kind", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PropertyTax[]).map(r => ({ ...r, amount: Number(r.amount) || 0 }));
}

export async function GET(_request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    try {
        return NextResponse.json({ rows: await loadRows(r.ctx.supabase, r.ctx.propertyId) });
    } catch (err) {
        console.error("[Taxes GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar tributos" }, { status: 500 });
    }
}

function validate(raw: unknown, i: number): { row: Required<Omit<PropertyTaxInput, "id">> & { id?: string } } | { error: string } {
    const where = `Linha ${i + 1}`;
    if (!raw || typeof raw !== "object") return { error: `${where}: formato inválido` };
    const r = raw as PropertyTaxInput;
    if (r.id !== undefined && !UUID_REGEX.test(String(r.id))) return { error: `${where}: id inválido` };
    const year = Number(r.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return { error: `${where}: ano inválido` };
    if (!TAX_KIND_VALUES.includes(r.kind as TaxKind)) return { error: `${where}: tributo inválido` };
    const amount = typeof r.amount === "number" ? r.amount : Number(String(r.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return { error: `${where}: valor deve ser ≥ 0` };
    if (!PAYERS.includes(r.paid_by)) return { error: `${where}: pagador inválido` };
    if (r.paid_on !== undefined && r.paid_on !== null && !ISO_DATE.test(r.paid_on)) return { error: `${where}: data inválida` };
    const comment = typeof r.comment === "string" && r.comment.trim() ? r.comment.trim().slice(0, 500) : null;
    return { row: { id: r.id, year, kind: r.kind, amount: Math.round(amount * 100) / 100, paid_by: r.paid_by, paid_on: r.paid_on ?? null, comment } };
}

export async function PUT(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;

    let body: { rows?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "rows é obrigatório" }, { status: 400 });
    if (body.rows.length > 300) return NextResponse.json({ error: "Máximo de 300 linhas por envio" }, { status: 400 });

    const rows = [];
    for (let i = 0; i < body.rows.length; i++) {
        const v = validate(body.rows[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        rows.push(v.row);
    }

    try {
        for (const row of rows.filter(x => x.id)) {
            const { id, ...fields } = row;
            const { error } = await supabase.from(TABLE).update(fields).eq("id", id!).eq("property_id", propertyId);
            if (error) throw new Error(error.message);
        }
        const inserts = rows.filter(x => !x.id).map(x => {
            const rec: Record<string, unknown> = { ...x, property_id: propertyId, owner_id: profileId };
            delete rec.id;
            return rec;
        });
        if (inserts.length) {
            const { error } = await supabase.from(TABLE).insert(inserts);
            if (error) throw new Error(error.message);
        }
        return NextResponse.json({ rows: await loadRows(supabase, propertyId) });
    } catch (err) {
        console.error("[Taxes PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar tributos" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const { error } = await r.ctx.supabase.from(TABLE).delete().eq("id", id).eq("property_id", r.ctx.propertyId);
    if (error) {
        console.error("[Taxes DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
