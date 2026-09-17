import { NextResponse } from "next/server";
import { HttpError, notFound, readJsonBody, withAuth } from "@/lib/api-route";
import { signStorageUrl } from "@/lib/storage";
import {
    ENERGY_BILLS_BUCKET,
    buildBillUpdatePayload,
    buildHistoricalRows,
    buildMainBillPayload,
    buildPropertyAddressUpdates,
    resolvePropertyUuid,
} from "@/lib/energy-bills-server";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

const parseJsonField = (raw: FormDataEntryValue | null, label: string): unknown => {
    if (typeof raw !== "string" || !raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        throw new HttpError(400, { error: `Campo ${label} inválido (JSON esperado).` });
    }
};

/**
 * GET /api/energy-bills?propertyId=xxx
 * The property's bills, newest first. Only one PDF is kept per property
 * (current_bill.pdf); the newest bill carries its signed URL.
 */
export const GET = withAuth({ tag: "Energy Bills GET" }, async ({ req, profileId, supabase }) => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");
    if (!propertyId) {
        return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
    }

    const resolvedPropertyId = await resolvePropertyUuid(supabase, profileId, propertyId);

    const { data: bills, error } = await supabase
        .from("energy_bills")
        .select("*")
        .eq("property_id", resolvedPropertyId)
        .order("reference_month", { ascending: false });

    if (error) {
        console.error("[Energy Bills GET] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let currentPdfUrl: string | null = null;
    try {
        const { data: files } = await supabase.storage
            .from(ENERGY_BILLS_BUCKET)
            .list(resolvedPropertyId, { limit: 10, search: "current_bill" });
        if (files?.some((f) => f.name === "current_bill.pdf")) {
            currentPdfUrl = await signStorageUrl(supabase, ENERGY_BILLS_BUCKET, `${resolvedPropertyId}/current_bill.pdf`);
        }
    } catch (storageErr) {
        console.warn("[Energy Bills GET] Storage lookup warning:", storageErr);
    }

    return NextResponse.json({
        success: true,
        bills: (bills || []).map((b: Json, idx: number) => ({ ...b, pdf_url: idx === 0 && currentPdfUrl ? currentPdfUrl : null })),
        propertyId: resolvedPropertyId,
        currentPdfUrl,
    });
});

/**
 * POST /api/energy-bills
 * JSON or multipart (`propertyId`, `billData`, `historicalConsumption`, `file`).
 * Upserts the bill by (property, month), keeps the PDF only when the bill is the
 * newest one, fills the property's address from the bill when it has none, and
 * seeds baseline rows from the 13-month consumption table.
 */
export const POST = withAuth({ tag: "Energy Bills POST" }, async ({ req, profileId, supabase }) => {
    let propertyId: unknown;
    let billData: Json | null;
    let historicalConsumption: unknown;
    let uploadedFile: File | null = null;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
        const formData = await req.formData();
        propertyId = formData.get("propertyId");
        billData = parseJsonField(formData.get("billData"), "billData") as Json | null;
        historicalConsumption = parseJsonField(formData.get("historicalConsumption"), "historicalConsumption") ?? [];
        const file = formData.get("file");
        uploadedFile = file instanceof File ? file : null;
    } else {
        const body = await readJsonBody(req);
        propertyId = body.propertyId;
        billData = (body.billData as Json | null) ?? null;
        historicalConsumption = body.historicalConsumption;
    }

    if (typeof propertyId !== "string" || !propertyId) {
        return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
    }
    if (!billData || !billData.referenceMonth) {
        return NextResponse.json({ error: "Dados da fatura incompletos (mês de referência ausente)" }, { status: 400 });
    }

    const resolvedPropertyId = await resolvePropertyUuid(supabase, profileId, propertyId);

    // The PDF is kept only for the newest bill; older ones contribute data only.
    if (uploadedFile && uploadedFile.size > 0) {
        try {
            const { data: latest } = await supabase
                .from("energy_bills")
                .select("reference_month")
                .eq("property_id", resolvedPropertyId)
                .order("reference_month", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!latest || String(billData.referenceMonth) >= String(latest.reference_month)) {
                const { error: uploadError } = await supabase.storage
                    .from(ENERGY_BILLS_BUCKET)
                    .upload(`${resolvedPropertyId}/current_bill.pdf`, Buffer.from(await uploadedFile.arrayBuffer()), {
                        contentType: uploadedFile.type || "application/pdf",
                        upsert: true,
                    });
                if (uploadError) console.error("[Energy Bills Storage] Upload error:", uploadError);
            }
        } catch (storageErr) {
            console.error("[Energy Bills Storage] Exception during file upload:", storageErr);
        }
    }

    const { data: savedBill, error: mainError } = await supabase
        .from("energy_bills")
        .upsert(buildMainBillPayload(resolvedPropertyId, billData, historicalConsumption), { onConflict: "property_id,reference_month" })
        .select()
        .single();

    if (mainError) {
        console.error("[Energy Bills POST] Error saving main bill:", mainError);
        return NextResponse.json({ error: mainError.message }, { status: 500 });
    }

    // Fill the property's address from the bill when it has none (or is a standalone UC).
    const addressUpdates = buildPropertyAddressUpdates({
        installationAddress: billData.installationAddress,
        installationCity: billData.installationCity,
        installationState: billData.installationState,
        installationZip: billData.installationZip,
    });
    if (addressUpdates.address || addressUpdates.city) {
        try {
            const { data: propRow } = await supabase
                .from("properties")
                .select("id, address, electronic_id")
                .eq("id", resolvedPropertyId)
                .maybeSingle();

            let standalone = false;
            try {
                standalone = !!propRow?.electronic_id && !!JSON.parse(propRow.electronic_id as string).isStandaloneUc;
            } catch {
                standalone = false;
            }

            if (!propRow?.address || standalone) {
                await supabase.from("properties").update(addressUpdates).eq("id", resolvedPropertyId);
            }
        } catch (addrErr) {
            console.warn("[Energy Bills POST] Warning updating property address:", addrErr);
        }
    }

    // Baseline rows from the 13-month table; never downgrade a month that already has a full bill.
    const historicalRows = buildHistoricalRows(resolvedPropertyId, billData, historicalConsumption);
    if (historicalRows.length > 0) {
        const { data: existing } = await supabase
            .from("energy_bills")
            .select("reference_month, is_historical_only")
            .eq("property_id", resolvedPropertyId)
            .in("reference_month", historicalRows.map((r) => r.reference_month as string));

        const fullBillMonths = new Set((existing || []).filter((e) => e.is_historical_only === false).map((e) => e.reference_month));
        const rowsToInsert = historicalRows.filter((r) => !fullBillMonths.has(r.reference_month));
        if (rowsToInsert.length > 0) {
            await supabase.from("energy_bills").upsert(rowsToInsert, { onConflict: "property_id,reference_month" });
        }
    }

    return NextResponse.json({ success: true, bill: savedBill, propertyId: resolvedPropertyId });
});

/**
 * PUT /api/energy-bills  { id, billData }
 * Partial update of a bill whose property belongs to the caller. Orphaned
 * bills (no property) are not editable here.
 */
export const PUT = withAuth({ tag: "Energy Bills PUT" }, async ({ req, profileId, supabase }) => {
    const body = await readJsonBody(req);
    const id = body.id;
    const billData = body.billData as Json | null | undefined;

    if (typeof id !== "string" || !id) {
        return NextResponse.json({ error: "ID da fatura é obrigatório" }, { status: 400 });
    }
    if (!billData) {
        return NextResponse.json({ error: "Dados da fatura são obrigatórios" }, { status: 400 });
    }

    const { data: existingBill, error: fetchErr } = await supabase
        .from("energy_bills")
        .select("id, property_id, properties(owner_id)")
        .eq("id", id)
        .maybeSingle();
    if (fetchErr || !existingBill) throw notFound("Fatura não encontrada");

    const rel = existingBill.properties as unknown;
    const prop = (Array.isArray(rel) ? rel[0] : rel) as { owner_id: string | null } | null | undefined;
    if (!prop?.owner_id || prop.owner_id !== profileId) throw notFound("Fatura não encontrada");

    const { data: updated, error: updateErr } = await supabase
        .from("energy_bills")
        .update(buildBillUpdatePayload(billData))
        .eq("id", id)
        .select()
        .single();

    if (updateErr) {
        console.error("[Energy Bills PUT] Error updating bill:", updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const addressUpdates = buildPropertyAddressUpdates(billData);
    if (addressUpdates.address || addressUpdates.city) {
        try {
            await supabase.from("properties").update(addressUpdates).eq("id", existingBill.property_id as string);
        } catch (propErr) {
            console.warn("[Energy Bills PUT] Warning updating property address:", propErr);
        }
    }

    return NextResponse.json({ success: true, bill: updated });
});

/**
 * DELETE /api/energy-bills?id=xxx
 */
export const DELETE = withAuth({ tag: "Energy Bills DELETE" }, async ({ req, profileId, supabase }) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    // Ownership: bill → property → owner (the inner join excludes orphaned bills)
    const { data: bill } = await supabase
        .from("energy_bills")
        .select("id, property_id, properties!inner(owner_id)")
        .eq("id", id)
        .eq("properties.owner_id", profileId)
        .maybeSingle();
    if (!bill) throw notFound("Fatura não encontrada");

    const { error } = await supabase.from("energy_bills").delete().eq("id", id).eq("property_id", bill.property_id as string);
    if (error) {
        console.error("[Energy Bills DELETE] Error:", error);
        return NextResponse.json({ error: "Erro ao excluir fatura" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
});
