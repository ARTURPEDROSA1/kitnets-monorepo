import { NextResponse } from "next/server";
import { getOwnedProperty } from "@/lib/api-auth";
import { withAuth } from "@/lib/api-route";
import { listWaterFiles, logoFromBillPdf, removeCurrentBillPdf, saveCurrentBillPdf, saveUtilityLogo, signWaterFiles } from "@/lib/water-bills-server";

export const runtime = "nodejs";

type Params = { propertyId: string };

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * POST /api/water-bills/document/[propertyId]
 * multipart/form-data: `file` (the bill: PDF, or a photo), optional `referenceMonth` (AAAA-MM).
 * Keeps the file as the property's current bill (`current_bill.pdf`, one per property, like the
 * energy bills) — unless a newer bill is already registered — and, when the property has no logo
 * yet and the file is a digital PDF, pulls the water utility's logo out of its header to be the
 * cover of the property's card. → { success, pdfStored, logoExtracted, currentPdfUrl, logoUrl }
 */
export const POST = withAuth<undefined, Params>({ tag: "Water Bill Document POST" }, async ({ req, params, profileId, supabase }) => {
    const property = await getOwnedProperty(supabase, profileId, params.propertyId);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    const referenceMonth = formData.get("referenceMonth");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Formato não suportado. Use PDF, JPG, PNG ou WebP." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Arquivo muito grande. Máximo 15 MB." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // The PDF is kept only for the newest bill; an older bill's file contributes the logo at most.
    let pdfStored = false;
    let newerExists = false;
    if (typeof referenceMonth === "string" && MONTH_REGEX.test(referenceMonth)) {
        const { data: newest } = await supabase
            .from("water_bills")
            .select("reference_month")
            .eq("property_id", params.propertyId)
            .order("reference_month", { ascending: false })
            .limit(1)
            .maybeSingle();
        newerExists = Boolean(newest && String(newest.reference_month) > referenceMonth);
    }
    if (!newerExists) {
        pdfStored = Boolean(await saveCurrentBillPdf(supabase, params.propertyId, buffer, file.type || "application/pdf"));
    }

    // The utility's logo becomes the card's cover the first time a digital PDF comes in.
    let logoExtracted = false;
    const before = await listWaterFiles(supabase, params.propertyId);
    if (!before.logoPath && file.type === "application/pdf") {
        const logo = await logoFromBillPdf(buffer);
        if (logo) logoExtracted = Boolean(await saveUtilityLogo(supabase, params.propertyId, logo, "image/png", "png"));
    }

    const urls = await signWaterFiles(supabase, params.propertyId);
    return NextResponse.json({ success: true, pdfStored, newerExists, logoExtracted, ...urls });
});

/**
 * DELETE /api/water-bills/document/[propertyId]
 * Removes the property's current bill PDF (the logo stays).
 */
export const DELETE = withAuth<undefined, Params>({ tag: "Water Bill Document DELETE" }, async ({ params, profileId, supabase }) => {
    const property = await getOwnedProperty(supabase, profileId, params.propertyId);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    await removeCurrentBillPdf(supabase, params.propertyId);
    return NextResponse.json({ success: true });
});
