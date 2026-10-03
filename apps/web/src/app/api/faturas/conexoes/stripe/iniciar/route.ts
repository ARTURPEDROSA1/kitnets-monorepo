import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { beginStripeConnect } from "@/lib/billing/stripe-connection-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/faturas/conexoes/stripe/iniciar
 * Starts connecting the owner's Stripe account to the platform (Connect OAuth): answers `{ url }`,
 * where the browser sends the owner; Stripe brings them back to `…/stripe/retorno`.
 */
export const POST = withAuth({ limit: { scope: "stripe-connect", limit: 6, windowMs: 60_000 }, tag: "Stripe iniciar" }, async ({ profileId, supabase }) => {
    const { data } = await supabase.from("profiles").select("email").eq("id", profileId).maybeSingle();
    const url = await beginStripeConnect(supabase, profileId, (data?.email as string | null | undefined) ?? null);
    return NextResponse.json({ url });
});
