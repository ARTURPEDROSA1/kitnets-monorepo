import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { invoiceSandboxPaySchema } from "@/lib/schemas/invoice";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { paySandboxCharge } from "@/lib/billing/charges-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

/**
 * POST /api/faturas/[id]/pagar-sandbox
 * Outside production only: the bank's sandbox pays the live boleto as the tenant would, and the
 * invoice is read back. 403 on the production site.
 */
export const POST = withAuth<typeof invoiceSandboxPaySchema, Params>(
    { body: invoiceSandboxPaySchema, limit: { scope: "invoice-sandbox-pay", limit: 10, windowMs: 60_000 }, tag: "Fatura pagar (sandbox)" },
    async ({ body, params, profileId, supabase }) => {
        if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
        await paySandboxCharge(supabase, profileId, params.id, body.via);
        return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
    }
);
