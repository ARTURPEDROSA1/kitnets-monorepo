import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import type { PropertyInvestment, PropertyInvestmentInput } from "@/lib/property-investment";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const TABLE = "property_investments";
const COLUMNS =
    "property_id, purchase_price, acquired_on, built_area_m2, lender, contract_number, financing_system, principal, annual_rate, term_months, contract_date, first_due_date, financing_status, paid_off_on, notes, created_at, updated_at";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown): number | null | "invalid" {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "invalid";
}
function date(v: unknown): string | null | "invalid" {
    if (v === null || v === undefined || v === "") return null;
    return typeof v === "string" && ISO_DATE.test(v) ? v : "invalid";
}
function text(v: unknown, max = 200): string | null {
    if (v === null || v === undefined) return null;
    const t = String(v).trim();
    return t ? t.slice(0, max) : null;
}

async function resolve(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id);
    if (!property) return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    return { ctx: { profileId, supabase, propertyId: id } };
}

/** GET /api/properties/[id]/investment → { investment | null } */
export async function GET(_request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { supabase, propertyId } = r.ctx;
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("property_id", propertyId).maybeSingle();
    if (error) {
        console.error("[Investment GET]", error.message);
        return NextResponse.json({ error: "Erro ao carregar investimento" }, { status: 500 });
    }
    return NextResponse.json({ investment: (data as unknown as PropertyInvestment | null) ?? null });
}

/** PUT /api/properties/[id]/investment  body: PropertyInvestmentInput → { investment } (upsert; only sent fields change) */
export async function PUT(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;

    let body: PropertyInvestmentInput;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    const numbers = ["purchase_price", "built_area_m2", "principal", "annual_rate"] as const;
    for (const k of numbers) {
        if (body[k] !== undefined) {
            const v = num(body[k]);
            if (v === "invalid") return NextResponse.json({ error: `${k} inválido` }, { status: 400 });
            patch[k] = k === "purchase_price" ? (v ?? 0) : v;
        }
    }
    if (body.term_months !== undefined) {
        const v = body.term_months === null || body.term_months === ("" as unknown) ? null : Number(body.term_months);
        if (v !== null && (!Number.isInteger(v) || v <= 0)) return NextResponse.json({ error: "term_months inválido" }, { status: 400 });
        patch.term_months = v;
    }
    for (const k of ["acquired_on", "contract_date", "first_due_date", "paid_off_on"] as const) {
        if (body[k] !== undefined) {
            const v = date(body[k]);
            if (v === "invalid") return NextResponse.json({ error: `${k} inválida (use AAAA-MM-DD)` }, { status: 400 });
            patch[k] = v;
        }
    }
    if (body.financing_system !== undefined) {
        const v = body.financing_system;
        if (v !== null && !["SAC", "PRICE", "OTHER"].includes(v)) return NextResponse.json({ error: "financing_system inválido" }, { status: 400 });
        patch.financing_system = v;
    }
    if (body.financing_status !== undefined) {
        if (!["NONE", "ACTIVE", "PAID_OFF"].includes(body.financing_status)) return NextResponse.json({ error: "financing_status inválido" }, { status: 400 });
        patch.financing_status = body.financing_status;
    }
    if (body.lender !== undefined) patch.lender = text(body.lender);
    if (body.contract_number !== undefined) patch.contract_number = text(body.contract_number, 80);
    if (body.notes !== undefined) patch.notes = text(body.notes, 1000);

    const { data, error } = await supabase
        .from(TABLE)
        .upsert({ ...patch, property_id: propertyId, owner_id: profileId }, { onConflict: "property_id" })
        .select(COLUMNS)
        .single();
    if (error) {
        console.error("[Investment PUT]", error.message);
        return NextResponse.json({ error: "Erro ao salvar investimento" }, { status: 500 });
    }
    return NextResponse.json({ investment: data as unknown as PropertyInvestment });
}
