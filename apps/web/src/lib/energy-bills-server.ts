import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, notFound } from "@/lib/api-route";
import { UUID_REGEX } from "@/lib/api-auth";
import { resolveAvailabilityKwh } from "@/lib/energy-availability";
import { removeWaterFiles } from "@/lib/water-bills-server";
import { syncPropertyRows } from "@/lib/property-rows-server";

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
        // Left empty when the bill did not show it: never derived (see lib/energy-bill-checks.ts).
        solar_compensated_kwh: numOrNull(bill.solarCompensatedKwh),
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
 * as "primary", "0", "prop-1") to a row in `properties` owned by the profile:
 * the row linked to that Imóveis property (created when it has none yet).
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

    // An alias names a profile property by slot: "primary" / "0" / "prop-0" the first, "prop-N" the Nth
    // additional one. Its row is the one linked to that entry by id (lib/property-link.ts), never by name.
    const indexMatch = inputId?.match(/^(?:prop-)?(\d+)$/);
    const slot = indexMatch ? parseInt(indexMatch[1], 10) : 0;
    const { links } = await syncPropertyRows(supabase, profileId);
    const linked = links.find(l => l.ref.slot === slot)?.rowId;
    if (linked) return linked;
    if (links.length > 0) throw notFound("Imóvel não encontrado");

    // An account without any property in Imóveis: its one rental row, or a new one named after the owner
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
    if (!profile) throw new HttpError(403, { error: "Perfil de usuário não encontrado" });
    const { data: ownerProps } = await supabase
        .from("properties")
        .select("id, electronic_id")
        .eq("owner_id", profileId)
        .order("created_at", { ascending: true });
    const rental = (ownerProps ?? []).filter((p) => !isStandaloneUc(p.electronic_id));
    if (rental.length > 0) return rental[0].id as string;
    const { data: created, error } = await supabase
        .from("properties")
        .insert({ owner_id: profileId, name: profile.full_name ? `Imóvel de ${profile.full_name}` : "Meu Imóvel" })
        .select("id")
        .single();
    if (created?.id) return created.id as string;
    console.error("[resolvePropertyUuid] Error creating property:", error);
    throw new HttpError(500, { error: "Não foi possível identificar nem criar o imóvel vinculado." });
}

/**
 * Removes a rental property and what hangs off it in ONE database transaction (delete_property_cascade,
 * migration 20261006120000): refused while a contract that is not deleted, or an invoice, points to it, and
 * then nothing changes. Bills are kept without a property, so their history can be linked again; their
 * stored PDFs go once the property is gone. The caller must have verified the property is the one meant.
 */
export async function deletePropertyCascade(
    supabase: AdminSupabase,
    propertyId: string,
    ownerId: string,
    tag: string,
): Promise<{ error: { message: string; status: number } | null }> {
    const { error } = await supabase.rpc("delete_property_cascade", { p_property_id: propertyId, p_owner_id: ownerId });
    if (error) {
        const count = Number(error.details) || 0;
        if (error.message === "property_has_leases") {
            return { error: { status: 409, message: `Este imóvel tem ${count === 1 ? "1 contrato" : `${count} contratos`} em Contratos. Exclua ${count === 1 ? "o contrato" : "os contratos"} antes de excluir o imóvel — nada foi apagado.` } };
        }
        if (error.message === "property_has_invoices") {
            return { error: { status: 409, message: `Este imóvel tem ${count === 1 ? "1 fatura emitida" : `${count} faturas emitidas`}: faturas são registros financeiros e o imóvel não pode ser excluído — nada foi apagado.` } };
        }
        if (error.code === "23503") {
            return { error: { status: 409, message: "Um inquilino deste imóvel está em contrato de outro imóvel. Ajuste esse contrato antes de excluir — nada foi apagado." } };
        }
        if (error.code === "P0002" || error.message === "property_not_found") {
            return { error: { status: 404, message: "Imóvel não encontrado." } };
        }
        if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) {
            return { error: { status: 503, message: "A exclusão de imóveis está sendo atualizada. Tente de novo em alguns minutos — nada foi apagado." } };
        }
        console.error(`[${tag}] delete_property_cascade failed:`, error.message);
        return { error: { status: 500, message: "Não foi possível excluir o imóvel — nada foi apagado." } };
    }

    try {
        const { data: files } = await supabase.storage.from(ENERGY_BILLS_BUCKET).list(propertyId);
        if (files && files.length > 0) {
            await supabase.storage.from(ENERGY_BILLS_BUCKET).remove(files.map((f) => `${propertyId}/${f.name}`));
        }
    } catch (storageErr) {
        console.warn(`[${tag}] Storage cleanup warning:`, storageErr);
    }
    try {
        await removeWaterFiles(supabase, propertyId);
    } catch (storageErr) {
        console.warn(`[${tag}] Water storage cleanup warning:`, storageErr);
    }
    return { error: null };
}
