import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { billingSettingsSchema } from "@/lib/schemas/invoice";
import { loadBillingSettings } from "@/lib/invoice-views-server";
import { saveBillingSettings } from "@/lib/invoices-server";

export const dynamic = "force-dynamic";

/**
 * PUT /api/faturas/configuracoes
 * The owner's billing decisions (advance, late fee, interest, payment window). Blank = not decided.
 */
export const PUT = withAuth({ body: billingSettingsSchema, tag: "Faturas configurações" }, async ({ body, profileId, supabase }) => {
    await saveBillingSettings(supabase, profileId, body);
    return NextResponse.json({ settings: await loadBillingSettings(supabase, profileId) });
});
