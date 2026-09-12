import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { buildIncomeTemplate } from "@/lib/income-template";
import type { PropertyIncomeRow } from "@/lib/property-income";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/income/template?fee=10&months=12
 * → formatted, empty .xlsx template for the income ledger of a property the user owns.
 * GET /api/properties/[id]/income/template?fill=ledger
 * → the same layout filled with the property's ledger (export / backup; re-importable).
 */
export async function GET(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id, "id, name");
    if (!property) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fee = Number(searchParams.get("fee"));
    const months = Number(searchParams.get("months"));
    const fillLedger = searchParams.get("fill") === "ledger";

    try {
        let rows: PropertyIncomeRow[] | undefined;
        if (fillLedger) {
            const { data, error } = await supabase
                .from("property_income_months")
                .select("id, property_id, month, received_on, received_amount, energy_portion, other_income, agency_fee_pct, status, source, bank_reference, notes")
                .eq("property_id", id)
                .order("month", { ascending: false });
            if (error) throw new Error(error.message);
            rows = (data ?? []) as unknown as PropertyIncomeRow[];
        }

        const propertyName = String(property.name ?? "Imóvel").trim() || "Imóvel";
        const buffer = await buildIncomeTemplate({
            propertyName,
            feePct: Number.isFinite(fee) ? fee : 10,
            months: Number.isFinite(months) && months > 0 ? months : 12,
            rows,
        });
        const slug = propertyName
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            .slice(0, 40) || "imovel";
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = fillLedger ? `kitnets-receitas-${slug}-${stamp}.xlsx` : `kitnets-receitas-${slug}-modelo.xlsx`;

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[Income template]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gerar o modelo" }, { status: 500 });
    }
}
