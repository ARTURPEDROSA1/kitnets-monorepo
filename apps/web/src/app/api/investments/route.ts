import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { investmentInputSchema } from "@/lib/schemas/new-investment";
import { createInvestment } from "@/lib/new-investments-server";
import { loadProjectList } from "@/lib/new-investment-views-server";

/**
 * GET  /api/investments  → { investments, summaries }
 * POST /api/investments  → { investment, schedules, payments, documents }
 *
 * The list page draws one square card per investment; `summaries` carries exactly what a card
 * shows (paid, committed, % paid, next due, months to the keys, the pictures it slides through)
 * so the page needs no second call. The page preloads the same view on the server; this route
 * serves the refreshes after a change.
 */
export const GET = withAuth({ tag: "Investments GET" }, async ({ profileId, supabase }) => {
    return NextResponse.json(await loadProjectList(supabase, profileId));
});

export const POST = withAuth({ body: investmentInputSchema, tag: "Investments POST" }, async ({ body, profileId, supabase }) => {
    const bundle = await createInvestment(supabase, profileId, body);
    return NextResponse.json(bundle, { status: 201 });
});
