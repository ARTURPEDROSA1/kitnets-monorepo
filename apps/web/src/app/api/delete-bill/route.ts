import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";

/**
 * POST /api/delete-bill
 * body: { billId: uuid }
 * Deletes a water bill that belongs to one of the caller's properties.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const body = await request.json().catch(() => ({}));
    const billId = typeof body?.billId === "string" ? body.billId : "";
    if (!UUID_REGEX.test(billId)) {
        return NextResponse.json({ error: "billId is required" }, { status: 400 });
    }

    // Ownership: bill → property → owner. Orphaned bills (property_id NULL) are not deletable here.
    const { data: bill } = await supabase
        .from("water_bills")
        .select("id, property_id, properties!inner(owner_id)")
        .eq("id", billId)
        .eq("properties.owner_id", profileId)
        .maybeSingle();

    if (!bill) {
        return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    const { error, count } = await supabase
        .from("water_bills")
        .delete({ count: "exact" })
        .eq("id", billId)
        .eq("property_id", bill.property_id);

    if (error) {
        console.error("[Delete Bill] Error:", error.message);
        return NextResponse.json({ error: "Erro ao excluir conta" }, { status: 500 });
    }

    if (!count) {
        return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
