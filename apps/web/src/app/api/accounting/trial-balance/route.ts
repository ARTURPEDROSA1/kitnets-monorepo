import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { MONTH_KEY, monthStart } from "@/lib/accounting-journal";
import { monthEnd, monthRange } from "@/lib/accounting-accruals";
import { trialBalanceTotals } from "@/lib/accounting-reports";
import { closedMonths, ensureChart, loadPeriods, loadSettings } from "@/lib/accounting-server";
import { trialBalance } from "@/lib/accounting-close-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounting/trial-balance?from=YYYY-MM&to=YYYY-MM
 * → { from, to, rows, totals, openingDate, allClosed }
 * Balancete: per account (groups summed), the balance before the period, debits, credits and
 * the balance at the end. Signed debit − credit. `to` defaults to `from`.
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? from;
    if (!MONTH_KEY.test(from) || !MONTH_KEY.test(to) || to < from) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
    try {
        const { settings } = await loadSettings(supabase, profileId);
        const [accounts, periods] = await Promise.all([ensureChart(supabase, profileId, settings.property_measurement), loadPeriods(supabase, profileId)]);
        const rows = await trialBalance(supabase, profileId, accounts, monthStart(from), monthEnd(to));
        const closed = closedMonths(periods);
        return NextResponse.json({ from, to, rows, totals: trialBalanceTotals(rows), openingDate: settings.opening_date, allClosed: monthRange(from, to).every(m => closed.has(m)) });
    } catch (err) {
        console.error("[Accounting trial balance GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao montar o balancete" }, { status: 500 });
    }
}
