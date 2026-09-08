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

export type UcCategory = "residencia_propria" | "parente" | "beneficiaria" | "outro";

export interface OwnerPropertySummary {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    hasSolar: boolean;
    solarKwp: string | null;
    billsCount: number;
    consumerUnit: string | null;
    utilityCompany: string | null;
    latestMonth: string | null;
    isStandaloneUc: boolean;
    ucCategory: UcCategory | null;
    notes?: string | null;
}

/**
 * GET /api/energy-bills/properties
 * Returns all properties and standalone UCs owned by the authenticated user, enriched with
 * solar energy configuration and energy bills statistics.
 */
export async function GET() {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const supabase = getServiceSupabase();

        // 1. Get user profile
        const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, property_address, property_details, additional_properties")
            .eq("clerk_id", user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ success: true, properties: [] });
        }

        // 2. Fetch all properties registered in public.properties for this owner
        let { data: dbProperties } = await supabase
            .from("properties")
            .select("id, name, address, city, state, zip, electronic_id")
            .eq("owner_id", profile.id)
            .order("created_at", { ascending: true });

        dbProperties = dbProperties || [];

        // 3. Ensure primary property from profile has a row in properties if not already there
        const primaryDetails = profile.property_details as Record<string, any> | null;
        const primaryAddress = profile.property_address as Record<string, any> | null;
        const primaryName = primaryDetails?.propertyName || (primaryAddress?.street ? `${primaryAddress.street}, ${primaryAddress.number || ""}`.trim() : (profile.full_name ? `Imóvel de ${profile.full_name}` : "Meu Imóvel"));

        if (dbProperties.length === 0 && (primaryDetails || primaryAddress?.street)) {
            const { data: newPrimary } = await supabase
                .from("properties")
                .insert({
                    owner_id: profile.id,
                    name: primaryName,
                    address: primaryAddress?.street ? `${primaryAddress.street}, ${primaryAddress.number || ""} - ${primaryAddress.neighborhood || ""}`.trim() : null,
                    city: primaryAddress?.city || null,
                    state: primaryAddress?.state || null,
                    zip: primaryAddress?.cep || null,
                })
                .select("id, name, address, city, state, zip, electronic_id")
                .single();

            if (newPrimary) {
                dbProperties.push(newPrimary);
            }
        }

        // 4. Ensure additional properties from profile.additional_properties are registered in properties
        if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
            for (const ap of profile.additional_properties) {
                const apDetails = ap?.details as Record<string, any> | null;
                const apAddr = ap?.address as Record<string, any> | null;
                const apName = apDetails?.propertyName || (apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""}`.trim() : null);

                if (apName) {
                    const exists = dbProperties.find(
                        p => p.name.trim().toLowerCase() === apName.trim().toLowerCase()
                    );
                    if (!exists) {
                        const { data: createdAp } = await supabase
                            .from("properties")
                            .insert({
                                owner_id: profile.id,
                                name: apName,
                                address: apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""} - ${apAddr.neighborhood || ""}`.trim() : null,
                                city: apAddr?.city || null,
                                state: apAddr?.state || null,
                                zip: apAddr?.cep || null,
                            })
                            .select("id, name, address, city, state, zip, electronic_id")
                            .single();

                        if (createdAp) {
                            dbProperties.push(createdAp);
                        }
                    }
                }
            }
        }

        // 5. Gather all property IDs to query energy_bills stats
        const propIds = dbProperties.map(p => p.id);
        const billsByPropId: Record<string, { count: number; latestMonth: string | null; consumerUnit: string | null; utilityCompany: string | null }> = {};

        if (propIds.length > 0) {
            const { data: allBills } = await supabase
                .from("energy_bills")
                .select("property_id, reference_month, consumer_unit, utility_company")
                .in("property_id", propIds)
                .order("reference_month", { ascending: false });

            if (allBills) {
                for (const bill of allBills) {
                    if (!billsByPropId[bill.property_id]) {
                        billsByPropId[bill.property_id] = {
                            count: 1,
                            latestMonth: bill.reference_month || null,
                            consumerUnit: bill.consumer_unit || null,
                            utilityCompany: bill.utility_company || null,
                        };
                    } else {
                        billsByPropId[bill.property_id].count += 1;
                        if (!billsByPropId[bill.property_id].latestMonth && bill.reference_month) {
                            billsByPropId[bill.property_id].latestMonth = bill.reference_month;
                        }
                    }
                }
            }
        }

        // 6. Enrich each property with solar info from profile, bills, or electronic_id
        const enrichedProperties: OwnerPropertySummary[] = dbProperties.map((prop, idx) => {
            const billStats = billsByPropId[prop.id] || { count: 0, latestMonth: null, consumerUnit: null, utilityCompany: null };

            // Check if this property is marked as a standalone UC in electronic_id
            let isStandaloneUc = false;
            let ucCategory: UcCategory | null = null;
            let savedUcNumber: string | null = null;
            let savedUtilityCompany: string | null = null;
            let savedNotes: string | null = null;

            if (prop.electronic_id) {
                try {
                    const parsed = JSON.parse(prop.electronic_id);
                    if (parsed.isStandaloneUc) {
                        isStandaloneUc = true;
                        ucCategory = parsed.category || "outro";
                        savedUcNumber = parsed.ucNumber || null;
                        savedUtilityCompany = parsed.utilityCompany || null;
                        savedNotes = parsed.notes || null;
                    }
                } catch {
                    // ignore non-json electronic_id
                }
            }

            // Check if matches primary rental property in profile
            const isPrimary = (idx === 0) || (primaryDetails?.propertyName && primaryDetails.propertyName.trim().toLowerCase() === prop.name.trim().toLowerCase());
            let solarEnergy = false;
            let solarKwp: string | null = null;

            if (!isStandaloneUc) {
                if (isPrimary && primaryDetails) {
                    solarEnergy = Boolean(primaryDetails.solarEnergy);
                    solarKwp = primaryDetails.solarKwp ? String(primaryDetails.solarKwp) : null;
                } else if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
                    const matchingAp = profile.additional_properties.find((ap: any) => {
                        const apName = ap?.details?.propertyName;
                        return apName && apName.trim().toLowerCase() === prop.name.trim().toLowerCase();
                    });
                    if (matchingAp?.details) {
                        solarEnergy = Boolean(matchingAp.details.solarEnergy);
                        solarKwp = matchingAp.details.solarKwp ? String(matchingAp.details.solarKwp) : null;
                    }
                }
            }

            // A standalone UC always participates in the Energy Hub
            const hasSolar = isStandaloneUc || solarEnergy || billStats.count > 0;

            return {
                id: prop.id,
                name: prop.name,
                address: prop.address,
                city: prop.city,
                state: prop.state,
                zip: prop.zip,
                hasSolar,
                solarKwp,
                billsCount: billStats.count,
                consumerUnit: billStats.consumerUnit || savedUcNumber,
                utilityCompany: billStats.utilityCompany || savedUtilityCompany,
                latestMonth: billStats.latestMonth,
                isStandaloneUc,
                ucCategory,
                notes: savedNotes,
            };
        });

        // Sort: properties with solar / bills first, then standalone UCs, then by name
        enrichedProperties.sort((a, b) => {
            if (a.hasSolar && !b.hasSolar) return -1;
            if (!a.hasSolar && b.hasSolar) return 1;
            if (a.billsCount !== b.billsCount) return b.billsCount - a.billsCount;
            return a.name.localeCompare(b.name);
        });

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
        const user = await currentUser();
        if (!user) {
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
            .eq("clerk_id", user.id)
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
        const user = await currentUser();
        if (!user) {
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
            .eq("clerk_id", user.id)
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

        // 1. Delete associated energy bills
        await supabase
            .from("energy_bills")
            .delete()
            .eq("property_id", propertyId);

        // 2. Remove files from storage
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

        // 3. Delete property record
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
