import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { monthOf, postingErrorMessage } from "@/lib/accounting-journal";
import { buildOpening, isBalanceSheet, OPENING_SOURCE_REF, validateOpening, type OpeningBalanceLine } from "@/lib/accounting-opening";
import { actorName, closedMonths, ensureChart, loadPeriods, loadSettings } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

async function loadOpening(supabase: Parameters<typeof ensureChart>[0], ownerId: string) {
    const { data, error } = await supabase.from("journal_entries")
        .select("id, entry_date, created_by, created_at, journal_lines(account_id, debit, credit)")
        .eq("owner_id", ownerId).eq("source", "OPENING").eq("source_ref", OPENING_SOURCE_REF).maybeSingle();
    if (error) throw new Error(error.message);
    return data as unknown as { id: string; entry_date: string; created_by: string | null; created_at: string; journal_lines: Array<{ account_id: string; debit: number | string; credit: number | string }> } | null;
}

/**
 * GET /api/accounting/opening → { openingDate, locked, entry, lines, accounts }
 * The opening balance (one OPENING entry on the opening date) and the balance-sheet accounts.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        const { settings } = await loadSettings(supabase, profileId);
        const [accounts, periods, entry] = await Promise.all([
            ensureChart(supabase, profileId, settings.property_measurement),
            loadPeriods(supabase, profileId),
            loadOpening(supabase, profileId),
        ]);
        const lines = (entry?.journal_lines ?? []).map(l => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
        return NextResponse.json({
            openingDate: settings.opening_date,
            locked: settings.opening_date ? closedMonths(periods).has(monthOf(settings.opening_date)) : false,
            entry: entry ? { id: entry.id, created_by: entry.created_by, created_at: entry.created_at } : null,
            lines,
            accounts: accounts.filter(isBalanceSheet),
        });
    } catch (err) {
        console.error("[Accounting opening GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o saldo de abertura" }, { status: 500 });
    }
}

/**
 * PUT /api/accounting/opening  body: { lines: [{ account_id, debit, credit }], plug?: boolean } → { id, difference, plugged }
 * Replaces the opening entry. `plug` puts a difference in lucros (or prejuízos) acumulados.
 */
export async function PUT(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { lines?: OpeningBalanceLine[]; plug?: boolean };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    if (!Array.isArray(body.lines) || body.lines.length > 500) return NextResponse.json({ error: "Envie os saldos" }, { status: 400 });

    try {
        const { settings } = await loadSettings(supabase, profileId);
        const [accounts, periods, current, actor] = await Promise.all([
            ensureChart(supabase, profileId, settings.property_measurement),
            loadPeriods(supabase, profileId),
            loadOpening(supabase, profileId),
            actorName(supabase, profileId),
        ]);
        const openingDate = settings.opening_date;
        if (!openingDate) return NextResponse.json({ error: "Defina primeiro o início da escrituração em Políticas contábeis" }, { status: 409 });
        if (closedMonths(periods).has(monthOf(openingDate))) {
            return NextResponse.json({ error: "O mês do saldo de abertura está fechado: reabra-o para alterar" }, { status: 409 });
        }
        const byKey = new Map(accounts.filter(a => a.system_key).map(a => [a.system_key!, a.id]));
        const built = buildOpening(body.lines, { plug: Boolean(body.plug), lucrosAccountId: byKey.get("LUCROS_ACUMULADOS"), prejuizosAccountId: byKey.get("PREJUIZOS_ACUMULADOS") });
        const problems = validateOpening(built.lines, new Map(accounts.map(a => [a.id, a])));
        if (problems.length) return NextResponse.json({ error: problems[0], problems, difference: built.difference }, { status: 400 });

        // Post the new entry first under a temporary reference, so a failure leaves the old one in place.
        const tempRef = `${OPENING_SOURCE_REF}-${Date.now()}`;
        const { data: newId, error } = await supabase.rpc("accounting_post_entry", {
            p_owner: profileId,
            p_entry: { entry_date: openingDate, description: "Saldo de abertura", source: "OPENING", source_ref: current ? tempRef : OPENING_SOURCE_REF, created_by: actor },
            p_lines: built.lines.map(l => ({ ...l, property_id: null, unit_id: null, memo: null })),
        });
        if (error) return NextResponse.json({ error: postingErrorMessage(error.message) }, { status: 400 });
        if (current) {
            const del = await supabase.from("journal_entries").delete().eq("id", current.id).eq("owner_id", profileId);
            if (del.error) {
                await supabase.from("journal_entries").delete().eq("id", newId).eq("owner_id", profileId);
                return NextResponse.json({ error: postingErrorMessage(del.error.message) }, { status: 400 });
            }
            const upd = await supabase.from("journal_entries").update({ source_ref: OPENING_SOURCE_REF }).eq("id", newId).eq("owner_id", profileId);
            if (upd.error) throw new Error(upd.error.message);
        }
        return NextResponse.json({ id: newId, difference: built.difference, plugged: built.plugged });
    } catch (err) {
        console.error("[Accounting opening PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao gravar o saldo de abertura" }, { status: 500 });
    }
}
