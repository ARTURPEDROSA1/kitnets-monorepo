import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { invoiceGenerateSchema } from "@/lib/schemas/invoice";
import { loadInvoiceList } from "@/lib/invoice-views-server";
import { generateInvoices } from "@/lib/invoices-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/faturas
 * The account's invoices, the leases in force with who collects each component, and the owner's
 * billing decisions — what the Fatura hub shows (lib/invoice-views-server.ts).
 */
export const GET = withAuth({ tag: "Faturas GET" }, async ({ profileId, supabase }) => {
    return NextResponse.json(await loadInvoiceList(supabase, profileId));
});

/**
 * POST /api/faturas
 * Generates the invoices that fall due in `month` (`YYYY-MM`), for every lease in force or for
 * `lease_id`. A lease that already has a live invoice for the month is left alone.
 */
export const POST = withAuth({ body: invoiceGenerateSchema, tag: "Faturas POST" }, async ({ body, profileId, supabase }) => {
    const result = await generateInvoices(supabase, profileId, body.month, { leaseId: body.lease_id, origin: "MANUAL" });
    return NextResponse.json({ result, ...(await loadInvoiceList(supabase, profileId)) });
});
