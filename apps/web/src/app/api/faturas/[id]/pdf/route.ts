import { NextResponse } from "next/server";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound, withAuth } from "@/lib/api-route";
import { boletoPdfUrl } from "@/lib/billing/charges-server";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/faturas/[id]/pdf
 * A short-lived URL of the boleto's PDF (private bucket). 404 while the bank has not given it.
 */
export const GET = withAuth<undefined, Params>({ tag: "Fatura PDF" }, async ({ params, profileId, supabase }) => {
    if (!UUID_REGEX.test(params.id)) throw notFound("Fatura não encontrada.");
    const url = await boletoPdfUrl(supabase, profileId, params.id);
    if (!url) throw notFound("O PDF do boleto ainda não está disponível. Atualize o status da fatura.");
    return NextResponse.json({ url });
});
