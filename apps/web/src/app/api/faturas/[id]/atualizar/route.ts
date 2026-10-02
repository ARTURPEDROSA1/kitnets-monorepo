import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";
import { refreshInvoice } from "@/lib/billing/charges-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

/**
 * POST /api/faturas/[id]/atualizar
 * Reads the invoice's live boleto back from the bank: a paid one settles the invoice, an expired one
 * is recorded. Answers with the invoice as it now stands.
 */
export const POST = withAuth<undefined, Params>(
    { limit: { scope: "invoice-refresh", limit: 60, windowMs: 60_000 }, tag: "Fatura atualizar" },
    async ({ params, profileId, supabase }) => {
        if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
        await refreshInvoice(supabase, profileId, params.id, "OWNER");
        return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
    }
);
