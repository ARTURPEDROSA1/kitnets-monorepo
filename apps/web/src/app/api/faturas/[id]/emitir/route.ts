import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { invoiceIssueSchema } from "@/lib/schemas/invoice";
import { todayBRT } from "@/lib/lease-dashboard";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { issueInvoice } from "@/lib/billing/charges-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

/**
 * POST /api/faturas/[id]/emitir
 * Issues the invoice at the owner's bank as a "boleto com Pix". `due_date` moves the invoice's due
 * date first (needed when it has passed). Answers with the invoice as it now stands; 400 with the
 * blockers, 409 when a boleto is already live, 502 with the bank's reason.
 */
export const POST = withAuth<typeof invoiceIssueSchema, Params>(
    { body: invoiceIssueSchema, limit: { scope: "invoice-issue", limit: 30, windowMs: 60_000 }, tag: "Fatura emitir" },
    async ({ body, params, profileId, supabase }) => {
        if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
        await issueInvoice(supabase, profileId, params.id, todayBRT(), { dueDate: body.due_date });
        return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
    }
);
