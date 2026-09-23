import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { investmentInputSchema } from "@/lib/schemas/new-investment";
import { INVESTMENT_DOCUMENTS_BUCKET, createInvestment, loadInvestmentList } from "@/lib/new-investments-server";
import { cardPhotoPaths, computeInvestmentMetrics, toCardSummary } from "@/lib/new-investment-metrics";
import { signStorageUrls } from "@/lib/storage";

/**
 * GET  /api/investments  → { investments, summaries }
 * POST /api/investments  → { investment, schedules, payments, documents }
 *
 * The list page draws one square card per investment; `summaries` carries exactly what a card
 * shows (paid, committed, % paid, next due, months to the keys, the pictures it slides through)
 * so the page needs no second call.
 */
export const GET = withAuth({ tag: "Investments GET" }, async ({ profileId, supabase }) => {
    const { investments, schedules, payments, documentCounts, photoPaths } = await loadInvestmentList(supabase, profileId);

    // The bucket is private, so every picture reaches the card as a signed URL — the cover
    // first, then the other photos — all signed in one storage call for the whole list.
    const pathsByInvestment = new Map(
        investments.map(investment => [investment.id, cardPhotoPaths(investment.cover_path, photoPaths.get(investment.id) ?? [])])
    );
    const signed = await signStorageUrls(supabase, INVESTMENT_DOCUMENTS_BUCKET, Array.from(pathsByInvestment.values()).flat());

    const summaries = investments.map(investment => {
        const own = schedules.filter(s => s.investment_id === investment.id);
        const ownPayments = payments.filter(p => p.investment_id === investment.id);
        const metrics = computeInvestmentMetrics(investment, own, ownPayments);
        const photoUrls = (pathsByInvestment.get(investment.id) ?? []).map(path => signed.get(path)).filter((url): url is string => Boolean(url));
        return toCardSummary(investment.id, metrics, documentCounts.get(investment.id) ?? 0, photoUrls);
    });

    return NextResponse.json({ investments, summaries });
});

export const POST = withAuth({ body: investmentInputSchema, tag: "Investments POST" }, async ({ body, profileId, supabase }) => {
    const bundle = await createInvestment(supabase, profileId, body);
    return NextResponse.json(bundle, { status: 201 });
});
