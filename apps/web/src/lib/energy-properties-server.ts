import { createClient } from "@supabase/supabase-js";
import { syncPropertyRows } from "@/lib/property-rows-server";
import { linkPropertyRows, type PropertyLink } from "@/lib/property-link";
import { signStorageUrl } from "@/lib/storage";
import { EMPTY_PERIOD, summarizeUnitBills, type EnergyBillLike, type EnergyLatestSnapshot, type EnergyPeriodTotals } from "@/lib/energy-hub";

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
    /** "Água" checked under Medidores Principais do Imóvel: the landlord pays the main water meter (feeds /dashboard/water) */
    hasWaterMeter?: boolean;
    /** a garage (Imóveis) whose energy the owner does not pay ("Energia" unchecked under Medidores): no consumer unit to follow, so the hub leaves it out until a bill is imported */
    garageWithoutMeter?: boolean;
    /** the newest full bill's figures (the hub's tiles and KPIs); null without bills */
    latest?: EnergyLatestSnapshot | null;
    /** the twelve months up to the newest bill */
    last12?: EnergyPeriodTotals;
}

function isStandaloneRow(electronicId: string | null | undefined): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId).isStandaloneUc;
    } catch {
        return false;
    }
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
            .select("id, full_name, property_type, property_address, property_details, additional_properties")
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

        // 3–4. Every property of the profile has its row, linked by id (lib/property-rows-server.ts, per-owner lock)
        const sync = await syncPropertyRows(supabase, profile.id, { profile, rows: dbProperties });
        if (sync.changed > 0) {
            const { data: refreshed } = await supabase
                .from("properties")
                .select("id, name, address, city, state, zip, electronic_id")
                .eq("owner_id", profile.id)
                .order("created_at", { ascending: true });
            dbProperties = refreshed || dbProperties;
        }

        // Which row is which property of the profile: by the id each entry carries, never by name
        const links: PropertyLink[] = sync.links.length > 0
            ? sync.links
            : linkPropertyRows(dbProperties.filter(p => !isStandaloneRow(p.electronic_id)).map(p => ({ id: p.id, name: p.name ?? "", address: p.address })), profile);
        const linkByRow = new Map(links.filter(l => l.rowId).map(l => [l.rowId as string, l]));
        const additionalEntries: any[] = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];

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
        const statsByPropId: Record<string, ReturnType<typeof summarizeUnitBills>> = {};

        if (propIds.length > 0) {
            const { data: allBills } = await supabase
                .from("energy_bills")
                .select("property_id, reference_month, reference_month_label, due_date, total_amount, consumer_unit, utility_company, is_historical_only, grid_consumption_kwh, daily_avg_kwh, billing_days, solar_injected_kwh, solar_compensated_kwh, generation_balance_kwh, unit_price, availability_cost_amount, energy_compensated_amount, energy_scee_exempt_amount")
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

            // The hub's tiles and KPIs: the newest full bill and the twelve months up to it, per property
            const billsByProperty = new Map<string, EnergyBillLike[]>();
            for (const bill of allBills ?? []) {
                const list = billsByProperty.get(bill.property_id) ?? [];
                list.push(bill as EnergyBillLike);
                billsByProperty.set(bill.property_id, list);
            }
            for (const [pid, list] of billsByProperty) statsByPropId[pid] = summarizeUnitBills(list);

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

            // The profile property this row is (lib/property-link.ts)
            const link = isStandaloneUc ? undefined : linkByRow.get(prop.id);
            const isPrimary = link?.ref.slot === 0;
            const matchingAp: any = link && link.ref.slot > 0 ? additionalEntries[link.ref.slot - 1] ?? null : null;

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
            const listingDetails = isPrimary && primaryDetails ? primaryDetails : matchingAp?.details ?? null;
            const hasWaterMeter = Boolean(listingDetails?.mainMeters?.water);
            const listingType = isPrimary && primaryDetails ? profile.property_type : matchingAp?.propertyType;
            const garageWithoutMeter = listingType === "garage" && !listingDetails?.mainMeters?.energy;

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
                hasWaterMeter,
                garageWithoutMeter,
                latest: statsByPropId[prop.id]?.latest ?? null,
                last12: statsByPropId[prop.id]?.last12 ?? EMPTY_PERIOD,
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