import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY } from "@/lib/accounting-journal";
import { buildContadorPackage } from "@/lib/accounting-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/accounting/package?month=YYYY-MM → .xlsx
 * Pacote do contador: Resumo with the closing checklist, Balancete, Diário, Razão and
 * Aluguéis a receber of the month.
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!MONTH_KEY.test(month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
    try {
        const { buffer, filename } = await buildContadorPackage(supabase, profileId, month);
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[Accounting package]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gerar o pacote do contador" }, { status: 500 });
    }
}
