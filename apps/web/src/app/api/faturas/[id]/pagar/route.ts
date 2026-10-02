import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { invoicePaySchema } from "@/lib/schemas/invoice";
import { todayBRT } from "@/lib/lease-dashboard";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { payInvoiceManually } from "@/lib/invoices-server";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * POST /api/faturas/[id]/pagar
 * The owner records a payment received outside the module (baixa manual).
 */
export const POST = withAuth<typeof invoicePaySchema, Params>({ body: invoicePaySchema, tag: "Fatura pagar" }, async ({ body, params, profileId, supabase }) => {
    if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
    await payInvoiceManually(supabase, profileId, params.id, body, todayBRT());
    return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
});
