import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { isAutoSource, isValidIsoDate, monthOf, postingErrorMessage } from "@/lib/accounting-journal";
import { actorName, closedMonths, loadPeriods } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/accounting/entries/<id>/reverse  body: { date?: "YYYY-MM-DD", description? } → { id }
 * The correction for an entry in a closed month: a mirrored entry dated in an open month.
 * Automated entries of the monthly close (competência, depreciação, valor justo) are not
 * reversed: they follow their records, so the month is reopened and updated instead.
 */
export async function POST(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    let body: { date?: string; description?: string } = {};
    try { body = await request.json(); } catch { /* empty body: today, default description */ }
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    if (!isValidIsoDate(date)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

    const [periods, actor, original] = await Promise.all([
        loadPeriods(supabase, profileId),
        actorName(supabase, profileId),
        supabase.from("journal_entries").select("source").eq("id", id).eq("owner_id", profileId).maybeSingle(),
    ]);
    if (!original.data) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    if (isAutoSource((original.data as { source: string }).source)) {
        return NextResponse.json({ error: "Lançamentos automáticos do fechamento seguem os registros de origem: corrija o registro (Receitas, financiamento, políticas), reabra o mês e atualize" }, { status: 409 });
    }
    if (closedMonths(periods).has(monthOf(date))) return NextResponse.json({ error: "Escolha uma data em um mês aberto para o estorno" }, { status: 400 });

    const { data, error } = await supabase.rpc("accounting_reverse_entry", {
        p_owner: profileId,
        p_entry: id,
        p_date: date,
        p_description: body.description ? String(body.description).slice(0, 300) : null,
        p_created_by: actor,
    });
    if (error) return NextResponse.json({ error: postingErrorMessage(error.message) }, { status: 400 });
    return NextResponse.json({ id: data });
}
