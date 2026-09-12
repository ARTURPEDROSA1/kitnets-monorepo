import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import { buildIncomeTemplate } from "@/lib/income-template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id]/income/template?fee=10&months=12
 * → formatted .xlsx template for the income ledger of a property the user owns.
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

    try {
        const propertyName = String(property.name ?? "Imóvel").trim() || "Imóvel";
        const buffer = await buildIncomeTemplate({
            propertyName,
            feePct: Number.isFinite(fee) ? fee : 10,
            months: Number.isFinite(months) && months > 0 ? months : 12,
        });
        const slug = propertyName
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
            .slice(0, 40) || "imovel";

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="kitnets-receitas-${slug}.xlsx"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[Income template]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gerar o modelo" }, { status: 500 });
    }
}
