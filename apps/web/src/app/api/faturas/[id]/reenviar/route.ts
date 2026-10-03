import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { resendInvoiceEmail } from "@/lib/billing/deliveries-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

/**
 * POST /api/faturas/[id]/reenviar
 * Sends the invoice's e-mail to the tenant (again): the boleto's codes, the link to the invoice's page
 * and the PDF. Answers with the invoice as it now stands plus `email`, which says whether it went out
 * — a refused message is not an error of the request, it is a fact about the delivery.
 */
export const POST = withAuth<undefined, Params>(
    { limit: { scope: "invoice-email", limit: 20, windowMs: 60_000 }, tag: "Fatura reenviar" },
    async ({ params, profileId, supabase }) => {
        if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
        const delivery = await resendInvoiceEmail(supabase, profileId, params.id);
        const detail = await loadInvoiceDetail(supabase, params.id, profileId);
        return NextResponse.json({ ...detail, email: { sent: delivery.status === "SENT", error: delivery.status === "SENT" ? null : delivery.last_error ?? "não enviado" } });
    }
);
