import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { loadTaxRows, resolveTaxesContext, TAXES_BUCKET, TAXES_TABLE, validateTaxInput, type ValidatedTax } from "@/lib/property-taxes-server";

export const dynamic = "force-dynamic";

/**
 *   GET    /api/properties/[id]/taxes            → { rows }  (year desc; rows with a PDF carry document_url)
 *   PUT    /api/properties/[id]/taxes { rows }   → { rows }  rows with id are updated, without id inserted
 *   DELETE /api/properties/[id]/taxes?id=<uuid>  → { ok }
 *
 * A row may carry `installments` (≤ 6 parcelas). When present, the stored
 * `amount` is their sum and `paid_by` the majority payer, so older readers
 * see consistent totals. The IPTU PDF is handled by ./import (never by PUT).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
    const r = await resolveTaxesContext(context);
    if ("response" in r) return r.response;
    try {
        return NextResponse.json({ rows: await loadTaxRows(r.ctx.supabase, r.ctx.propertyId) });
    } catch (err) {
        console.error("[Taxes GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar tributos" }, { status: 500 });
    }
}

export async function PUT(request: Request, context: RouteContext) {
    const r = await resolveTaxesContext(context);
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

    const rows: ValidatedTax[] = [];
    for (let i = 0; i < body.rows.length; i++) {
        const v = validateTaxInput(body.rows[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        rows.push(v.row);
    }

    try {
        for (const row of rows.filter(x => x.id)) {
            const { id, ...fields } = row;
            const { error } = await supabase.from(TAXES_TABLE).update(fields).eq("id", id!).eq("property_id", propertyId);
            if (error) throw new Error(error.message);
        }
        const inserts = rows.filter(x => !x.id).map(x => {
            const rec: Record<string, unknown> = { ...x, property_id: propertyId, owner_id: profileId };
            delete rec.id;
            return rec;
        });
        if (inserts.length) {
            const { error } = await supabase.from(TAXES_TABLE).insert(inserts);
            if (error) throw new Error(error.message);
        }
        return NextResponse.json({ rows: await loadTaxRows(supabase, propertyId) });
    } catch (err) {
        console.error("[Taxes PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar tributos" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const r = await resolveTaxesContext(context);
    if ("response" in r) return r.response;
    const { supabase, propertyId } = r.ctx;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    // If this row owns the current PDF, remove the file too.
    const { data: row } = await supabase.from(TAXES_TABLE).select("document_path").eq("id", id).eq("property_id", propertyId).maybeSingle();
    const { error } = await supabase.from(TAXES_TABLE).delete().eq("id", id).eq("property_id", propertyId);
    if (error) {
        console.error("[Taxes DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
    }
    if (row?.document_path) {
        try {
            await supabase.storage.from(TAXES_BUCKET).remove([row.document_path as string]);
        } catch {
            /* file cleanup is best-effort */
        }
    }
    return NextResponse.json({ ok: true });
}
