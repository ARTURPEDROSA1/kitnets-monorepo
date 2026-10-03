import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { previewInvoiceEmail } from "@/lib/billing/deliveries-server";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/faturas/[id]/previa-email
 * The e-mail the tenant gets for this invoice — the invoice itself, or the receipt once it is paid —
 * as it would go out now: sender, reply-to, recipient, subject, text and HTML. Nothing is sent. Before
 * the boleto is issued the bank's codes are placeholders (`placeholders: true`).
 */
export const GET = withAuth<undefined, Params>({ limit: { scope: "invoice-email-preview", limit: 60, windowMs: 60_000 }, tag: "Fatura prévia do e-mail" }, async ({ params, profileId, supabase }) => {
    if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
    return NextResponse.json(await previewInvoiceEmail(supabase, profileId, params.id));
});
