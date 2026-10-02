import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadConnections } from "@/lib/billing/connections-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/faturas/conexoes
 * The account's connections to the payment providers, as the screens show them: status, account,
 * certificate, scopes. Never a secret.
 */
export const GET = withAuth({ tag: "Faturas conexões GET" }, async ({ profileId, supabase }) => {
    return NextResponse.json(await loadConnections(supabase, profileId));
});
