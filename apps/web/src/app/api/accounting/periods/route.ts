import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY, monthStart } from "@/lib/accounting-journal";
import { loadPeriods } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

/** GET /api/accounting/periods → { periods } */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        return NextResponse.json({ periods: await loadPeriods(supabase, profileId) });
    } catch (err) {
        console.error("[Accounting periods GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar os períodos" }, { status: 500 });
    }
}

/**
 * POST /api/accounting/periods  body: { month: "YYYY-MM", action: "close" | "reopen", note?, reason? } → { periods }
 * Closing locks the month (no posting, editing or deleting); reopening needs a reason and
 * is recorded. Once the ECD of the year is transmitted, its months are not reopened.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { month?: string; action?: string; note?: string; reason?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const month = String(body.month ?? "");
    if (!MONTH_KEY.test(month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
    const now = new Date().toISOString();

    let error;
    if (body.action === "close") {
        if (month >= now.slice(0, 7)) return NextResponse.json({ error: "Só meses encerrados podem ser fechados" }, { status: 400 });
        ({ error } = await supabase.from("accounting_periods").upsert({
            owner_id: profileId, month: monthStart(month), status: "CLOSED", closed_at: now,
            closed_note: body.note ? String(body.note).trim().slice(0, 300) || null : null,
        }, { onConflict: "owner_id,month" }));
    } else if (body.action === "reopen") {
        const reason = String(body.reason ?? "").trim();
        if (!reason) return NextResponse.json({ error: "Informe o motivo da reabertura" }, { status: 400 });
        ({ error } = await supabase.from("accounting_periods").update({ status: "OPEN", reopened_at: now, reopen_reason: reason.slice(0, 300) })
            .eq("owner_id", profileId).eq("month", monthStart(month)).eq("status", "CLOSED"));
    } else {
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
    if (error) {
        console.error("[Accounting periods POST]", error.message);
        return NextResponse.json({ error: "Erro ao alterar o período" }, { status: 500 });
    }
    return NextResponse.json({ periods: await loadPeriods(supabase, profileId) });
}
