import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/lib/api-route";
import { env } from "@/lib/env";
import { completeStripeConnect } from "@/lib/billing/stripe-connection-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const back = (query: string) => NextResponse.redirect(`${env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "")}/pt/faturas?aba=conexoes&${query}`, { status: 303 });

/**
 * GET /api/faturas/conexoes/stripe/retorno?code=…&state=…
 * Where Stripe sends the owner back after the OAuth screen. Finishes the connection and returns the
 * owner to Conexões; a refusal (`error=access_denied` when the owner gave up, a stale state, Stripe
 * down) goes back with the reason in the URL for the panel to show.
 */
export const GET = withAuth({ tag: "Stripe retorno" }, async ({ req, profileId, supabase }) => {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const denied = req.nextUrl.searchParams.get("error");
    if (denied || !code || !state) return back(`stripe=cancelado`);
    try {
        await completeStripeConnect(supabase, profileId, code, state);
        return back("stripe=ok");
    } catch (err) {
        if (err instanceof HttpError) {
            const body = err.body as { error?: string; errors?: Record<string, string> };
            return back(`stripe=erro&motivo=${encodeURIComponent(body.error ?? body.errors?._form ?? "A conexão com a Stripe falhou.")}`);
        }
        throw err;
    }
});
