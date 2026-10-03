import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { invoiceCopySchema } from "@/lib/schemas/invoice";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { sendInvoiceCopy } from "@/lib/billing/deliveries-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

/**
 * POST /api/faturas/[id]/copia { email }
 * Sends a copy of the e-mail the tenant gets (the invoice, or the receipt once it is paid) to the
 * address the owner types — marked as a copy, never counted as a delivery to the tenant, and its
 * link does not count as the tenant opening the page. Answers with the invoice as it now stands.
 */
export const POST = withAuth<typeof invoiceCopySchema, Params>(
    { body: invoiceCopySchema, limit: { scope: "invoice-email-copy", limit: 10, windowMs: 60_000 }, tag: "Fatura cópia" },
    async ({ params, body, profileId, supabase }) => {
        if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
        await sendInvoiceCopy(supabase, profileId, params.id, body.email);
        return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
    }
);
