import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service credentials");
    return createClient(url, key);
}

export async function POST(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await request.json();
        const {
            propertyId,
            name,
            address,
            action = "delete_all", // "delete_all" | "keep_energy"
        } = body;

        const supabase = getServiceSupabase();

        // 1. Find user profile
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("clerk_id", user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
        }

        // 2. Locate the corresponding property in public.properties
        let matchedProp: { id: string; name: string; electronic_id: string | null } | null = null;

        if (propertyId) {
            const { data } = await supabase
                .from("properties")
                .select("id, name, electronic_id")
                .eq("id", propertyId)
                .eq("owner_id", profile.id)
                .maybeSingle();
            matchedProp = data;
        }

        if (!matchedProp) {
            // Find all properties owned by this user
            const { data: ownerProps } = await supabase
                .from("properties")
                .select("id, name, address, electronic_id")
                .eq("owner_id", profile.id);

            if (ownerProps && ownerProps.length > 0) {
                const normName = name ? String(name).trim().toLowerCase() : "";
                const normAddress = address ? String(address).trim().toLowerCase() : "";

                // Match by exact/partial name or address
                matchedProp = ownerProps.find(p => {
                    const pName = (p.name || "").trim().toLowerCase();
                    const pAddr = (p.address || "").trim().toLowerCase();

                    if (normName && (pName === normName || pName.includes(normName) || normName.includes(pName))) {
                        return true;
                    }
                    if (normAddress && (pAddr === normAddress || pAddr.includes(normAddress) || normAddress.includes(pAddr))) {
                        return true;
                    }
                    return false;
                }) || null;

                // If only 1 property exists for this owner and no other name matched, match it
                if (!matchedProp && ownerProps.length === 1 && (normName || normAddress)) {
                    matchedProp = ownerProps[0];
                }
            }
        }

        // 3. Perform action
        if (action === "keep_energy") {
            if (matchedProp) {
                // Convert existing property to a standalone UC
                let currentPayload: Record<string, any> = {};
                if (matchedProp.electronic_id) {
                    try {
                        currentPayload = JSON.parse(matchedProp.electronic_id);
                    } catch {
                        currentPayload = {};
                    }
                }

                const updatedElectronic = JSON.stringify({
                    ...currentPayload,
                    isStandaloneUc: true,
                    category: currentPayload.category || "outro",
                    convertedFromRental: true,
                    convertedAt: new Date().toISOString(),
                    notes: currentPayload.notes || "Convertido de imóvel de aluguel removido",
                });

                await supabase
                    .from("properties")
                    .update({ electronic_id: updatedElectronic })
                    .eq("id", matchedProp.id);

                return NextResponse.json({
                    success: true,
                    action: "converted_to_standalone",
                    propertyId: matchedProp.id,
                });
            } else {
                // Property wasn't in public.properties yet, but user wants to keep energy monitoring:
                // create it as standalone UC
                const electronicPayload = JSON.stringify({
                    isStandaloneUc: true,
                    category: "outro",
                    convertedFromRental: true,
                    convertedAt: new Date().toISOString(),
                    notes: "Criado como UC Avulsa após remoção do imóvel de aluguel",
                });

                const { data: newProp, error: insErr } = await supabase
                    .from("properties")
                    .insert({
                        owner_id: profile.id,
                        name: name || address || "UC Avulsa",
                        address: address || null,
                        electronic_id: electronicPayload,
                    })
                    .select("id")
                    .single();

                if (insErr) {
                    console.error("[sync-deletion] Error creating standalone UC:", insErr);
                }

                return NextResponse.json({
                    success: true,
                    action: "created_standalone",
                    propertyId: newProp?.id,
                });
            }
        } else {
            // action === "delete_all"
            if (matchedProp) {
                const targetId = matchedProp.id;

                // 1. Unlink gateways
                await supabase
                    .from("gateways")
                    .update({ property_id: null })
                    .eq("property_id", targetId);

                // 2. Find and delete leases (and their dependent charges, tenants, documents)
                const { data: propLeases } = await supabase
                    .from("leases")
                    .select("id")
                    .eq("property_id", targetId);

                if (propLeases && propLeases.length > 0) {
                    const leaseIds = propLeases.map((l: any) => l.id);
                    await supabase.from("lease_charges").delete().in("lease_id", leaseIds);
                    await supabase.from("lease_tenants").delete().in("lease_id", leaseIds);
                    await supabase.from("lease_documents").delete().in("lease_id", leaseIds);
                    await supabase.from("leases").delete().eq("property_id", targetId);
                }

                // 3. Delete tenants for this property
                const { data: propTenants } = await supabase
                    .from("tenants")
                    .select("id")
                    .eq("property_id", targetId);

                if (propTenants && propTenants.length > 0) {
                    const tenantIds = propTenants.map((t: any) => t.id);
                    await supabase.from("lease_tenants").delete().in("tenant_id", tenantIds);
                    await supabase.from("tenants").delete().eq("property_id", targetId);
                }

                // 4. Orphan water bills (preserve data — user can re-associate later)
                await supabase
                    .from("water_bills")
                    .update({ property_id: null })
                    .eq("property_id", targetId);

                // 5. Orphan energy bills (preserve data — user can re-associate later)
                await supabase
                    .from("energy_bills")
                    .update({ property_id: null })
                    .eq("property_id", targetId);

                // 6. Remove files from storage
                try {
                    const { data: files } = await supabase.storage
                        .from("energy-bills")
                        .list(targetId);
                    if (files && files.length > 0) {
                        const paths = files.map(f => `${targetId}/${f.name}`);
                        await supabase.storage.from("energy-bills").remove(paths);
                    }
                } catch (storageErr) {
                    console.warn("[sync-deletion] Storage cleanup warning:", storageErr);
                }

                // 7. Delete property record
                const { error: delErr } = await supabase
                    .from("properties")
                    .delete()
                    .eq("id", targetId);

                if (delErr) {
                    console.error("[sync-deletion] Properties delete error:", delErr);
                    return NextResponse.json({ error: delErr.message }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    action: "deleted",
                    propertyId: targetId,
                });
            }

            return NextResponse.json({
                success: true,
                action: "none_needed",
                message: "Imóvel não constava na tabela de energia.",
            });
        }
    } catch (err: any) {
        console.error("[sync-deletion] Error:", err);
        return NextResponse.json({ error: err.message || "Erro interno do servidor" }, { status: 500 });
    }
}
