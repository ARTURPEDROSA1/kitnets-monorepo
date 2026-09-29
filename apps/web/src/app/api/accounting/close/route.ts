import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY } from "@/lib/accounting-journal";
import { closeContext, closeMonth, monthStatus, monthsOverview, reopenFrom, suggestedMonth, syncMonth, syncOpenMonths } from "@/lib/accounting-close-server";

export const dynamic = "force-dynamic";
// updating every open month of a year and a half is hundreds of postings
export const maxDuration = 300;

/**
 * GET /api/accounting/close?month=YYYY-MM
 * → { month, months, openingDate, status: MonthStatus }
 * The closing checklist of the month (default: the first open month that has ended), the
 * automated entries it would generate or update, and the months of the books with their status.
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const param = new URL(request.url).searchParams.get("month");
    if (param && !MONTH_KEY.test(param)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
    try {
        const ctx = await closeContext(supabase, profileId);
        const month = param ?? suggestedMonth(ctx);
        return NextResponse.json({
            month,
            months: monthsOverview(ctx),
            openingDate: ctx.settings.opening_date,
            status: await monthStatus(supabase, ctx, month),
        });
    } catch (err) {
        console.error("[Accounting close GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o fechamento" }, { status: 500 });
    }
}

/**
 * POST /api/accounting/close
 *   { action: "sync", month }                         bring the month's automated entries up to date
 *   { action: "sync-all" }                            the same for every open month, in order
 *   { action: "close", month, confirm?, note? }       update, check and lock the month
 *   { action: "reopen", month, reason }               reopen the month and the closed months after it
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { action?: string; month?: string; confirm?: boolean; note?: string; reason?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const month = String(body.month ?? "");
    if (body.action !== "sync-all" && !MONTH_KEY.test(month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });

    try {
        if (body.action === "sync") {
            const ctx = await closeContext(supabase, profileId);
            const result = await syncMonth(supabase, ctx, month);
            if (result.skipped === "CLOSED") return NextResponse.json({ error: "O mês está fechado: reabra-o para atualizar" }, { status: 409 });
            if (result.skipped === "NO_START") return NextResponse.json({ error: "Defina primeiro o início da escrituração em Políticas contábeis" }, { status: 409 });
            if (result.skipped === "BEFORE_OPENING") return NextResponse.json({ error: "O mês é anterior ao início da escrituração" }, { status: 409 });
            if (result.skipped === "FUTURE") return NextResponse.json({ error: "O mês ainda não começou" }, { status: 409 });
            return NextResponse.json({ result });
        }
        if (body.action === "sync-all") {
            const ctx = await closeContext(supabase, profileId);
            if (!ctx.settings.opening_date) return NextResponse.json({ error: "Defina primeiro o início da escrituração em Políticas contábeis" }, { status: 409 });
            return NextResponse.json({ results: await syncOpenMonths(supabase, ctx) });
        }
        if (body.action === "close") {
            const out = await closeMonth(supabase, profileId, month, { confirmWarnings: body.confirm === true, note: body.note ?? null });
            if (!out.ok) return NextResponse.json({ error: out.error, needsConfirmation: out.needsConfirmation ?? false, status: out.status }, { status: 409 });
            return NextResponse.json({ ok: true, sync: out.sync });
        }
        if (body.action === "reopen") {
            const out = await reopenFrom(supabase, profileId, month, String(body.reason ?? ""));
            if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
            return NextResponse.json(out);
        }
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    } catch (err) {
        console.error("[Accounting close POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro no fechamento do mês" }, { status: 500 });
    }
}
