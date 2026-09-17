import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, notFound } from "@/lib/api-route";
import { UUID_REGEX } from "@/lib/api-auth";
import { resolveAvailabilityKwh } from "@/lib/energy-availability";

/**
 * Server-side pieces of the energy-bills routes: resolving which property a
 * bill belongs to, mapping the extractor's camelCase output to table rows,
 * and the property deletion cascade shared by two routes.
 */

export const ENERGY_BILLS_BUCKET = "energy-bills";

type Json = Record<string, unknown>;

const num = (v: unknown): number => Number(v);
const numOr = (v: unknown, fallback: number): number => Number(v) || fallback;
const numOrNull = (v: unknown): number | null => (v != null ? Number(v) : null);
const numOrZero = (v: unknown): number => (v != null ? Number(v) : 0);

/** "AGO/26" or "AGO/2026" → "2026-08"; passes "2026-08" through; null when unreadable. */
export function parseMonthLabelToIso(label: string | null | undefined): string | null {
    if (!label) return null;
    const clean = label.trim().toUpperCase();
    if (/^\d{4}-\d{2}$/.test(clean)) return clean;

    const months: Record<string, string> = {
        JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
        JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
    };
    const match = clean.match(/([A-Z]{3})\/(\d{2,4})/);
    if (!match) return null;
    const month = months[match[1]];
    if (!month) return null;
    const year = match[2].length === 2 ? `20${match[2]}` : match[2];
    return `${year}-${month}`;
}

/** Row for `energy_bills` from the extractor's bill object. */
export function buildMainBillPayload(propertyId: string, bill: Json, historicalConsumption: unknown, now: Date = new Date()): Json {
    return {
        property_id: propertyId,
        utility_company: bill.utilityCompany || "CEMIG",
        consumer_unit: bill.consumerUnit || "Não informado",
        installation_class: bill.installationClass || null,
        tariff_modality: bill.tariffModality || null,
        reference_month: bill.referenceMonth,
        reference_month_label: bill.referenceMonthLabel || null,
        reading_date_current: bill.readingDateCurrent || null,
        reading_date_previous: bill.readingDatePrevious || null,
        reading_date_next: bill.readingDateNext || null,
        billing_days: numOr(bill.billingDays, 30),
        due_date: bill.dueDate || null,
        meter_number: bill.meterNumber || null,
        grid_reading_previous: numOrNull(bill.gridReadingPrevious),
        grid_reading_current: numOrNull(bill.gridReadingCurrent),
        grid_consumption_kwh: numOr(bill.gridConsumptionKwh, 0),
        daily_avg_kwh: numOrNull(bill.dailyAvgKwh),
        monthly_avg_kwh: numOrNull(bill.monthlyAvgKwh),
        injected_reading_previous: numOrNull(bill.injectedReadingPrevious),
        injected_reading_current: numOrNull(bill.injectedReadingCurrent),
        solar_injected_kwh: numOr(bill.solarInjectedKwh, 0),
        solar_compensated_kwh: numOr(bill.solarCompensatedKwh, 0),
        generation_balance_kwh: numOr(bill.generationBalanceKwh, 0),
        unit_price: numOrNull(bill.unitPrice),
        // ANEEL REN 1.000 art. 291: 30/50/100 kWh by connection type, never a flat 100.
        availability_cost_kwh: resolveAvailabilityKwh(bill.availabilityCostKwh as number | string | null | undefined, bill.installationClass as string | null | undefined),
        availability_cost_amount: numOrZero(bill.availabilityCostAmount),
        energy_scee_exempt_amount: numOrZero(bill.energySceeExemptAmount),
        energy_compensated_amount: numOrZero(bill.energyCompensatedAmount),
        availability_adjustment_amount: numOrZero(bill.availabilityAdjustmentAmount),
        bonus_discounts_amount: numOrZero(bill.bonusDiscountsAmount),
        flag_type: bill.flagType || "Verde",
        flag_amount: numOrZero(bill.flagAmount),
        taxes_icms: numOrZero(bill.taxesIcms),
        taxes_pis_cofins: numOrZero(bill.taxesPisCofins),
        total_amount: numOr(bill.totalAmount, 0),
        is_historical_only: false,
        historical_consumption_raw: historicalConsumption || [],
        notes: bill.notes || null,
        updated_at: now.toISOString(),
    };
}

/**
 * Baseline rows from the bill's 13-month consumption table. The bill's own
 * month and unreadable labels are skipped.
 */
export function buildHistoricalRows(propertyId: string, bill: Json, historicalConsumption: unknown): Json[] {
    if (!Array.isArray(historicalConsumption)) return [];
    const rows: Json[] = [];
    for (const item of historicalConsumption as Json[]) {
        const iso = parseMonthLabelToIso(item?.month as string | undefined);
        if (!iso || iso === bill.referenceMonth) continue;
        rows.push({
            property_id: propertyId,
            consumer_unit: bill.consumerUnit || "Não informado",
            utility_company: bill.utilityCompany || "CEMIG",
            reference_month: iso,
            reference_month_label: item.month,
            grid_consumption_kwh: numOr(item.consumptionKwh, 0),
            daily_avg_kwh: numOrNull(item.dailyAvgKwh),
            billing_days: numOr(item.days, 30),
            is_historical_only: true,
            total_amount: 0,
        });
    }
    return rows;
}

/** Partial update from the edit modal (snake_case). Only provided fields are written. */
export function buildBillUpdatePayload(bill: Json, now: Date = new Date()): Json {
    const gridConsumption = bill.grid_consumption_kwh != null ? num(bill.grid_consumption_kwh) : undefined;
    const billingDays = bill.billing_days != null ? num(bill.billing_days) : undefined;

    let dailyAvg = bill.daily_avg_kwh != null ? num(bill.daily_avg_kwh) : undefined;
    if ((dailyAvg == null || dailyAvg === 0) && gridConsumption != null && billingDays && billingDays > 0) {
        dailyAvg = Math.round((gridConsumption / billingDays) * 100) / 100;
    }

    const out: Json = { updated_at: now.toISOString() };
    if (bill.reference_month !== undefined) out.reference_month = bill.reference_month;
    if (bill.reference_month_label !== undefined) out.reference_month_label = bill.reference_month_label;
    if (bill.due_date !== undefined) out.due_date = bill.due_date || null;
    if (billingDays !== undefined) out.billing_days = billingDays;
    if (gridConsumption !== undefined) out.grid_consumption_kwh = gridConsumption;
    if (dailyAvg !== undefined) out.daily_avg_kwh = dailyAvg;
    if (bill.solar_injected_kwh !== undefined) out.solar_injected_kwh = numOr(bill.solar_injected_kwh, 0);
    if (bill.solar_compensated_kwh !== undefined) out.solar_compensated_kwh = numOr(bill.solar_compensated_kwh, 0);
    if (bill.generation_balance_kwh !== undefined) out.generation_balance_kwh = numOr(bill.generation_balance_kwh, 0);
    if (bill.total_amount !== undefined) out.total_amount = numOr(bill.total_amount, 0);
    if (bill.availability_cost_amount !== undefined) out.availability_cost_amount = numOr(bill.availability_cost_amount, 0);
    if (bill.unit_price !== undefined) out.unit_price = numOrNull(bill.unit_price);
    if (bill.consumer_unit !== undefined) out.consumer_unit = bill.consumer_unit;
    if (bill.utility_company !== undefined) out.utility_company = bill.utility_company;
    if (bill.installation_class !== undefined) out.installation_class = bill.installation_class;
    if (bill.notes !== undefined) out.notes = bill.notes;
    return out;
}

/** Address fields found on a bill, under either naming used by the extractor and the edit modal. */
export function buildPropertyAddressUpdates(bill: Json): Json {
    const pick = (...keys: string[]) => {
        for (const k of keys) {
            const v = bill[k];
            if (typeof v === "string" && v.trim()) return v.trim();
        }
        return undefined;
    };
    const out: Json = {};
    const address = pick("address", "installationAddress");
    const city = pick("city", "installationCity");
    const state = pick("state", "installationState");
    const zip = pick("zip", "installationZip");
    if (address) out.address = address;
    if (city) out.city = city;
    if (state) out.state = state;
    if (zip) out.zip = zip;
    return out;
}

const isStandaloneUc = (electronicId: unknown): boolean => {
    if (typeof electronicId !== "string" || !electronicId) return false;
    try {
        return !!JSON.parse(electronicId).isStandaloneUc;
    } catch {
        return false;
    }
};

/**
 * Resolves the `propertyId` a client sends (a UUID, or a legacy alias such
 * as "primary", "0", "prop-1") to a row in `properties` owned by the profile,
 * creating the row from the profile's onboarding data when it does not exist.
 *
 * A UUID must belong to the caller: it never falls through to the alias logic.
 */
export async function resolvePropertyUuid(supabase: AdminSupabase, profileId: string, inputId: string): Promise<string> {
    if (inputId && UUID_REGEX.test(inputId)) {
        const { data: existing } = await supabase
            .from("properties")
            .select("id")
            .eq("id", inputId)
            .eq("owner_id", profileId)
            .maybeSingle();
        if (existing?.id) return existing.id as string;
        throw notFound("Imóvel não encontrado");
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, property_address, property_details, additional_properties")
        .eq("id", profileId)
        .maybeSingle();
    if (!profile) throw new HttpError(403, { error: "Perfil de usuário não encontrado" });

    const { data: ownerProps } = await supabase
        .from("properties")
        .select("id, name, address, electronic_id, created_at")
        .eq("owner_id", profileId)
        .order("created_at", { ascending: true });

    const existingProps = ownerProps || [];
    const rentalProps = existingProps.filter((p) => !isStandaloneUc(p.electronic_id));
    const byName = (name: string) => rentalProps.find((p) => (p.name as string).trim().toLowerCase() === name.trim().toLowerCase());

    const addr = profile.property_address as Record<string, string> | null;
    const details = profile.property_details as Record<string, string> | null;
    const primaryName =
        details?.propertyName?.trim() ||
        (addr?.street ? `${addr.street}, ${addr.number || ""}`.trim() : profile.full_name ? `Imóvel de ${profile.full_name}` : "Meu Imóvel");

    const insertFromAddress = async (name: string, a: Record<string, string> | null) => {
        const { data, error } = await supabase
            .from("properties")
            .insert({
                owner_id: profileId,
                name,
                address: a?.street ? `${a.street}, ${a.number || ""} - ${a.neighborhood || ""}`.trim() : null,
                city: a?.city || null,
                state: a?.state || null,
                zip: a?.cep || null,
            })
            .select("id")
            .single();
        return { id: (data?.id as string | undefined) ?? null, error };
    };

    // "prop-0" / "0" is the primary property; "prop-N" is the Nth additional one from onboarding.
    const indexMatch = inputId?.match(/^(?:prop-)?(\d+)$/);
    if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10);
        if (idx === 0) {
            const match = byName(primaryName) || rentalProps[0];
            if (match) return match.id as string;
        } else if (Array.isArray(profile.additional_properties)) {
            const ap = profile.additional_properties[idx - 1] as { details?: Record<string, string>; address?: Record<string, string> } | undefined;
            if (ap) {
                const apAddr = ap.address ?? null;
                const apName = ap.details?.propertyName?.trim() || (apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""}`.trim() : `Imóvel ${idx + 1}`);
                const match = byName(apName);
                if (match) return match.id as string;
                const created = await insertFromAddress(apName, apAddr);
                if (created.id) return created.id;
            }
        }
    }

    const primary = byName(primaryName) || rentalProps[0];
    if (primary?.id) return primary.id as string;

    const created = await insertFromAddress(primaryName, addr);
    if (created.id) return created.id;

    console.error("[resolvePropertyUuid] Error creating property:", created.error);
    if (existingProps.length > 0) return existingProps[0].id as string;
    throw new HttpError(500, { error: "Não foi possível identificar nem criar o imóvel vinculado." });
}

/**
 * Removes a property and what hangs off it. Leases (with charges, tenants
 * links and documents) and tenants are deleted; gateways are unlinked; water
 * and energy bills are orphaned so the history can be re-associated; stored
 * bill PDFs are removed. The caller must have verified ownership.
 */
export async function deletePropertyCascade(supabase: AdminSupabase, propertyId: string, tag: string): Promise<{ error: { message: string } | null }> {
    await supabase.from("gateways").update({ property_id: null }).eq("property_id", propertyId);

    const { data: leases } = await supabase.from("leases").select("id").eq("property_id", propertyId);
    if (leases && leases.length > 0) {
        const leaseIds = leases.map((l) => l.id as string);
        await supabase.from("lease_charges").delete().in("lease_id", leaseIds);
        await supabase.from("lease_tenants").delete().in("lease_id", leaseIds);
        await supabase.from("lease_documents").delete().in("lease_id", leaseIds);
        await supabase.from("leases").delete().eq("property_id", propertyId);
    }

    const { data: tenants } = await supabase.from("tenants").select("id").eq("property_id", propertyId);
    if (tenants && tenants.length > 0) {
        const tenantIds = tenants.map((t) => t.id as string);
        await supabase.from("lease_tenants").delete().in("tenant_id", tenantIds);
        await supabase.from("tenants").delete().eq("property_id", propertyId);
    }

    await supabase.from("water_bills").update({ property_id: null }).eq("property_id", propertyId);
    await supabase.from("energy_bills").update({ property_id: null }).eq("property_id", propertyId);

    try {
        const { data: files } = await supabase.storage.from(ENERGY_BILLS_BUCKET).list(propertyId);
        if (files && files.length > 0) {
            await supabase.storage.from(ENERGY_BILLS_BUCKET).remove(files.map((f) => `${propertyId}/${f.name}`));
        }
    } catch (storageErr) {
        console.warn(`[${tag}] Storage cleanup warning:`, storageErr);
    }

    const { error } = await supabase.from("properties").delete().eq("id", propertyId);
    return { error: error ? { message: error.message } : null };
}
