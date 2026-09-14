import { NextResponse } from "next/server";
import { loadTaxRows, resolveTaxesContext, TAXES_BUCKET, TAXES_TABLE, validateTaxInput } from "@/lib/property-taxes-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_PDF = 12 * 1024 * 1024;

/**
 * POST /api/properties/[id]/taxes/import   (multipart)
 *   data: JSON PropertyTaxInput (reviewed extraction; kind IPTU)
 *   file: optional PDF/image of the document
 * → { rows, taxId }
 *
 * Upserts the IPTU row for that year (updates the existing IPTU row of the
 * same year, else inserts), stores the file as {propertyId}/current_iptu.pdf
 * in the private `property-taxes` bucket, and marks this row as the one that
 * owns the current PDF (clearing the mark on any other row). One PDF per
 * property is kept — the latest imported — like energy bills.
 */
export async function POST(request: Request, context: RouteContext) {
    const r = await resolveTaxesContext(context);
    if ("response" in r) return r.response;
    const { profileId, supabase, propertyId } = r.ctx;

    let dataJson: unknown;
    let file: File | null = null;
    try {
        const form = await request.formData();
        const raw = form.get("data");
        dataJson = typeof raw === "string" ? JSON.parse(raw) : null;
        const entry = form.get("file");
        file = entry instanceof File && entry.size > 0 ? entry : null;
    } catch {
        return NextResponse.json({ error: "Envie 'data' (JSON) e opcionalmente 'file'" }, { status: 400 });
    }
    const v = validateTaxInput(dataJson, 0);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const row = v.row;
    if (file && file.size > MAX_PDF) return NextResponse.json({ error: "Arquivo maior que 12 MB" }, { status: 413 });
    if (file && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        return NextResponse.json({ error: "Envie um PDF ou imagem" }, { status: 415 });
    }

    try {
        // 1. Upsert the row for that year/kind
        let taxId = row.id ?? null;
        if (!taxId) {
            const { data: existing } = await supabase
                .from(TAXES_TABLE).select("id").eq("property_id", propertyId).eq("kind", row.kind).eq("year", row.year)
                .order("updated_at", { ascending: false }).limit(1).maybeSingle();
            taxId = (existing?.id as string | undefined) ?? null;
        }
        const fields: Record<string, unknown> = { ...row, extracted_at: new Date().toISOString() };
        delete fields.id;
        if (taxId) {
            const { error } = await supabase.from(TAXES_TABLE).update(fields).eq("id", taxId).eq("property_id", propertyId);
            if (error) throw new Error(error.message);
        } else {
            const { data, error } = await supabase
                .from(TAXES_TABLE).insert({ ...fields, property_id: propertyId, owner_id: profileId }).select("id").single();
            if (error) throw new Error(error.message);
            taxId = data.id as string;
        }

        // 2. Store the document as the property's current IPTU PDF
        if (file) {
            const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
            const path = `${propertyId}/current_iptu.${ext}`;
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.some(b => b.name === TAXES_BUCKET)) await supabase.storage.createBucket(TAXES_BUCKET, { public: false });
            // Remove any previous current file with another extension
            const { data: files } = await supabase.storage.from(TAXES_BUCKET).list(propertyId);
            const stale = (files ?? []).map(f => `${propertyId}/${f.name}`).filter(p => p !== path && /current_iptu\./.test(p));
            if (stale.length) await supabase.storage.from(TAXES_BUCKET).remove(stale);
            const { error: upErr } = await supabase.storage.from(TAXES_BUCKET)
                .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
            if (upErr) throw new Error(upErr.message);
            await supabase.from(TAXES_TABLE).update({ document_path: null }).eq("property_id", propertyId).neq("id", taxId);
            const { error: markErr } = await supabase.from(TAXES_TABLE).update({ document_path: path }).eq("id", taxId);
            if (markErr) throw new Error(markErr.message);
        }

        return NextResponse.json({ rows: await loadTaxRows(supabase, propertyId), taxId });
    } catch (err) {
        console.error("[Taxes import]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao importar o IPTU" }, { status: 500 });
    }
}
