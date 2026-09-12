import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Water bills for a property the signed-in user owns.
 *
 * Replaces the anon-callable SECURITY DEFINER RPCs `get_property_details`,
 * `get_property_bills`, `get_latest_billing_rate` and `upsert_water_bill`,
 * which had no ownership check.
 */

const PROPERTY_COLUMNS = "id, name, address, city, state, zip, connection_code";

/**
 * GET /api/water-bills?propertyId=<uuid>
 * → { property, bills }   (bills sorted newest reference_month first)
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    if (!propertyId) {
        return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
    }

    const property = await getOwnedProperty(supabase, profileId, propertyId, PROPERTY_COLUMNS);
    if (!property) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    const { data: bills, error } = await supabase
        .from("water_bills")
        .select("*")
        .eq("property_id", propertyId)
        .order("reference_month", { ascending: false });

    if (error) {
        console.error("[Water Bills GET] Error:", error.message);
        return NextResponse.json({ error: "Erro ao carregar contas" }, { status: 500 });
    }

    return NextResponse.json({ property, bills: bills ?? [] });
}

interface WaterBillInput {
    referenceMonth: string;
    meterNumber?: string | null;
    previousReading?: number | null;
    currentReading?: number | null;
    consumptionM3: number;
    billedConsumptionM3?: number | null;
    readingDate?: string | null;
    readingDateOrig?: string | null;
    dueDate?: string | null;
    totalAmount: number;
    waterTariff?: number | null;
    sewageTariff?: number | null;
    waterBasicFee?: number | null;
    sewageBasicFee?: number | null;
    occurrenceCode?: string | null;
    averageConsumptionM3?: number | null;
    notes?: string | null;
}

const REFERENCE_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function num(value: unknown, fallback: number | null = null): number | null {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function dateOrNull(value: unknown): string | null {
    return typeof value === "string" && ISO_DATE_REGEX.test(value) ? value : null;
}

function text(value: unknown, max = 500): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/**
 * POST /api/water-bills
 * body: { propertyId: uuid, bill: WaterBillInput }
 * Upserts on (property_id, reference_month). → { id }
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    let body: { propertyId?: string; bill?: WaterBillInput };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const { propertyId, bill } = body;
    if (!propertyId || !bill) {
        return NextResponse.json({ error: "propertyId e bill são obrigatórios" }, { status: 400 });
    }
    if (!REFERENCE_MONTH_REGEX.test(bill.referenceMonth ?? "")) {
        return NextResponse.json({ error: "Mês de referência inválido (use AAAA-MM)" }, { status: 400 });
    }
    const consumption = num(bill.consumptionM3);
    const total = num(bill.totalAmount);
    if (consumption === null || consumption <= 0) {
        return NextResponse.json({ error: "Consumo deve ser maior que zero" }, { status: 400 });
    }
    if (total === null || total <= 0) {
        return NextResponse.json({ error: "Valor total deve ser maior que zero" }, { status: 400 });
    }

    const property = await getOwnedProperty(supabase, profileId, propertyId);
    if (!property) {
        return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    const payload = {
        property_id: propertyId,
        reference_month: bill.referenceMonth,
        meter_number: text(bill.meterNumber, 50),
        previous_reading: num(bill.previousReading),
        current_reading: num(bill.currentReading),
        consumption_m3: consumption,
        billed_consumption_m3: num(bill.billedConsumptionM3, consumption),
        reading_date: dateOrNull(bill.readingDate),
        reading_date_orig: dateOrNull(bill.readingDateOrig),
        due_date: dateOrNull(bill.dueDate),
        water_tariff: num(bill.waterTariff, 0),
        sewage_tariff: num(bill.sewageTariff, 0),
        water_basic_fee: num(bill.waterBasicFee, 0),
        sewage_basic_fee: num(bill.sewageBasicFee, 0),
        total_amount: total,
        occurrence_code: text(bill.occurrenceCode, 50),
        average_consumption_m3: num(bill.averageConsumptionM3),
        notes: text(bill.notes, 2000),
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from("water_bills")
        .upsert(payload, { onConflict: "property_id,reference_month" })
        .select("id")
        .single();

    if (error) {
        console.error("[Water Bills POST] Error:", error.message);
        return NextResponse.json({ error: "Erro ao salvar conta" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
}
