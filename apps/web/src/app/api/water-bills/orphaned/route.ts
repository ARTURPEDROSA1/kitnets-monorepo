import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/water-bills/orphaned
 * Returns orphaned water bills (property_id IS NULL) so the user can reclaim them.
 */
export async function GET() {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const supabase = createAdminClient();

        const { data: orphaned, error } = await supabase
            .from("water_bills")
            .select("id, reference_month, meter_number, consumption_m3, total_amount")
            .is("property_id", null)
            .order("reference_month", { ascending: false });

        if (error) {
            console.error("[orphaned-bills] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ bills: orphaned || [] });
    } catch (err: any) {
        console.error("[orphaned-bills] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}

/**
 * POST /api/water-bills/orphaned
 * Re-associates orphaned water bills to a property.
 * Body: { billIds: string[], propertyId: string }
 */
export async function POST(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await request.json();
        const { billIds, propertyId } = body;

        if (!billIds?.length || !propertyId) {
            return NextResponse.json({ error: "billIds e propertyId são obrigatórios" }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Verify the property belongs to this user
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("clerk_id", user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
        }

        const { data: prop } = await supabase
            .from("properties")
            .select("id")
            .eq("id", propertyId)
            .eq("owner_id", profile.id)
            .maybeSingle();

        if (!prop) {
            return NextResponse.json({ error: "Imóvel não encontrado ou não pertence a você" }, { status: 403 });
        }

        // Re-associate orphaned bills to this property
        const { error: updateErr, count } = await supabase
            .from("water_bills")
            .update({ property_id: propertyId })
            .in("id", billIds)
            .is("property_id", null); // Only update orphaned bills

        if (updateErr) {
            console.error("[orphaned-bills] Update error:", updateErr);
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, claimed: count || billIds.length });
    } catch (err: any) {
        console.error("[orphaned-bills] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}
