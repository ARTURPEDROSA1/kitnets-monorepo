import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { interConnectionSchema } from "@/lib/schemas/billing-connection";
import { deleteInterConnection, saveInterConnection } from "@/lib/billing/connections-server";

export const dynamic = "force-dynamic";
// node:crypto and node:https (the bank's API is mutual TLS)
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PUT /api/faturas/conexoes/inter
 * Saves the credentials of the owner's Banco Inter integration (sealed; never returned) and tests them
 * at once. A later save may bring only what changed. Answers with the connections view.
 * The bank gives out five tokens a minute, so saves and tests are limited per user.
 */
export const PUT = withAuth(
    { body: interConnectionSchema, limit: { scope: "inter-connection", limit: 4, windowMs: 60_000 }, tag: "Inter conexão PUT" },
    async ({ body, profileId, supabase }) => NextResponse.json(await saveInterConnection(supabase, profileId, body))
);

/**
 * DELETE /api/faturas/conexoes/inter
 * Erases the owner's Banco Inter credentials.
 */
export const DELETE = withAuth({ tag: "Inter conexão DELETE" }, async ({ profileId, supabase }) => {
    return NextResponse.json(await deleteInterConnection(supabase, profileId));
});
