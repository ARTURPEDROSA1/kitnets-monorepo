import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { investmentInputSchema } from "@/lib/schemas/new-investment";
import { INVESTMENT_DOCUMENTS_BUCKET, createInvestment, loadInvestmentList } from "@/lib/new-investments-server";
import { computeInvestmentMetrics, toCardSummary } from "@/lib/new-investment-metrics";
import { signStorageUrl } from "@/lib/storage";

/**
 * GET  /api/investments  → { investments, summaries }
 * POST /api/investments  → { investment, schedules, payments, documents }
 *
 * The list page draws one square card per investment; `summaries` carries exactly what a card
 * shows (paid, committed, % paid, next due, months to the keys) so the page needs no second call.
 */
export const GET = withAuth({ tag: "Investments GET" }, async ({ profileId, supabase }) => {
    const { investments, schedules, payments, documentCounts } = await loadInvestmentList(supabase, profileId);

    // The bucket is private, so the cover reaches the card as a signed URL, one per investment.
    const summaries = await Promise.all(
        investments.map(async investment => {
            const own = schedules.filter(s => s.investment_id === investment.id);
            const ownPayments = payments.filter(p => p.investment_id === investment.id);
            const metrics = computeInvestmentMetrics(investment, own, ownPayments);
            const coverUrl = investment.cover_path
                ? await signStorageUrl(supabase, INVESTMENT_DOCUMENTS_BUCKET, investment.cover_path)
                : null;
            return toCardSummary(investment.id, metrics, documentCounts.get(investment.id) ?? 0, coverUrl);
        })
    );

    return NextResponse.json({ investments, summaries });
});

export const POST = withAuth({ body: investmentInputSchema, tag: "Investments POST" }, async ({ body, profileId, supabase }) => {
    const bundle = await createInvestment(supabase, profileId, body);
    return NextResponse.json(bundle, { status: 201 });
});
