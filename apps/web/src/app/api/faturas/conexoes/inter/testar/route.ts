import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { testInterConnection } from "@/lib/billing/connections-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/faturas/conexoes/inter/testar
 * Asks the bank for a token with the stored credentials and records what it answered. A failed test is
 * an answer (status ERROR with the reason), not an error response.
 */
export const POST = withAuth(
    { limit: { scope: "inter-connection", limit: 4, windowMs: 60_000 }, tag: "Inter conexão testar" },
    async ({ profileId, supabase }) => NextResponse.json(await testInterConnection(supabase, profileId))
);
