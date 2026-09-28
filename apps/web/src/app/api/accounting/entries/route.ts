import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY, postingErrorMessage, toPostPayload, validateEntryDraft, type EntryDraft } from "@/lib/accounting-journal";
import { actorName, closedMonths, ensureChart, loadEntries, loadPeriods, loadSettings } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

function lastDay(monthKey: string): string {
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * GET /api/accounting/entries?month=YYYY-MM
 * → { month, entries, accounts, periods, properties, openingDate }
 * The month's journal (newest first) with what the entry form needs.
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const param = new URL(request.url).searchParams.get("month");
    const month = param && MONTH_KEY.test(param) ? param : new Date().toISOString().slice(0, 7);
    try {
        const { settings } = await loadSettings(supabase, profileId);
        const [accounts, periods, entries, props] = await Promise.all([
            ensureChart(supabase, profileId, settings.property_measurement),
            loadPeriods(supabase, profileId),
            loadEntries(supabase, profileId, `${month}-01`, lastDay(month)),
            supabase.from("properties").select("id, name").eq("owner_id", profileId).order("name"),
        ]);
        return NextResponse.json({ month, entries, accounts, periods, properties: props.data ?? [], openingDate: settings.opening_date });
    } catch (err) {
        console.error("[Accounting entries GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar os lançamentos" }, { status: 500 });
    }
}

/** POST /api/accounting/entries  body: EntryDraft → { id } — a manual entry (or the opening balance). */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let draft: EntryDraft;
    try { draft = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    if (!draft || typeof draft !== "object" || !Array.isArray(draft.lines)) return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });

    try {
        const { settings } = await loadSettings(supabase, profileId);
        const [accounts, periods, actor] = await Promise.all([
            ensureChart(supabase, profileId, settings.property_measurement),
            loadPeriods(supabase, profileId),
            actorName(supabase, profileId),
        ]);
        const problems = validateEntryDraft(draft, {
            accounts: new Map(accounts.map(a => [a.id, a])),
            closedMonths: closedMonths(periods),
            openingDate: settings.opening_date,
        });
        if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

        const payload = toPostPayload(draft, actor);
        const { data, error } = await supabase.rpc("accounting_post_entry", { p_owner: profileId, p_entry: payload.entry, p_lines: payload.lines });
        if (error) return NextResponse.json({ error: postingErrorMessage(error.message) }, { status: 400 });
        return NextResponse.json({ id: data });
    } catch (err) {
        console.error("[Accounting entries POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gravar o lançamento" }, { status: 500 });
    }
}
