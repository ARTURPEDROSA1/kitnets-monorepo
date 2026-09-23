import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { investmentInputSchema } from "@/lib/schemas/new-investment";
import { createInvestment, loadInvestmentList } from "@/lib/new-investments-server";
import { computeInvestmentMetrics, toCardSummary } from "@/lib/new-investment-metrics";

/**
 * GET  /api/investments  → { investments, summaries }
 * POST /api/investments  → { investment, schedules, payments, documents }
 *
 * The list page draws one square card per investment; `summaries` carries exactly what a card
 * shows (paid, committed, % paid, next due, months to the keys) so the page needs no second call.
 */
export const GET = withAuth({ tag: "Investments GET" }, async ({ profileId, supabase }) => {
    const { investments, schedules, payments, documentCounts } = await loadInvestmentList(supabase, profileId);

    const summaries = investments.map(investment => {
        const own = schedules.filter(s => s.investment_id === investment.id);
        const ownPayments = payments.filter(p => p.investment_id === investment.id);
        const metrics = computeInvestmentMetrics(investment, own, ownPayments);
        return toCardSummary(investment.id, metrics, documentCounts.get(investment.id) ?? 0);
    });

    return NextResponse.json({ investments, summaries });
});

export const POST = withAuth({ body: investmentInputSchema, tag: "Investments POST" }, async ({ body, profileId, supabase }) => {
    const bundle = await createInvestment(supabase, profileId, body);
    return NextResponse.json(bundle, { status: 201 });
});
