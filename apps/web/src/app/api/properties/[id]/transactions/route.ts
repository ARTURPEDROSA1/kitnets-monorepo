import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, UUID_REGEX, type AdminSupabase } from "@/lib/api-auth";
import {
    TRANSACTION_KIND_VALUES,
    type PropertyTransaction,
    type TransactionInput,
    type TransactionKind,
    type TransactionSource,
} from "@/lib/property-investment";

export const dynamic = "force-dynamic";

/**
 *   GET    /api/properties/[id]/transactions                  → { rows }  (newest first)
 *   PUT    /api/properties/[id]/transactions { rows, replace? } → { rows }
 *            rows with `id` are updated, without `id` inserted; replace: true wipes the
 *            property's transactions first (spreadsheet import)
 *   DELETE /api/properties/[id]/transactions?id=<uuid>         → { ok }
 */

type RouteContext = { params: Promise<{ id: string }> };

const TABLE = "property_transactions";
const COLUMNS = "id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference, created_at, updated_at";
const MAX_ROWS = 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: TransactionSource[] = ["MANUAL", "IMPORT", "BANK"];

function money(v: unknown): number | null | "invalid" {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "invalid";
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

async function loadRows(supabase: AdminSupabase, propertyId: string): Promise<PropertyTransaction[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("property_id", propertyId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PropertyTransaction[]).map(r => ({
        ...r,
        amount: Number(r.amount) || 0,
        interest_part: r.interest_part === null ? null : Number(r.interest_part),
        principal_part: r.principal_part === null ? null : Number(r.principal_part),
        insurance_part: r.insurance_part === null ? null : Number(r.insurance_part),
    }));
}

export async function GET(_request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    try {
        return NextResponse.json({ rows: await loadRows(r.ctx.supabase, r.ctx.propertyId) });
    } catch (err) {
        console.error("[Transactions GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar lançamentos" }, { status: 500 });
    }
}

interface Validated {
    id?: string;
    occurred_on: string;
    kind: TransactionKind;
    amount: number;
    interest_part: number | null;
    principal_part: number | null;
    insurance_part: number | null;
    comment: string | null;
    source: TransactionSource;
}

function validate(raw: unknown, i: number): { row: Validated } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: `Linha ${i + 1}: formato inválido` };
    const r = raw as TransactionInput;
    const where = `Linha ${i + 1}`;
    if (r.id !== undefined && !UUID_REGEX.test(String(r.id))) return { error: `${where}: id inválido` };
    if (typeof r.occurred_on !== "string" || !ISO_DATE.test(r.occurred_on)) return { error: `${where}: data inválida (use AAAA-MM-DD)` };
    if (!TRANSACTION_KIND_VALUES.includes(r.kind)) return { error: `${where}: tipo inválido` };
    const amount = money(r.amount);
    if (amount === null || amount === "invalid") return { error: `${where}: valor deve ser um número ≥ 0` };
    const parts: Record<string, number | null> = {};
    for (const k of ["interest_part", "principal_part", "insurance_part"] as const) {
        const v = money(r[k]);
        if (v === "invalid") return { error: `${where}: ${k} deve ser um número ≥ 0` };
        parts[k] = v;
    }
    if (r.source !== undefined && !SOURCES.includes(r.source)) return { error: `${where}: origem inválida` };
    const comment = typeof r.comment === "string" && r.comment.trim() ? r.comment.trim().slice(0, 500) : null;
    return {
        row: {
            id: r.id,
            occurred_on: r.occurred_on,
            kind: r.kind,
            amount,
            interest_part: parts.interest_part,
            principal_part: parts.principal_part,
            insurance_part: parts.insurance_part,
            comment,
            source: r.source ?? "MANUAL",
        },
    };
}

export async function PUT(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;

    let body: { rows?: unknown; replace?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    const replaceAll = body.replace === true;
    if (!Array.isArray(body.rows) || (body.rows.length === 0 && !replaceAll)) {
        return NextResponse.json({ error: "rows é obrigatório" }, { status: 400 });
    }
    if (body.rows.length > MAX_ROWS) return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por envio` }, { status: 400 });

    const inputs: Validated[] = [];
    for (let i = 0; i < body.rows.length; i++) {
        const v = validate(body.rows[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        inputs.push(v.row);
    }

    try {
        if (replaceAll) {
            const { error } = await supabase.from(TABLE).delete().eq("property_id", propertyId);
            if (error) throw new Error(error.message);
        }
        const updates = replaceAll ? [] : inputs.filter(x => x.id);
        const inserts = (replaceAll ? inputs : inputs.filter(x => !x.id)).map(x => {
            const row: Record<string, unknown> = { ...x, property_id: propertyId, owner_id: profileId };
            delete row.id;
            return row;
        });
        for (const u of updates) {
            const { id, ...fields } = u;
            const { error } = await supabase.from(TABLE).update(fields).eq("id", id!).eq("property_id", propertyId);
            if (error) throw new Error(error.message);
        }
        if (inserts.length) {
            const { error } = await supabase.from(TABLE).insert(inserts);
            if (error) throw new Error(error.message);
        }
        return NextResponse.json({ rows: await loadRows(supabase, propertyId), replaced: replaceAll });
    } catch (err) {
        console.error("[Transactions PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar lançamentos" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const r = await resolve(context);
    if ("response" in r) return r.response;
    const { supabase, propertyId } = r.ctx;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("property_id", propertyId);
    if (error) {
        console.error("[Transactions DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir lançamento" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
