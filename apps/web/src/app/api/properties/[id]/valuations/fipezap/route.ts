import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { fipezapEstimate, purchaseAppraisal } from "@/lib/property-valuations";
import { fipezapBucket, loadFipezapSaleSeries } from "@/lib/property-valuations-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/properties/[id]/valuations/fipezap  body: { bedrooms?: string | number }
 * → { estimate: { amount, factor, from, to, months }, bucket, purchasePrice, acquiredOn }
 *
 * Carries the purchase price by the FipeZap sale index (national, by bedroom
 * bucket) from the acquisition month to the latest published month. The
 * caller decides whether to save it as a FIPEZAP valuation.
 */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    let body: { bedrooms?: string | number } = {};
    try { body = await request.json(); } catch { /* optional body */ }

    const { data: inv } = await supabase.from("property_investments").select("purchase_price, acquired_on").eq("property_id", id).maybeSingle();
    const purchasePrice = Number(inv?.purchase_price) || 0;
    if (!inv || purchasePrice <= 0 || !inv.acquired_on) {
        return NextResponse.json({ error: "Informe o valor e a data de compra em Aquisição & financiamento antes de estimar pelo FipeZap" }, { status: 400 });
    }
    const bucket = fipezapBucket(body.bedrooms);
    try {
        let series = await loadFipezapSaleSeries(supabase, bucket);
        let usedBucket = bucket;
        if (series.length === 0 && bucket !== "total") { series = await loadFipezapSaleSeries(supabase, "total"); usedBucket = "total"; }
        if (series.length === 0) return NextResponse.json({ error: "Série FipeZap indisponível" }, { status: 503 });
        // Bought below/above market: the index starts from the purchase appraisal (laudo), not from the price paid.
        const { data: appraisals } = await supabase.from("property_valuations").select("valued_on, amount, source").eq("property_id", id).eq("source", "APPRAISAL");
        const appraisal = purchaseAppraisal((appraisals ?? []) as Array<{ valued_on: string; amount: number; source: "APPRAISAL" }>, inv.acquired_on);
        const base = appraisal ? appraisal.amount : purchasePrice;
        const estimate = fipezapEstimate(base, inv.acquired_on, series);
        if (estimate.months === 0) return NextResponse.json({ error: "A série FipeZap não cobre o período desde a compra" }, { status: 422 });
        return NextResponse.json({ estimate, bucket: usedBucket, purchasePrice: base, basis: appraisal ? "APPRAISAL" : "PURCHASE", acquiredOn: inv.acquired_on });
    } catch (err) {
        console.error("[Valuations FipeZap]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao consultar o FipeZap" }, { status: 500 });
    }
}
