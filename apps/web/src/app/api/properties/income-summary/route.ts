import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { breakdown, currentMonthKey, monthKey, type PropertyIncomeRow } from "@/lib/property-income";
import { landlordIptuForMonth, normalizeInstallments, type PropertyTax } from "@/lib/property-taxes";

export const dynamic = "force-dynamic";

export interface PropertyIncomeSnapshot {
    /** `YYYY-MM` of the latest confirmed month */
    month: string;
    grossRent: number;
    received: number;
    /** gross rent + energy income */
    revenue: number;
    /** agency fee + energy cost + other expenses + landlord IPTU paid that month */
    opex: number;
    noi: number;
    /** noi ÷ revenue, in % */
    margin: number;
    confirmedMonths: number;
}

/**
 * GET /api/properties/income-summary
 * → { summaries: { [propertyId]: PropertyIncomeSnapshot } }
 *
 * One call for the whole portfolio: the latest confirmed ledger month per
 * property the signed-in user owns (months after the current one are
 * ignored). Used by the property cards on /imoveis.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { data, error } = await supabase
        .from("property_income_months")
        .select("property_id, month, received_amount, energy_portion, other_income, other_expenses, iptu_amount, agency_fee_pct, status")
        .eq("owner_id", profileId)
        .eq("status", "CONFIRMED")
        .lte("month", `${currentMonthKey()}-01`)
        .order("month", { ascending: false });

    if (error) {
        console.error("[Income summary]", error.message);
        return NextResponse.json({ error: "Erro ao carregar receitas" }, { status: 500 });
    }
    // landlord-paid IPTU (taxes register) is a cost of the month it was paid
    const { data: taxData } = await supabase.from("property_taxes").select("property_id, year, kind, amount, paid_by, paid_on, installments").eq("owner_id", profileId).eq("kind", "IPTU");
    const taxesByProperty = new Map<string, PropertyTax[]>();
    for (const t of (taxData ?? []) as unknown as PropertyTax[]) {
        taxesByProperty.set(t.property_id, [...(taxesByProperty.get(t.property_id) ?? []), { ...t, amount: Number(t.amount) || 0, installments: normalizeInstallments(t.installments) }]);
    }

    const summaries: Record<string, PropertyIncomeSnapshot> = {};
    for (const raw of (data ?? []) as unknown as Array<Pick<PropertyIncomeRow, "property_id" | "month" | "received_amount" | "energy_portion" | "other_income" | "other_expenses" | "iptu_amount" | "agency_fee_pct">>) {
        const existing = summaries[raw.property_id];
        if (existing) {
            existing.confirmedMonths += 1;
            continue;
        }
        const b = breakdown(raw);   // rows arrive newest first, so the first one per property is the latest
        const iptu = landlordIptuForMonth(taxesByProperty.get(raw.property_id) ?? [], monthKey(raw.month));
        const opex = Math.round((b.opex + iptu) * 100) / 100;
        const noi = Math.round((b.noi - iptu) * 100) / 100;
        summaries[raw.property_id] = {
            month: monthKey(raw.month),
            grossRent: b.grossRent,
            received: b.received,
            revenue: b.revenue,
            opex,
            noi,
            margin: b.revenue > 0 ? Math.round((noi / b.revenue) * 1000) / 10 : 0,
            confirmedMonths: 1,
        };
    }

    return NextResponse.json({ summaries });
}
