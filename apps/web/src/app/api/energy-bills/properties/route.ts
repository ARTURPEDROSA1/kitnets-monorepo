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
}

/**
 * GET /api/energy-bills/properties
 * Returns all properties owned by the authenticated landlord, enriched with
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
            .select("id, name, address, city, state, zip")
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
                .select("id, name, address, city, state, zip")
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
                            .select("id, name, address, city, state, zip")
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

        // 6. Enrich each property with solar info from profile and bills
        const enrichedProperties: OwnerPropertySummary[] = dbProperties.map((prop, idx) => {
            const billStats = billsByPropId[prop.id] || { count: 0, latestMonth: null, consumerUnit: null, utilityCompany: null };

            // Check if matches primary property in profile
            const isPrimary = (idx === 0) || (primaryDetails?.propertyName && primaryDetails.propertyName.trim().toLowerCase() === prop.name.trim().toLowerCase());
            let solarEnergy = false;
            let solarKwp: string | null = null;

            if (isPrimary && primaryDetails) {
                solarEnergy = Boolean(primaryDetails.solarEnergy);
                solarKwp = primaryDetails.solarKwp ? String(primaryDetails.solarKwp) : null;
            } else if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
                // Check in additional properties
                const matchingAp = profile.additional_properties.find((ap: any) => {
                    const apName = ap?.details?.propertyName;
                    return apName && apName.trim().toLowerCase() === prop.name.trim().toLowerCase();
                });
                if (matchingAp?.details) {
                    solarEnergy = Boolean(matchingAp.details.solarEnergy);
                    solarKwp = matchingAp.details.solarKwp ? String(matchingAp.details.solarKwp) : null;
                }
            }

            // Has solar if explicitly flagged OR if bills already exist for it
            const hasSolar = solarEnergy || billStats.count > 0;

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
                consumerUnit: billStats.consumerUnit,
                utilityCompany: billStats.utilityCompany,
                latestMonth: billStats.latestMonth,
            };
        });

        // Sort: properties with solar / bills first, then by name
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
