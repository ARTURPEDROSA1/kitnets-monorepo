import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { loadConnections } from "@/lib/billing/connections-server";
import { disconnectStripe, refreshStripeConnection } from "@/lib/billing/stripe-connection-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/faturas/conexoes/stripe — reads the connected account again (Stripe's review, requirements).
 * DELETE /api/faturas/conexoes/stripe — disconnects it from the platform and forgets it.
 * Both answer with the connections as they now stand.
 */
export const POST = withAuth({ limit: { scope: "stripe-refresh", limit: 10, windowMs: 60_000 }, tag: "Stripe atualizar" }, async ({ profileId, supabase }) => {
    await refreshStripeConnection(supabase, profileId);
    return NextResponse.json(await loadConnections(supabase, profileId));
});

export const DELETE = withAuth({ limit: { scope: "stripe-connect", limit: 6, windowMs: 60_000 }, tag: "Stripe desconectar" }, async ({ profileId, supabase }) => {
    await disconnectStripe(supabase, profileId);
    return NextResponse.json(await loadConnections(supabase, profileId));
});
