import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    getOwnerPropertiesSummary,
    type OwnerPropertySummary,
    type UcCategory,
} from "@/lib/energy-properties-server";

export type { OwnerPropertySummary, UcCategory };

export const dynamic = "force-dynamic";

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service credentials");
    return createClient(url, key);
}

/**
 * GET /api/energy-bills/properties
 * Returns all properties and standalone UCs owned by the authenticated user, enriched with
 * solar energy configuration and energy bills statistics.
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const enrichedProperties = await getOwnerPropertiesSummary(userId);
        return NextResponse.json({
            success: true,
            properties: enrichedProperties,
        });
    } catch (err: any) {
        console.error("[Energy Properties GET] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno do servidor" }, { status: 500 });
    }
}

/**
 * POST /api/energy-bills/properties
 * Adds a new standalone UC (e.g. own home, relative's house, beneficiary UC)
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await request.json();
        const {
            name,
            category = "residencia_propria",
            consumerUnit,
            utilityCompany = "CEMIG",
            address,
            city,
            state,
            zip,
            notes,
        } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ error: "O nome da Unidade Consumidora é obrigatório." }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // Find user profile
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("clerk_id", userId)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
        }

        const electronicPayload = JSON.stringify({
            isStandaloneUc: true,
            category: category || "outro",
            ucNumber: consumerUnit?.trim() || null,
            utilityCompany: utilityCompany?.trim() || "CEMIG",
            notes: notes?.trim() || null,
        });

        const { data: newProp, error: insertErr } = await supabase
            .from("properties")
            .insert({
                owner_id: profile.id,
                name: name.trim(),
                address: address?.trim() || null,
                city: city?.trim() || null,
                state: state?.trim() || null,
                zip: zip?.trim() || null,
                electronic_id: electronicPayload,
            })
            .select("id, name, address, city, state, zip, electronic_id")
            .single();

        if (insertErr || !newProp) {
            console.error("[Energy Properties POST] Insert error:", insertErr);
            return NextResponse.json({ error: insertErr?.message || "Erro ao cadastrar UC avulsa" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            property: {
                id: newProp.id,
                name: newProp.name,
                address: newProp.address,
                city: newProp.city,
                state: newProp.state,
                zip: newProp.zip,
                hasSolar: true,
                solarKwp: null,
                billsCount: 0,
                consumerUnit: consumerUnit?.trim() || null,
                utilityCompany: utilityCompany?.trim() || "CEMIG",
                latestMonth: null,
                isStandaloneUc: true,
                ucCategory: category,
                notes: notes?.trim() || null,
            },
        });
    } catch (err: any) {
        console.error("[Energy Properties POST] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}

/**
 * DELETE /api/energy-bills/properties?id=...
 * Deletes a standalone UC and its related energy bills / storage files
 */
export async function DELETE(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get("id");

        if (!propertyId) {
            return NextResponse.json({ error: "ID da propriedade é obrigatório" }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // Verify profile ownership
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("clerk_id", userId)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
        }

        // Verify property exists and belongs to owner
        const { data: prop } = await supabase
            .from("properties")
            .select("id, electronic_id")
            .eq("id", propertyId)
            .eq("owner_id", profile.id)
            .maybeSingle();

        if (!prop) {
            return NextResponse.json({ error: "Propriedade não encontrada ou não autorizada" }, { status: 404 });
        }

        // 1. Unlink gateways
        await supabase
            .from("gateways")
            .update({ property_id: null })
            .eq("property_id", propertyId);

        // 2. Find and delete leases (and their dependent charges, tenants, documents)
        const { data: propLeases } = await supabase
            .from("leases")
            .select("id")
            .eq("property_id", propertyId);

        if (propLeases && propLeases.length > 0) {
            const leaseIds = propLeases.map((l: any) => l.id);
            await supabase.from("lease_charges").delete().in("lease_id", leaseIds);
            await supabase.from("lease_tenants").delete().in("lease_id", leaseIds);
            await supabase.from("lease_documents").delete().in("lease_id", leaseIds);
            await supabase.from("leases").delete().eq("property_id", propertyId);
        }

        // 3. Delete tenants for this property
        const { data: propTenants } = await supabase
            .from("tenants")
            .select("id")
            .eq("property_id", propertyId);

        if (propTenants && propTenants.length > 0) {
            const tenantIds = propTenants.map((t: any) => t.id);
            await supabase.from("lease_tenants").delete().in("tenant_id", tenantIds);
            await supabase.from("tenants").delete().eq("property_id", propertyId);
        }

        // 4. Delete water bills
        await supabase
            .from("water_bills")
            .delete()
            .eq("property_id", propertyId);

        // 5. Delete associated energy bills
        await supabase
            .from("energy_bills")
            .delete()
            .eq("property_id", propertyId);

        // 6. Remove files from storage
        try {
            const { data: files } = await supabase.storage
                .from("energy-bills")
                .list(propertyId);
            if (files && files.length > 0) {
                const paths = files.map(f => `${propertyId}/${f.name}`);
                await supabase.storage.from("energy-bills").remove(paths);
            }
        } catch (storageErr) {
            console.warn("[Energy Properties DELETE] Storage cleanup warning:", storageErr);
        }

        // 7. Delete property record
        const { error: delErr } = await supabase
            .from("properties")
            .delete()
            .eq("id", propertyId);

        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("[Energy Properties DELETE] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}
