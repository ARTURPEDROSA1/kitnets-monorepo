import { createClient } from "@supabase/supabase-js";
import { signStorageUrl } from "@/lib/storage";

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
    latestMonthLabel?: string | null;
    latestDueDate?: string | null;
    latestTotalAmount?: number | null;
    isStandaloneUc: boolean;
    isOrphaned?: boolean;
    hasRentalListing?: boolean;
    ucCategory: UcCategory | null;
    notes?: string | null;
    latestBillPdfUrl?: string | null;
}

/**
 * Server-side helper to fetch and enrich all properties and standalone UCs for an owner.
 * Does NOT create phantom properties on GET.
 */
export async function getOwnerPropertiesSummary(userId: string): Promise<OwnerPropertySummary[]> {
    if (!userId) return [];

    try {
        const supabase = getServiceSupabase();

        // 1. Get user profile
        const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, property_address, property_details, additional_properties")
            .eq("clerk_id", userId)
            .maybeSingle();

        if (!profile) {
            return [];
        }

        // 2. Fetch all properties registered in public.properties for this owner
        let { data: dbProperties } = await supabase
            .from("properties")
            .select("id, name, address, city, state, zip, electronic_id")
            .eq("owner_id", profile.id)
            .order("created_at", { ascending: true });

        dbProperties = dbProperties || [];

        // Check if user has real configured properties in profile
        const primaryDetails = profile.property_details as Record<string, any> | null;
        const primaryAddress = profile.property_address as Record<string, any> | null;
        const hasRealPrimary = Boolean(primaryDetails?.propertyName?.trim() || primaryAddress?.street?.trim());
        const hasRealAdditional = Array.isArray(profile.additional_properties) && profile.additional_properties.some(
            (ap: any) => Boolean(ap?.details?.propertyName?.trim() || ap?.address?.street?.trim())
        );

        // Fast return if user has no properties in DB and no properties configured in profile
        if (dbProperties.length === 0 && !hasRealPrimary && !hasRealAdditional) {
            return [];
        }

        // 3. Ensure primary property from profile has a row in properties if real property exists
        if (hasRealPrimary) {
            const primaryName = primaryDetails?.propertyName?.trim() || (primaryAddress?.street ? `${primaryAddress.street}, ${primaryAddress.number || ""}`.trim() : (profile.full_name ? `Imóvel de ${profile.full_name}` : "Meu Imóvel"));
            const exists = dbProperties.find(p => {
                let isUc = false;
                if (p.electronic_id) {
                    try {
                        const parsed = JSON.parse(p.electronic_id);
                        if (parsed.isStandaloneUc) isUc = true;
                    } catch {}
                }
                if (isUc) return false;
                return p.name.trim().toLowerCase() === primaryName.trim().toLowerCase();
            });

            if (!exists) {
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
                    dbProperties.unshift(newPrimary);
                }
            }
        }

        // 4. Ensure additional properties from profile.additional_properties are registered in properties
        if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
            for (const ap of profile.additional_properties) {
                const apDetails = ap?.details as Record<string, any> | null;
                const apAddr = ap?.address as Record<string, any> | null;
                const apName = apDetails?.propertyName?.trim() || (apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""}`.trim() : null);

                if (apName) {
                    const exists = dbProperties.find(p => {
                        let isUc = false;
                        if (p.electronic_id) {
                            try {
                                const parsed = JSON.parse(p.electronic_id);
                                if (parsed.isStandaloneUc) isUc = true;
                            } catch {}
                        }
                        if (isUc) return false;
                        return p.name.trim().toLowerCase() === apName.trim().toLowerCase();
                    });
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
        const billsByPropId: Record<string, {
            count: number;
            latestMonth: string | null;
            latestMonthLabel: string | null;
            latestDueDate: string | null;
            latestTotalAmount: number | null;
            consumerUnit: string | null;
            utilityCompany: string | null;
            latestBillPdfUrl: string | null;
        }> = {};

        if (propIds.length > 0) {
            const { data: allBills } = await supabase
                .from("energy_bills")
                .select("property_id, reference_month, reference_month_label, due_date, total_amount, consumer_unit, utility_company, is_historical_only")
                .in("property_id", propIds)
                .order("reference_month", { ascending: false });

            if (allBills) {
                for (const bill of allBills) {
                    const pid = bill.property_id;
                    if (!billsByPropId[pid]) {
                        billsByPropId[pid] = {
                            count: 1,
                            latestMonth: bill.reference_month || null,
                            latestMonthLabel: bill.reference_month_label || null,
                            latestDueDate: bill.due_date || null,
                            latestTotalAmount: bill.total_amount != null && Number(bill.total_amount) > 0 ? Number(bill.total_amount) : null,
                            consumerUnit: bill.consumer_unit || null,
                            utilityCompany: bill.utility_company || null,
                            latestBillPdfUrl: null,
                        };
                    } else {
                        billsByPropId[pid].count += 1;
                        const current = billsByPropId[pid];
                        if (!current.latestMonth && bill.reference_month) {
                            current.latestMonth = bill.reference_month;
                        }
                        if (!current.latestDueDate && bill.due_date) {
                            current.latestDueDate = bill.due_date;
                        }
                        if ((!current.latestTotalAmount || current.latestTotalAmount === 0) && bill.total_amount && Number(bill.total_amount) > 0) {
                            current.latestTotalAmount = Number(bill.total_amount);
                            if (bill.reference_month_label) current.latestMonthLabel = bill.reference_month_label;
                        }
                        if (!current.consumerUnit && bill.consumer_unit) {
                            current.consumerUnit = bill.consumer_unit;
                        }
                        if (!current.utilityCompany && bill.utility_company) {
                            current.utilityCompany = bill.utility_company;
                        }
                    }
                }
            }

            // Resolve PDF URLs from Supabase Storage for properties that have bills
            // pdf_url is NOT a DB column — PDFs are stored as {propertyId}/current_bill.pdf in storage
            const propsWithBills = Object.keys(billsByPropId);
            if (propsWithBills.length > 0) {
                try {
                    await Promise.all(propsWithBills.map(async (pid) => {
                        try {
                            const { data: files } = await supabase.storage
                                .from("energy-bills")
                                .list(pid, { limit: 10, search: "current_bill" });
                            if (files?.some((f: any) => f.name === "current_bill.pdf")) {
                                // Private bucket: short-lived signed URL
                                const signed = await signStorageUrl(supabase, "energy-bills", `${pid}/current_bill.pdf`);
                                if (signed) {
                                    billsByPropId[pid].latestBillPdfUrl = signed;
                                }
                            }
                        } catch {
                            // Ignore individual storage lookup failures
                        }
                    }));
                } catch {
                    // Ignore batch storage lookup failures
                }
            }
        }

        // 6. Enrich each property with solar info from profile, bills, or electronic_id
        const enrichedProperties: OwnerPropertySummary[] = dbProperties.map((prop, idx) => {
            const billStats = billsByPropId[prop.id] || {
                count: 0,
                latestMonth: null,
                latestMonthLabel: null,
                latestDueDate: null,
                latestTotalAmount: null,
                consumerUnit: null,
                utilityCompany: null,
                latestBillPdfUrl: null,
            };

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
            const hasPrimaryInProfile = Boolean(
                primaryDetails?.propertyName ||
                primaryAddress?.street ||
                (primaryAddress && Object.values(primaryAddress).some(Boolean))
            );
            const isPrimary = !isStandaloneUc && hasPrimaryInProfile && (
                (primaryDetails?.propertyName && primaryDetails.propertyName.trim().toLowerCase() === prop.name.trim().toLowerCase()) ||
                (primaryAddress?.street && prop.name.trim().toLowerCase().includes(primaryAddress.street.trim().toLowerCase())) ||
                (!dbProperties.some(p => {
                    if (p.id === prop.id) return false;
                    try {
                        const parsed = p.electronic_id ? JSON.parse(p.electronic_id) : null;
                        if (parsed?.isStandaloneUc) return false;
                    } catch {}
                    return true;
                }))
            );

            let matchingAp: any = null;
            if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
                matchingAp = profile.additional_properties.find((ap: any) => {
                    const apName = ap?.details?.propertyName;
                    const apStreet = ap?.address?.street;
                    if (apName && apName.trim().toLowerCase() === prop.name.trim().toLowerCase()) return true;
                    if (apStreet && prop.name.trim().toLowerCase().includes(apStreet.trim().toLowerCase())) return true;
                    return false;
                });
            }

            const hasRentalListing = isPrimary || Boolean(matchingAp);
            const isOrphaned = !isStandaloneUc && !hasRentalListing;
            const effectiveStandaloneUc = isStandaloneUc || isOrphaned;

            let solarEnergy = false;
            let solarKwp: string | null = null;

            if (isPrimary && primaryDetails) {
                solarEnergy = Boolean(primaryDetails.solarEnergy);
                solarKwp = primaryDetails.solarKwp ? String(primaryDetails.solarKwp) : null;
            } else if (matchingAp?.details) {
                solarEnergy = Boolean(matchingAp.details.solarEnergy);
                solarKwp = matchingAp.details.solarKwp ? String(matchingAp.details.solarKwp) : null;
            }

            const currentAddress = prop.address;
            const currentCity = prop.city;
            const currentState = prop.state;
            const currentZip = prop.zip;
            const ucNum = billStats.consumerUnit || savedUcNumber;

            const hasSolar = effectiveStandaloneUc || solarEnergy || billStats.count > 0;

            return {
                id: prop.id,
                name: prop.name,
                address: currentAddress,
                city: currentCity,
                state: currentState,
                zip: currentZip,
                hasSolar,
                solarKwp,
                billsCount: billStats.count,
                consumerUnit: ucNum,
                utilityCompany: billStats.utilityCompany || savedUtilityCompany,
                latestMonth: billStats.latestMonth,
                latestMonthLabel: billStats.latestMonthLabel,
                latestDueDate: billStats.latestDueDate,
                latestTotalAmount: billStats.latestTotalAmount,
                isStandaloneUc: effectiveStandaloneUc,
                isOrphaned,
                hasRentalListing,
                ucCategory: ucCategory || (isOrphaned ? "outro" : null),
                notes: savedNotes || (isOrphaned ? "Imóvel desvinculado do portfólio de aluguel" : null),
                latestBillPdfUrl: billStats.latestBillPdfUrl,
            };
        });

        enrichedProperties.sort((a, b) => {
            if (a.hasSolar && !b.hasSolar) return -1;
            if (!a.hasSolar && b.hasSolar) return 1;
            if (a.billsCount !== b.billsCount) return b.billsCount - a.billsCount;
            return a.name.localeCompare(b.name);
        });

        return enrichedProperties;
    } catch (err) {
        console.error("[getOwnerPropertiesSummary] Error:", err);
        return [];
    }
}