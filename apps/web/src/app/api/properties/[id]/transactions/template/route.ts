import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { buildInvestmentTemplate } from "@/lib/investment-template";
import type { PropertyTransaction } from "@/lib/property-investment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/transactions/template            → empty .xlsx template
 * GET /api/properties/[id]/transactions/template?fill=ledger → the property's transactions, re-importable
 */
export async function GET(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id, "id, name");
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const fill = new URL(request.url).searchParams.get("fill") === "ledger";
    try {
        let rows: PropertyTransaction[] | undefined;
        if (fill) {
            const { data, error } = await supabase
                .from("property_transactions")
                .select("id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference")
                .eq("property_id", id)
                .order("occurred_on", { ascending: false });
            if (error) throw new Error(error.message);
            rows = (data ?? []) as unknown as PropertyTransaction[];
        }
        const propertyName = String(property.name ?? "Imóvel").trim() || "Imóvel";
        const buffer = await buildInvestmentTemplate({ propertyName, rows });
        const slug = propertyName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "imovel";
        const filename = fill ? `kitnets-investimento-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx` : `kitnets-investimento-${slug}-modelo.xlsx`;
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[Investment template]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gerar a planilha" }, { status: 500 });
    }
}
