import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY } from "@/lib/accounting-journal";
import { loadPeriods } from "@/lib/accounting-server";
import { closeMonth, reopenFrom } from "@/lib/accounting-close-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
 * POST /api/accounting/periods  body: { month: "YYYY-MM", action: "close" | "reopen", note?, reason?, confirm? } → { periods }
 * The same rules as the Fechamento do mês page (lib/accounting-close-server.ts): a month closes
 * after it ends, in order, with its automated entries up to date and no blocking item (warnings
 * need `confirm`); reopening needs a reason and reopens the closed months after it too. Once the
 * ECD of the year is transmitted, its months are not reopened.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { month?: string; action?: string; note?: string; reason?: string; confirm?: boolean };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const month = String(body.month ?? "");
    if (!MONTH_KEY.test(month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });

    try {
        if (body.action === "close") {
            const out = await closeMonth(supabase, profileId, month, { confirmWarnings: body.confirm === true, note: body.note ?? null });
            if (!out.ok) return NextResponse.json({ error: out.error, needsConfirmation: out.needsConfirmation ?? false }, { status: 409 });
        } else if (body.action === "reopen") {
            const out = await reopenFrom(supabase, profileId, month, String(body.reason ?? ""));
            if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
        } else {
            return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
        }
        return NextResponse.json({ periods: await loadPeriods(supabase, profileId) });
    } catch (err) {
        console.error("[Accounting periods POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao alterar o período" }, { status: 500 });
    }
}
