/**
 * Condomínio cost centre — pure helpers shared by the API route, the Condomínio page and the property page.
 *
 * A multi-unit property's landlord also runs its condominium. Its revenue is the condominium charged to
 * every unit (`condo_amount` in the income ledger, one row per month and unit; a vacant unit still owes it).
 * Its costs: energy, water and IPTU come from the registers where the bills are uploaded (the property's
 * energy bills, "Valor a pagar"; its water bills, "Valor"; the taxes register, IPTU paid by the landlord in
 * the month) so they are entered once; internet and maintenance are typed in `condominium_months`, one row
 * per property and month.
 * Result = revenue − costs.
 */
import { monthKey, type PropertyIncomeRow } from "./property-income";

export const CONDO_COST_KEYS = ["energy_cost", "internet_cost", "water_cost", "iptu_amount", "maintenance_cost"] as const;
export type CondoCostKey = (typeof CONDO_COST_KEYS)[number];
/** Costs read from another register (never typed in the condominium table). */
export const CONDO_AUTO_KEYS = ["energy_cost", "water_cost", "iptu_amount"] as const satisfies readonly CondoCostKey[];
export type CondoAutoKey = (typeof CONDO_AUTO_KEYS)[number];
export const isAutoCostKey = (k: string): k is CondoAutoKey => (CONDO_AUTO_KEYS as readonly string[]).includes(k);

/** Amounts per month (`YYYY-MM`) read from the energy bills, the water bills and the taxes register. */
export interface CondominiumAutoCosts {
    /** "Valor a pagar" of the property's energy bills, by reference month */
    energy?: Map<string, number>;
    /** "Valor" of the property's water bills, by reference month */
    water?: Map<string, number>;
    /** IPTU paid by the landlord, by the month it was paid (Tributos do imóvel) */
    iptu?: Map<string, number>;
}

export const CONDO_COST_LABELS: Record<CondoCostKey, string> = {
    energy_cost: "Energia",
    internet_cost: "Internet",
    water_cost: "Água",
    iptu_amount: "IPTU",
    maintenance_cost: "Manutenção",
};

/** Cost row as stored / returned by the API. `month` is ISO `YYYY-MM-DD` (first day). */
export interface CondominiumCostRow {
    id: string;
    property_id: string;
    month: string;
    energy_cost: number;
    internet_cost: number;
    water_cost: number;
    iptu_amount: number;
    maintenance_cost: number;
    notes: string | null;
    updated_at?: string;
}

/** Partial row sent to PUT: only the fields present are overwritten. `month` is `YYYY-MM`. */
export interface CondominiumCostInput extends Partial<Record<CondoCostKey, number>> {
    month: string;
    notes?: string | null;
}

/** One month of the condominium: the revenue from the income ledger and the costs from its own row. */
export interface CondominiumMonth extends Record<CondoCostKey, number> {
    /** `YYYY-MM` */
    month: string;
    /** condominium charged to the units in the month (before the agency's fee) */
    revenue: number;
    /** units that carry a condominium in the month */
    units: number;
    /** every unit's row of the month is still "previsto" (no revenue confirmed yet) */
    expected: boolean;
    totalCost: number;
    result: number;
    /** the month has a cost row (its costs were entered, even if all zero) */
    hasCosts: boolean;
    notes: string | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

export function condoTotalCost(row: Partial<Record<CondoCostKey, number>>): number {
    return r2(CONDO_COST_KEYS.reduce((acc, k) => acc + num(row[k]), 0));
}

/**
 * Months of the condominium, newest first: every month in which at least one unit has rental income or a
 * condominium in the income ledger, every month with a cost row, and every month with an energy bill or
 * IPTU. A month's revenue adds the `condo_amount` of all its unit rows (confirmed or expected: the
 * condominium is owed either way). Energy, water and IPTU always come from `auto`, never from the cost row.
 */
export function buildCondominiumMonths(incomeRows: PropertyIncomeRow[], costRows: CondominiumCostRow[], auto: CondominiumAutoCosts = {}): CondominiumMonth[] {
    const months = new Map<string, CondominiumMonth>();
    const blank = (m: string): CondominiumMonth => ({
        month: m, revenue: 0, units: 0, expected: false,
        energy_cost: 0, internet_cost: 0, water_cost: 0, iptu_amount: 0, maintenance_cost: 0,
        totalCost: 0, result: 0, hasCosts: false, notes: null,
    });
    const confirmed = new Set<string>(), withIncome = new Set<string>();
    for (const r of incomeRows) {
        const condo = num(r.condo_amount);
        if (condo <= 0 && num(r.received_amount) <= 0) continue;   // a vacant unit with no condominium adds nothing
        const m = monthKey(r.month);
        const cur = months.get(m) ?? blank(m);
        if (condo > 0) {
            cur.revenue = r2(cur.revenue + condo);
            cur.units++;
        }
        withIncome.add(m);
        if (r.status === "CONFIRMED") confirmed.add(m);
        months.set(m, cur);
    }
    for (const c of costRows) {
        const m = monthKey(c.month);
        const cur = months.get(m) ?? blank(m);
        for (const k of CONDO_COST_KEYS) if (!isAutoCostKey(k)) cur[k] = num(c[k]);
        cur.hasCosts = true;
        cur.notes = c.notes ?? null;
        months.set(m, cur);
    }
    for (const [key, source] of [["energy_cost", auto.energy], ["water_cost", auto.water], ["iptu_amount", auto.iptu]] as const) {
        for (const [m, amount] of source ?? []) {
            if (!(num(amount) > 0)) continue;
            const cur = months.get(m) ?? blank(m);
            cur[key] = r2(num(amount));
            months.set(m, cur);
        }
    }
    for (const cur of months.values()) {
        cur.expected = withIncome.has(cur.month) && !confirmed.has(cur.month);   // every unit of the month still 'previsto'
        cur.totalCost = condoTotalCost(cur);
        cur.result = r2(cur.revenue - cur.totalCost);
    }
    return [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** A condominium as the Condomínio page lists it: the record, its property and the card figures. */
export interface Condominium {
    id: string;
    property_id: string;
    name: string;
    notes: string | null;
    property_name: string;
    property_address: string;
    units: number;
    kpis: CondominiumKpis;
}

export interface CondominiumKpis {
    /** the newest month (revenue, costs, result), or null */
    latest: CondominiumMonth | null;
    months: number;
    monthsWithCosts: number;
    /** the calendar year the `ytd` figures cover */
    year: number;
    ytd: Pick<CondominiumSummary, "revenue" | "totalCost" | "result" | "marginPct" | "months">;
}

/** Figures of a condominium card: latest month and the current year to date. */
export function condominiumKpis(months: CondominiumMonth[], now = new Date()): CondominiumKpis {
    const year = now.getFullYear();
    const ytd = summarizeCondominium(months.filter(m => m.month.startsWith(`${year}-`)));
    const sorted = [...months].sort((a, b) => (a.month < b.month ? 1 : -1));
    return {
        latest: sorted[0] ?? null,
        months: months.length,
        monthsWithCosts: months.filter(m => m.hasCosts).length,
        year,
        ytd: { revenue: ytd.revenue, totalCost: ytd.totalCost, result: ytd.result, marginPct: ytd.marginPct, months: ytd.months },
    };
}

export interface CondominiumSummary {
    months: number;
    revenue: number;
    totalCost: number;
    result: number;
    /** result ÷ revenue, in %; null without revenue */
    marginPct: number | null;
    byCost: Record<CondoCostKey, number>;
    /** the newest month, or null */
    latest: CondominiumMonth | null;
}

/** Totals over a list of months (already filtered by period). */
export function summarizeCondominium(months: CondominiumMonth[]): CondominiumSummary {
    const byCost: Record<CondoCostKey, number> = { energy_cost: 0, internet_cost: 0, water_cost: 0, iptu_amount: 0, maintenance_cost: 0 };
    let revenue = 0, totalCost = 0;
    for (const m of months) {
        revenue += m.revenue; totalCost += m.totalCost;
        for (const k of CONDO_COST_KEYS) byCost[k] = r2(byCost[k] + m[k]);
    }
    revenue = r2(revenue); totalCost = r2(totalCost);
    const sorted = [...months].sort((a, b) => (a.month < b.month ? 1 : -1));
    return {
        months: months.length, revenue, totalCost, result: r2(revenue - totalCost),
        marginPct: revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : null,
        byCost, latest: sorted[0] ?? null,
    };
}
