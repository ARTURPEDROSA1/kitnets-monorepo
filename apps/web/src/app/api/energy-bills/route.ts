import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase service credentials");
    return createClient(url, key);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a propertyId input (which might be a valid UUID, or "primary", or legacy alias)
 * to a verified UUID in public.properties. Auto-creates property record if needed.
 */
async function resolvePropertyUuid(
    supabase: ReturnType<typeof getServiceSupabase>,
    clerkUserId: string,
    inputId: string
): Promise<string> {
    if (inputId && UUID_REGEX.test(inputId)) {
        const { data: existing } = await supabase
            .from("properties")
            .select("id")
            .eq("id", inputId)
            .maybeSingle();

        if (existing?.id) {
            return existing.id;
        }
    }

    // 1. Find user's profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, property_address, property_details, additional_properties")
        .eq("clerk_id", clerkUserId)
        .maybeSingle();

    if (!profile) {
        throw new Error("Perfil de usuário não encontrado");
    }

    // Fetch all existing properties for this owner
    const { data: allOwnerProps } = await supabase
        .from("properties")
        .select("id, name, address, electronic_id, created_at")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: true });

    const existingProps = allOwnerProps || [];

    // Filter non-standalone rental properties (standalone UCs have isStandaloneUc: true)
    const rentalProps = existingProps.filter((p) => {
        if (!p.electronic_id) return true;
        try {
            const parsed = JSON.parse(p.electronic_id);
            return !parsed.isStandaloneUc;
        } catch {
            return true;
        }
    });

    const addr = profile.property_address as Record<string, string> | null;
    const details = profile.property_details as Record<string, string> | null;
    const primaryName = details?.propertyName?.trim() || (addr?.street ? `${addr.street}, ${addr.number || ""}`.trim() : (profile.full_name ? `Imóvel de ${profile.full_name}` : "Meu Imóvel"));

    // Check if inputId is an index like "prop-0", "0", "prop-1", "1"
    const matchIndex = inputId?.match(/^(?:prop-)?(\d+)$/);
    if (matchIndex) {
        const idx = parseInt(matchIndex[1], 10);
        if (idx === 0) {
            // Target is primary rental property
            const match = rentalProps.find(p => p.name.trim().toLowerCase() === primaryName.trim().toLowerCase()) || rentalProps[0];
            if (match) return match.id;
        } else if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
            const ap = profile.additional_properties[idx - 1];
            if (ap) {
                const apDetails = ap.details as Record<string, any> | null;
                const apAddr = ap.address as Record<string, any> | null;
                const apName = apDetails?.propertyName?.trim() || (apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""}`.trim() : `Imóvel ${idx + 1}`);
                const matchAp = rentalProps.find(p => p.name.trim().toLowerCase() === apName.trim().toLowerCase());
                if (matchAp) return matchAp.id;

                const { data: newAp } = await supabase
                    .from("properties")
                    .insert({
                        owner_id: profile.id,
                        name: apName,
                        address: apAddr?.street ? `${apAddr.street}, ${apAddr.number || ""} - ${apAddr.neighborhood || ""}`.trim() : null,
                        city: apAddr?.city || null,
                        state: apAddr?.state || null,
                        zip: apAddr?.cep || null,
                    })
                    .select("id")
                    .single();

                if (newAp?.id) return newAp.id;
            }
        }
    }

    // 2. Check if a non-standalone rental property already exists matching primary
    const matchPrimary = rentalProps.find(p => p.name.trim().toLowerCase() === primaryName.trim().toLowerCase()) || rentalProps[0];
    if (matchPrimary?.id) {
        return matchPrimary.id;
    }

    // 3. Auto-create primary rental property in public.properties from profile
    const { data: newProp, error: propError } = await supabase
        .from("properties")
        .insert({
            owner_id: profile.id,
            name: primaryName,
            address: addr?.street ? `${addr.street}, ${addr.number || ""} - ${addr.neighborhood || ""}`.trim() : null,
            city: addr?.city || null,
            state: addr?.state || null,
            zip: addr?.cep || null,
        })
        .select("id")
        .single();

    if (propError || !newProp?.id) {
        console.error("[resolvePropertyUuid] Error creating property:", propError);
        if (existingProps.length > 0) {
            return existingProps[0].id;
        }
        throw new Error("Não foi possível identificar nem criar o imóvel vinculado.");
    }

    return newProp.id;
}

// Convert "AGO/26" to "2026-08"
function parseMonthLabelToIso(label: string): string | null {
    if (!label) return null;
    const clean = label.trim().toUpperCase();
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
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get("propertyId");

        if (!propertyId) {
            return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        const resolvedPropertyId = await resolvePropertyUuid(supabase, userId, propertyId);

        // Fetch bills for property
        const { data: bills, error } = await supabase
            .from("energy_bills")
            .select("*")
            .eq("property_id", resolvedPropertyId)
            .order("reference_month", { ascending: false });

        if (error) {
            console.error("[Energy Bills GET] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Check files in Supabase Storage for this property
        const fileMap = new Map<string, string>();
        try {
            const { data: files } = await supabase.storage
                .from("energy-bills")
                .list(resolvedPropertyId, { limit: 100 });

            if (files && Array.isArray(files)) {
                for (const f of files) {
                    const { data: pUrl } = supabase.storage
                        .from("energy-bills")
                        .getPublicUrl(`${resolvedPropertyId}/${f.name}`);
                    if (pUrl?.publicUrl) {
                        const baseName = f.name.replace(/\.[^/.]+$/, "");
                        const urlWithTimestamp = `${pUrl.publicUrl}?t=${new Date(f.updated_at || Date.now()).getTime()}`;
                        fileMap.set(baseName, urlWithTimestamp);
                    }
                }
            }
        } catch (storageErr) {
            console.warn("[Energy Bills GET] Storage list warning:", storageErr);
        }

        // Determine which bill is the latest (sorted DESC, first non-historical)
        const sortedBills = bills || [];
        const latestFullBillRef = sortedBills.find((b: any) => !b.is_historical_only) || sortedBills[0] || null;
        const currentBillStorageUrl = fileMap.get("current_bill") || null;

        // Map bills with their respective pdf_url from storage
        // If the latest bill has no month-specific PDF, assign current_bill.pdf to it
        // (current_bill.pdf is always the most recently uploaded PDF)
        const mappedBills = sortedBills.map((b: any) => {
            const matchedStorageUrl = fileMap.get(b.reference_month);
            let resolvedPdfUrl = matchedStorageUrl || null;

            // For the latest bill: if no month-specific file, use current_bill.pdf
            if (!resolvedPdfUrl && latestFullBillRef && b.reference_month === latestFullBillRef.reference_month) {
                resolvedPdfUrl = currentBillStorageUrl;
            }

            return {
                ...b,
                pdf_url: resolvedPdfUrl,
            };
        });

        // currentPdfUrl = the latest bill's resolved PDF
        const latestMapped = mappedBills.find((b: any) => !b.is_historical_only) || mappedBills[0] || null;
        const currentPdfUrl = latestMapped?.pdf_url || currentBillStorageUrl || null;

        return NextResponse.json({
            success: true,
            bills: mappedBills,
            propertyId: resolvedPropertyId,
            currentPdfUrl,
        });
    } catch (err) {
        console.error("[Energy Bills GET] Critical error:", err);
        const message = err instanceof Error ? err.message : "Erro interno do servidor";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/energy-bills
 * Upserts a full energy bill, replaces single current PDF bill in storage, and batch-seeds historical baseline records
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const contentType = request.headers.get("content-type") || "";
        let propertyId: string;
        let billData: any;
        let historicalConsumption: any;
        let uploadedFile: File | null = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            propertyId = formData.get("propertyId") as string;
            const billDataRaw = formData.get("billData") as string;
            billData = billDataRaw ? JSON.parse(billDataRaw) : null;
            const histRaw = formData.get("historicalConsumption") as string;
            historicalConsumption = histRaw ? JSON.parse(histRaw) : [];
            uploadedFile = formData.get("file") as File | null;
        } else {
            const body = await request.json();
            propertyId = body.propertyId;
            billData = body.billData;
            historicalConsumption = body.historicalConsumption;
        }

        if (!propertyId) {
            return NextResponse.json({ error: "propertyId é obrigatório" }, { status: 400 });
        }

        if (!billData || !billData.referenceMonth) {
            return NextResponse.json({ error: "Dados da fatura incompletos (mês de referência ausente)" }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        const resolvedPropertyId = await resolvePropertyUuid(supabase, userId, propertyId);

        // Upload PDF in Supabase Storage with month reference, preserving historical files
        let pdfUrl: string | null = null;
        if (uploadedFile && uploadedFile.size > 0) {
            try {
                const bucketName = "energy-bills";
                const { data: buckets } = await supabase.storage.listBuckets();
                if (!buckets?.some((b: any) => b.name === bucketName)) {
                    await supabase.storage.createBucket(bucketName, { public: true });
                }

                const fileExt = uploadedFile.name.split(".").pop()?.toLowerCase() || "pdf";
                const monthFilePath = `${resolvedPropertyId}/${billData.referenceMonth}.${fileExt}`;
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // 1. Always save under reference month (e.g. 2026-08.pdf)
                const { error: uploadError } = await supabase.storage
                    .from(bucketName)
                    .upload(monthFilePath, buffer, {
                        contentType: uploadedFile.type || "application/pdf",
                        upsert: true,
                    });

                if (uploadError) {
                    console.error("[Energy Bills Storage] Upload error for month file:", uploadError);
                } else {
                    const { data: publicUrlData } = supabase.storage
                        .from(bucketName)
                        .getPublicUrl(monthFilePath);
                    if (publicUrlData?.publicUrl) {
                        pdfUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
                    }
                }

                // 2. Check if this uploaded bill is newer than or equal to existing bills for this property
                const { data: latestExistingBill } = await supabase
                    .from("energy_bills")
                    .select("reference_month")
                    .eq("property_id", resolvedPropertyId)
                    .order("reference_month", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const isLatestOrNewer = !latestExistingBill || billData.referenceMonth >= latestExistingBill.reference_month;

                // 3. Only update current_bill.pdf if this uploaded bill is the latest
                if (isLatestOrNewer) {
                    const currentFilePath = `${resolvedPropertyId}/current_bill.${fileExt}`;
                    await supabase.storage
                        .from(bucketName)
                        .upload(currentFilePath, buffer, {
                            contentType: uploadedFile.type || "application/pdf",
                            upsert: true,
                        });
                }
            } catch (storageErr) {
                console.error("[Energy Bills Storage] Exception during file upload:", storageErr);
            }
        }

        // 1. Prepare main bill payload
        const mainBillPayload: Record<string, any> = {
            property_id: resolvedPropertyId,
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

        // Note: pdf_url is NOT a DB column — PDFs are resolved from Supabase Storage at read time

        // 2. Upsert the main bill
        let { data: savedBill, error: mainError } = await supabase
            .from("energy_bills")
            .upsert(mainBillPayload, { onConflict: "property_id,reference_month" })
            .select()
            .single();

        // Graceful fallback if pdf_url column hasn't been migrated yet
        if (mainError && mainError.message?.includes("pdf_url")) {
            console.warn("[Energy Bills POST] Column pdf_url not found in DB table, continuing without column:", mainError.message);
            delete mainBillPayload.pdf_url;
            const retryRes = await supabase
                .from("energy_bills")
                .upsert(mainBillPayload, { onConflict: "property_id,reference_month" })
                .select()
                .single();
            savedBill = retryRes.data;
            mainError = retryRes.error;
        }

        if (mainError) {
            console.error("[Energy Bills POST] Error saving main bill:", mainError);
            return NextResponse.json({ error: mainError.message }, { status: 500 });
        }

        // 2.1 Automatically update property address if extracted and property has no address or is standalone UC
        if (billData.installationAddress || billData.installationCity) {
            try {
                const { data: propRow } = await supabase
                    .from("properties")
                    .select("id, address, city, state, zip, electronic_id")
                    .eq("id", resolvedPropertyId)
                    .maybeSingle();

                let isStandalone = false;
                if (propRow?.electronic_id) {
                    try {
                        const parsed = JSON.parse(propRow.electronic_id);
                        if (parsed.isStandaloneUc) isStandalone = true;
                    } catch {}
                }

                if (!propRow?.address || isStandalone) {
                    const propUpdates: Record<string, any> = {};
                    if (billData.installationAddress) propUpdates.address = billData.installationAddress.trim();
                    if (billData.installationCity) propUpdates.city = billData.installationCity.trim();
                    if (billData.installationState) propUpdates.state = billData.installationState.trim();
                    if (billData.installationZip) propUpdates.zip = billData.installationZip.trim();

                    if (Object.keys(propUpdates).length > 0) {
                        await supabase
                            .from("properties")
                            .update(propUpdates)
                            .eq("id", resolvedPropertyId);
                        console.log(`[Energy Bills POST] Updated property ${resolvedPropertyId} address:`, propUpdates);
                    }
                }
            } catch (addrErr) {
                console.warn("[Energy Bills POST] Warning updating property address:", addrErr);
            }
        }

        // 3. Batch-seed historical baseline rows from 13-month table if provided
        if (Array.isArray(historicalConsumption) && historicalConsumption.length > 0) {
            const historicalRows = [];

            for (const item of historicalConsumption) {
                const isoMonth = parseMonthLabelToIso(item.month);
                // Don't overwrite the main bill we just inserted
                if (!isoMonth || isoMonth === billData.referenceMonth) continue;

                historicalRows.push({
                    property_id: resolvedPropertyId,
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
                    .eq("property_id", resolvedPropertyId)
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

        return NextResponse.json({ success: true, bill: savedBill, propertyId: resolvedPropertyId });
    } catch (err) {
        console.error("[Energy Bills POST] Critical error:", err);
        const message = err instanceof Error ? err.message : "Erro interno do servidor";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PUT /api/energy-bills
 * Updates an existing energy bill by id
 */
export async function PUT(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await request.json();
        const { id, billData } = body;

        if (!id) {
            return NextResponse.json({ error: "ID da fatura é obrigatório" }, { status: 400 });
        }
        if (!billData) {
            return NextResponse.json({ error: "Dados da fatura são obrigatórios" }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 1. Fetch user profile
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("clerk_id", userId)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json({ error: "Perfil de usuário não encontrado" }, { status: 403 });
        }

        // 2. Fetch the existing bill and its property
        const { data: existingBill, error: fetchErr } = await supabase
            .from("energy_bills")
            .select("id, property_id, properties(owner_id)")
            .eq("id", id)
            .maybeSingle();

        if (fetchErr || !existingBill) {
            return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
        }

        const prop = existingBill.properties as any;
        if (prop && prop.owner_id && prop.owner_id !== profile.id) {
            return NextResponse.json({ error: "Acesso não autorizado a esta fatura" }, { status: 403 });
        }

        // 3. Prepare payload
        const gridConsumption = billData.grid_consumption_kwh != null ? Number(billData.grid_consumption_kwh) : undefined;
        const billingDays = billData.billing_days != null ? Number(billData.billing_days) : undefined;

        let dailyAvg = billData.daily_avg_kwh != null ? Number(billData.daily_avg_kwh) : undefined;
        if ((dailyAvg == null || dailyAvg === 0) && gridConsumption != null && billingDays && billingDays > 0) {
            dailyAvg = Math.round((gridConsumption / billingDays) * 100) / 100;
        }

        const updatePayload: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (billData.reference_month !== undefined) updatePayload.reference_month = billData.reference_month;
        if (billData.reference_month_label !== undefined) updatePayload.reference_month_label = billData.reference_month_label;
        if (billData.due_date !== undefined) updatePayload.due_date = billData.due_date || null;
        if (billingDays !== undefined) updatePayload.billing_days = billingDays;
        if (gridConsumption !== undefined) updatePayload.grid_consumption_kwh = gridConsumption;
        if (dailyAvg !== undefined) updatePayload.daily_avg_kwh = dailyAvg;
        if (billData.solar_injected_kwh !== undefined) updatePayload.solar_injected_kwh = Number(billData.solar_injected_kwh) || 0;
        if (billData.solar_compensated_kwh !== undefined) updatePayload.solar_compensated_kwh = Number(billData.solar_compensated_kwh) || 0;
        if (billData.generation_balance_kwh !== undefined) updatePayload.generation_balance_kwh = Number(billData.generation_balance_kwh) || 0;
        if (billData.total_amount !== undefined) updatePayload.total_amount = Number(billData.total_amount) || 0;
        if (billData.availability_cost_amount !== undefined) updatePayload.availability_cost_amount = Number(billData.availability_cost_amount) || 0;
        if (billData.unit_price !== undefined) updatePayload.unit_price = billData.unit_price != null ? Number(billData.unit_price) : null;
        if (billData.consumer_unit !== undefined) updatePayload.consumer_unit = billData.consumer_unit;
        if (billData.utility_company !== undefined) updatePayload.utility_company = billData.utility_company;
        if (billData.installation_class !== undefined) updatePayload.installation_class = billData.installation_class;
        if (billData.notes !== undefined) updatePayload.notes = billData.notes;

        const { data: updated, error: updateErr } = await supabase
            .from("energy_bills")
            .update(updatePayload)
            .eq("id", id)
            .select()
            .single();

        if (updateErr) {
            console.error("[Energy Bills PUT] Error updating bill:", updateErr);
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        // Also update property address if passed in billData
        const addrToUpdate = billData.address || billData.installationAddress;
        if (addrToUpdate || billData.city || billData.installationCity) {
            try {
                const propUpdates: Record<string, any> = {};
                if (addrToUpdate) propUpdates.address = addrToUpdate.trim();
                if (billData.city || billData.installationCity) propUpdates.city = (billData.city || billData.installationCity).trim();
                if (billData.state || billData.installationState) propUpdates.state = (billData.state || billData.installationState).trim();
                if (billData.zip || billData.installationZip) propUpdates.zip = (billData.zip || billData.installationZip).trim();

                if (Object.keys(propUpdates).length > 0) {
                    await supabase
                        .from("properties")
                        .update(propUpdates)
                        .eq("id", existingBill.property_id);
                }
            } catch (propErr) {
                console.warn("[Energy Bills PUT] Warning updating property address:", propErr);
            }
        }

        return NextResponse.json({ success: true, bill: updated });
    } catch (err) {
        console.error("[Energy Bills PUT] Critical error:", err);
        const message = err instanceof Error ? err.message : "Erro interno do servidor";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/energy-bills?id=xxx
 */
export async function DELETE(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
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
