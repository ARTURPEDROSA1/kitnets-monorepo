import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { collectionUpdateSchema } from "@/lib/schemas/invoice";
import { loadRecurringLeases } from "@/lib/invoice-views-server";
import { updateCollection } from "@/lib/invoices-server";

export const dynamic = "force-dynamic";

/**
 * PUT /api/faturas/cobrancas
 * Says who collects one component of a lease (`rent` or a charge's id) and/or pauses the lease's
 * invoicing. Answers with the leases in force as "Cobranças recorrentes" shows them.
 */
export const PUT = withAuth({ body: collectionUpdateSchema, tag: "Faturas cobranças" }, async ({ body, profileId, supabase }) => {
    await updateCollection(supabase, profileId, body);
    return NextResponse.json({ recurring: await loadRecurringLeases(supabase, profileId) });
});
