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

// Convert "AGO/26" to "2026-08"
function parseMonthLabelToIso(label: string): string | null {
    if (!label) return null;
    const clean = label.trim().toUpperCase();
    // If already YYYY-MM
    if (/^\d{4}-\d{2}$/.test(clean)) return clean;

    const monthsMap: Record<string, string> = {
        JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
        JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12"
    };

    const match = clean.match(/([A-Z]{3})\/(\d{2,4})/);
    if (!match) return null;

    const monthNum = monthsMap[match[1]];
    if (!monthNum) return null;

    let year = match[2];
    if (year.length === 2) year = `20${year}`;

    return `${year}-${monthNum}`;
}

/**
 * GET /api/energy-bills?propertyId=xxx
 */
export async function GET(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get("propertyId");

        if (!propertyId) {
            return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 1. Fetch bills for property
        const { data: bills, error } = await supabase
            .from("energy_bills")
            .select("*")
            .eq("property_id", propertyId)
            .order("reference_month", { ascending: false });

        if (error) {
            console.error("[Energy Bills GET] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, bills: bills || [] });
    } catch (err) {
        console.error("[Energy Bills GET] Critical error:", err);
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
    }
}

/**
 * POST /api/energy-bills
 * Upserts a full energy bill and batch-seeds historical baseline records from the 13-month table
 */
export async function POST(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await request.json();
        const { propertyId, billData, historicalConsumption } = body;

        if (!propertyId) {
            return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
        }

        if (!billData || !billData.referenceMonth) {
            return NextResponse.json({ error: "Dados da fatura incompletos (mês de referência ausente)" }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 1. Prepare main bill payload
        const mainBillPayload = {
            property_id: propertyId,
            utility_company: billData.utilityCompany || "CEMIG",
            consumer_unit: billData.consumerUnit || "Não informado",
            installation_class: billData.installationClass || null,
            tariff_modality: billData.tariffModality || null,
            reference_month: billData.referenceMonth,
            reference_month_label: billData.referenceMonthLabel || null,
            reading_date_current: billData.readingDateCurrent || null,
            reading_date_previous: billData.readingDatePrevious || null,
            reading_date_next: billData.readingDateNext || null,
            billing_days: Number(billData.billingDays) || 30,
            due_date: billData.dueDate || null,
            meter_number: billData.meterNumber || null,
            grid_reading_previous: billData.gridReadingPrevious != null ? Number(billData.gridReadingPrevious) : null,
            grid_reading_current: billData.gridReadingCurrent != null ? Number(billData.gridReadingCurrent) : null,
            grid_consumption_kwh: Number(billData.gridConsumptionKwh) || 0,
            daily_avg_kwh: billData.dailyAvgKwh != null ? Number(billData.dailyAvgKwh) : null,
            monthly_avg_kwh: billData.monthlyAvgKwh != null ? Number(billData.monthlyAvgKwh) : null,
            injected_reading_previous: billData.injectedReadingPrevious != null ? Number(billData.injectedReadingPrevious) : null,
            injected_reading_current: billData.injectedReadingCurrent != null ? Number(billData.injectedReadingCurrent) : null,
            solar_injected_kwh: Number(billData.solarInjectedKwh) || 0,
            solar_compensated_kwh: Number(billData.solarCompensatedKwh) || 0,
            generation_balance_kwh: Number(billData.generationBalanceKwh) || 0,
            unit_price: billData.unitPrice != null ? Number(billData.unitPrice) : null,
            availability_cost_kwh: billData.availabilityCostKwh != null ? Number(billData.availabilityCostKwh) : 100,
            availability_cost_amount: billData.availabilityCostAmount != null ? Number(billData.availabilityCostAmount) : 0,
            energy_scee_exempt_amount: billData.energySceeExemptAmount != null ? Number(billData.energySceeExemptAmount) : 0,
            energy_compensated_amount: billData.energyCompensatedAmount != null ? Number(billData.energyCompensatedAmount) : 0,
            availability_adjustment_amount: billData.availabilityAdjustmentAmount != null ? Number(billData.availabilityAdjustmentAmount) : 0,
            bonus_discounts_amount: billData.bonusDiscountsAmount != null ? Number(billData.bonusDiscountsAmount) : 0,
            flag_type: billData.flagType || "Verde",
            flag_amount: billData.flagAmount != null ? Number(billData.flagAmount) : 0,
            taxes_icms: billData.taxesIcms != null ? Number(billData.taxesIcms) : 0,
            taxes_pis_cofins: billData.taxesPisCofins != null ? Number(billData.taxesPisCofins) : 0,
            total_amount: Number(billData.totalAmount) || 0,
            is_historical_only: false,
            historical_consumption_raw: historicalConsumption || [],
            notes: billData.notes || null,
            updated_at: new Date().toISOString(),
        };

        // 2. Upsert the main bill
        const { data: savedBill, error: mainError } = await supabase
            .from("energy_bills")
            .upsert(mainBillPayload, { onConflict: "property_id,reference_month" })
            .select()
            .single();

        if (mainError) {
            console.error("[Energy Bills POST] Error saving main bill:", mainError);
            return NextResponse.json({ error: mainError.message }, { status: 500 });
        }

        // 3. Batch-seed historical baseline rows from 13-month table if provided
        if (Array.isArray(historicalConsumption) && historicalConsumption.length > 0) {
            const historicalRows = [];

            for (const item of historicalConsumption) {
                const isoMonth = parseMonthLabelToIso(item.month);
                // Don't overwrite the main bill we just inserted
                if (!isoMonth || isoMonth === billData.referenceMonth) continue;

                historicalRows.push({
                    property_id: propertyId,
                    consumer_unit: billData.consumerUnit || "Não informado",
                    utility_company: billData.utilityCompany || "CEMIG",
                    reference_month: isoMonth,
                    reference_month_label: item.month,
                    grid_consumption_kwh: Number(item.consumptionKwh) || 0,
                    daily_avg_kwh: item.dailyAvgKwh != null ? Number(item.dailyAvgKwh) : null,
                    billing_days: Number(item.days) || 30,
                    is_historical_only: true,
                    total_amount: 0,
                });
            }

            if (historicalRows.length > 0) {
                // Fetch existing bills for these months so we don't downgrade full bills to historical
                const isoMonths = historicalRows.map((r) => r.reference_month);
                const { data: existing } = await supabase
                    .from("energy_bills")
                    .select("reference_month, is_historical_only")
                    .eq("property_id", propertyId)
                    .in("reference_month", isoMonths);

                const fullBillMonths = new Set(
                    (existing || [])
                        .filter((e) => e.is_historical_only === false)
                        .map((e) => e.reference_month)
                );

                const rowsToInsert = historicalRows.filter((r) => !fullBillMonths.has(r.reference_month));

                if (rowsToInsert.length > 0) {
                    await supabase
                        .from("energy_bills")
                        .upsert(rowsToInsert, { onConflict: "property_id,reference_month" });
                }
            }
        }

        return NextResponse.json({ success: true, bill: savedBill });
    } catch (err) {
        console.error("[Energy Bills POST] Critical error:", err);
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
    }
}

/**
 * DELETE /api/energy-bills?id=xxx
 */
export async function DELETE(request: Request) {
    try {
        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        const { error } = await supabase
            .from("energy_bills")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("[Energy Bills DELETE] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Energy Bills DELETE] Critical error:", err);
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
    }
}
