import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { computeInvestmentMetrics } from "@/lib/investment-metrics";
import type { PropertyIncomeRow } from "@/lib/property-income";
import type { PropertyInvestment, PropertyTransaction } from "@/lib/property-investment";
import { normalizeInstallments, type PropertyTax } from "@/lib/property-taxes";
import { latestValuation, type PropertyValuation } from "@/lib/property-valuations";
import { loadIpcaSeries } from "@/lib/property-valuations-server";

export const dynamic = "force-dynamic";

export interface PortfolioPropertyMetrics {
    invested: number;
    netIncomeToDate: number;
    paybackPct: number;
    paybackReachedOn: string | null;
    paybackForecastMonth: string | null;
    monthsToPayback: number | null;
    noi12m: number;
    grossYieldOnPrice: number | null;
    netYieldOnCost: number | null;
    marketValue: number | null;
    appreciationPct: number | null;
    equity: number | null;
    paybackPctReal: number | null;
    irrRealized: number | null;
    irrWithValue: number | null;
    incomeMonths: number;
    firstMonth: string | null;
}

export interface PortfolioTotals {
    /** properties with at least one investment transaction */
    count: number;
    invested: number;
    netIncomeToDate: number;
    noi12m: number;
    /** Σ net income ÷ Σ invested, % */
    paybackPct: number;
    /** Σ NOI 12m ÷ Σ invested, % */
    blendedYield: number | null;
    /** Σ market value over the properties that have one */
    marketValue: number | null;
    valuedCount: number;
    /** latest forecast month among the properties still paying back */
    lastForecastMonth: string | null;
}

/**
 * GET /api/portfolio/metrics → { properties: { [propertyId]: PortfolioPropertyMetrics }, totals }
 *
 * Runs the investment engine for every property the signed-in user owns, from
 * the same ledgers the property page uses. One round of queries for the whole
 * portfolio; used by the totals strip and the cards on /imoveis.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const [props, invs, txs, incomes, taxes, vals, ipca] = await Promise.all([
        supabase.from("properties").select("id").eq("owner_id", profileId),
        supabase.from("property_investments").select("property_id, purchase_price, acquired_on, built_area_m2, lender, contract_number, financing_system, principal, annual_rate, term_months, contract_date, first_due_date, financing_status, paid_off_on, notes").eq("owner_id", profileId),
        supabase.from("property_transactions").select("id, property_id, occurred_on, kind, amount, interest_part, principal_part, insurance_part, comment, source, bank_reference").eq("owner_id", profileId),
        supabase.from("property_income_months").select("id, property_id, month, unit_id, unit_name, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, iptu_amount, agency_fee_pct, status, source, bank_reference, notes").eq("owner_id", profileId),
        supabase.from("property_taxes").select("id, property_id, year, kind, amount, paid_by, paid_on, comment, installments").eq("owner_id", profileId),
        supabase.from("property_valuations").select("id, property_id, valued_on, amount, source, note, created_at").eq("owner_id", profileId),
        loadIpcaSeries(supabase).catch(() => []),
    ]);
    const failed = [props, invs, txs, incomes, taxes, vals].find(r => r.error);
    if (failed?.error) {
        console.error("[Portfolio metrics]", failed.error.message);
        return NextResponse.json({ error: "Erro ao carregar métricas do portfólio" }, { status: 500 });
    }

    const group = <T extends { property_id: string }>(rows: T[] | null) => {
        const m = new Map<string, T[]>();
        for (const r of rows ?? []) m.set(r.property_id, [...(m.get(r.property_id) ?? []), r]);
        return m;
    };
    const invByProp = new Map((invs.data ?? []).map(i => [i.property_id, i as unknown as PropertyInvestment]));
    const txByProp = group(txs.data as unknown as PropertyTransaction[] | null);
    const incByProp = group(incomes.data as unknown as PropertyIncomeRow[] | null);
    const taxByProp = group(taxes.data as unknown as PropertyTax[] | null);
    const valByProp = group(vals.data as unknown as PropertyValuation[] | null);

    const properties: Record<string, PortfolioPropertyMetrics> = {};
    const totals: PortfolioTotals = { count: 0, invested: 0, netIncomeToDate: 0, noi12m: 0, paybackPct: 0, blendedYield: null, marketValue: null, valuedCount: 0, lastForecastMonth: null };

    for (const p of props.data ?? []) {
        const transactions = (txByProp.get(p.id) ?? []).map(t => ({ ...t, amount: Number(t.amount) || 0, interest_part: t.interest_part === null ? null : Number(t.interest_part), principal_part: t.principal_part === null ? null : Number(t.principal_part), insurance_part: t.insurance_part === null ? null : Number(t.insurance_part) }));
        if (transactions.length === 0) continue;
        const inv = invByProp.get(p.id) ?? null;
        const incomeRows = (incByProp.get(p.id) ?? []).map(r => ({ ...r, received_amount: Number(r.received_amount) || 0, energy_portion: Number(r.energy_portion) || 0, other_income: Number(r.other_income) || 0, other_expenses: Number(r.other_expenses) || 0, iptu_amount: Number(r.iptu_amount) || 0, agency_fee_pct: Number(r.agency_fee_pct) || 0 }));
        const taxRows = (taxByProp.get(p.id) ?? []).map(t => ({ ...t, amount: Number(t.amount) || 0, installments: normalizeInstallments(t.installments) }));
        const latest = latestValuation((valByProp.get(p.id) ?? []).map(v => ({ ...v, amount: Number(v.amount) || 0 })));
        const m = computeInvestmentMetrics({
            investment: inv ? { ...inv, purchase_price: Number(inv.purchase_price) || 0, principal: inv.principal === null ? null : Number(inv.principal) } : null,
            transactions, incomeRows, taxes: taxRows, ipca,
            marketValue: latest ? { amount: latest.amount, valuedOn: latest.valued_on, source: latest.source } : null,
        });
        if (m.cashInvested <= 0) continue;
        properties[p.id] = {
            invested: m.cashInvested, netIncomeToDate: m.netIncomeToDate, paybackPct: m.paybackPct, paybackReachedOn: m.paybackReachedOn,
            paybackForecastMonth: m.paybackForecastMonth, monthsToPayback: m.monthsToPayback, noi12m: m.noi12m,
            grossYieldOnPrice: m.grossYieldOnPrice, netYieldOnCost: m.netYieldOnCost, marketValue: m.marketValue, appreciationPct: m.appreciationPct,
            equity: m.equity, paybackPctReal: m.paybackPctReal, irrRealized: m.irrRealized, irrWithValue: m.irrWithValue,
            incomeMonths: m.incomeMonths, firstMonth: m.firstMonth,
        };
        totals.count++;
        totals.invested += m.cashInvested;
        totals.netIncomeToDate += m.netIncomeToDate;
        totals.noi12m += m.noi12m;
        if (m.marketValue !== null) { totals.marketValue = (totals.marketValue ?? 0) + m.marketValue; totals.valuedCount++; }
        if (m.paybackForecastMonth && m.remaining > 0 && (!totals.lastForecastMonth || m.paybackForecastMonth > totals.lastForecastMonth)) totals.lastForecastMonth = m.paybackForecastMonth;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    totals.invested = r2(totals.invested);
    totals.netIncomeToDate = r2(totals.netIncomeToDate);
    totals.noi12m = r2(totals.noi12m);
    totals.paybackPct = totals.invested > 0 ? Math.round((totals.netIncomeToDate / totals.invested) * 1000) / 10 : 0;
    totals.blendedYield = totals.invested > 0 && totals.noi12m !== 0 ? Math.round((totals.noi12m / totals.invested) * 1000) / 10 : null;
    if (totals.marketValue !== null) totals.marketValue = r2(totals.marketValue);

    return NextResponse.json({ properties, totals });
}
