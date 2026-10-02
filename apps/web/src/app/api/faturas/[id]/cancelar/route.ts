import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { invoiceCancelSchema } from "@/lib/schemas/invoice";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { cancelInvoice } from "@/lib/invoices-server";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * POST /api/faturas/[id]/cancelar
 * Cancels an open invoice; the lease's month can be invoiced again.
 */
export const POST = withAuth<typeof invoiceCancelSchema, Params>({ body: invoiceCancelSchema, tag: "Fatura cancelar" }, async ({ body, params, profileId, supabase }) => {
    if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
    await cancelInvoice(supabase, profileId, params.id, body.reason);
    return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
});
