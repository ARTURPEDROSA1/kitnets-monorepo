import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { loadInvoiceDetail } from "@/lib/invoice-views-server";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/faturas/[id]
 * One invoice with its items, payer and timeline.
 */
export const GET = withAuth<undefined, Params>({ tag: "Fatura GET" }, async ({ params, profileId, supabase }) => {
    if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
    return NextResponse.json(await loadInvoiceDetail(supabase, params.id, profileId));
});
