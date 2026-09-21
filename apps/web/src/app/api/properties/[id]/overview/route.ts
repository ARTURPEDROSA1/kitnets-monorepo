import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty } from "@/lib/api-auth";
import type { PropertyIncomeRow } from "@/lib/property-income";
import type { PropertyInvestment, PropertyTransaction } from "@/lib/property-investment";
import { loadTaxRows } from "@/lib/property-taxes-server";
import { loadValuations } from "@/lib/property-valuations-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const INCOME_COLUMNS = "id, property_id, month, unit_id, unit_name, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, iptu_amount, agency_fee_pct, status, source, bank_reference, notes, created_at, updated_at";
const TX_COLUMNS = "id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference, created_at, updated_at";
const INV_COLUMNS = "property_id, purchase_price, acquired_on, built_area_m2, lender, contract_number, financing_system, principal, annual_rate, term_months, contract_date, first_due_date, financing_status, paid_off_on, notes, created_at, updated_at";

const num = (v: unknown) => Number(v) || 0;
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * GET /api/properties/[id]/overview
 * → { income, investment, transactions, taxes, valuations }
 *
 * Everything the property page needs in one request: one auth + ownership
 * check and the five ledgers loaded in parallel, instead of five separate
 * functions each doing its own cold start and auth round trips. The
 * per-ledger routes stay for edits and for the sections used on their own.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    try {
        const [income, inv, txs, taxes, valuations] = await Promise.all([
            supabase.from("property_income_months").select(INCOME_COLUMNS).eq("property_id", id).order("month", { ascending: false }),
            supabase.from("property_investments").select(INV_COLUMNS).eq("property_id", id).maybeSingle(),
            supabase.from("property_transactions").select(TX_COLUMNS).eq("property_id", id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
            loadTaxRows(supabase, id),
            loadValuations(supabase, id),
        ]);
        if (income.error) throw new Error(income.error.message);
        if (inv.error) throw new Error(inv.error.message);
        if (txs.error) throw new Error(txs.error.message);

        const incomeRows = ((income.data ?? []) as unknown as PropertyIncomeRow[]).map(r => ({
            ...r, received_amount: num(r.received_amount), energy_portion: num(r.energy_portion), other_income: num(r.other_income),
            other_expenses: num(r.other_expenses), iptu_amount: num(r.iptu_amount), agency_fee_pct: num(r.agency_fee_pct),
        }));
        const investment = inv.data ? { ...(inv.data as unknown as PropertyInvestment), purchase_price: num((inv.data as { purchase_price: unknown }).purchase_price), principal: numOrNull((inv.data as { principal: unknown }).principal) } : null;
        const transactions = ((txs.data ?? []) as unknown as PropertyTransaction[]).map(t => ({
            ...t, amount: num(t.amount), interest_part: numOrNull(t.interest_part), principal_part: numOrNull(t.principal_part), insurance_part: numOrNull(t.insurance_part),
        }));
        return NextResponse.json({ income: incomeRows, investment, transactions, taxes, valuations }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
        console.error("[Property overview]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o imóvel" }, { status: 500 });
    }
}
