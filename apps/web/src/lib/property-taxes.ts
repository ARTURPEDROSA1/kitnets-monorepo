/**
 * Property taxes register — pure helpers.
 *
 * One row per tax event: IPTU per fiscal year, ITBI at purchase, others.
 * Informational: KPIs take landlord-paid IPTU from the income ledger's
 * monthly IPTU column and ITBI from the investment ledger, so this register
 * never double counts.
 */
import { round2 } from "./property-income";
import type { PropertyTransaction } from "./property-investment";

export type TaxKind = "IPTU" | "ITBI" | "OUTRO";
export type TaxPayer = "TENANT" | "LANDLORD";

export const TAX_KINDS: ReadonlyArray<{ kind: TaxKind; label: string }> = [
    { kind: "IPTU", label: "IPTU" },
    { kind: "ITBI", label: "ITBI" },
    { kind: "OUTRO", label: "Outro tributo" },
];
export const TAX_KIND_VALUES = TAX_KINDS.map(k => k.kind) as TaxKind[];
export const TAX_PAYERS: ReadonlyArray<{ value: TaxPayer; label: string }> = [
    { value: "TENANT", label: "Inquilino" },
    { value: "LANDLORD", label: "Proprietário" },
];

export interface PropertyTax {
    id: string;
    property_id: string;
    year: number;
    kind: TaxKind;
    amount: number;
    paid_by: TaxPayer;
    paid_on: string | null;
    comment: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PropertyTaxInput {
    id?: string;
    year: number;
    kind: TaxKind;
    amount: number;
    paid_by: TaxPayer;
    paid_on?: string | null;
    comment?: string | null;
}

export interface TaxSummary {
    iptuTotal: number;
    iptuByTenant: number;
    iptuByLandlord: number;
    iptuYears: number;
    iptuAvgPerYear: number;
    /** latest IPTU year's amount, for the "current" figure */
    iptuLatest: { year: number; amount: number } | null;
    itbi: number;
    other: number;
    total: number;
    firstYear: number | null;
    lastYear: number | null;
}

export function summarizeTaxes(rows: PropertyTax[]): TaxSummary {
    let iptuTotal = 0, iptuByTenant = 0, iptuByLandlord = 0, itbi = 0, other = 0;
    const iptuYears = new Set<number>();
    let latest: { year: number; amount: number } | null = null;
    let first: number | null = null, last: number | null = null;
    for (const r of rows) {
        const amt = Number(r.amount) || 0;
        if (r.kind === "IPTU") {
            iptuTotal += amt;
            if (r.paid_by === "LANDLORD") iptuByLandlord += amt; else iptuByTenant += amt;
            iptuYears.add(r.year);
            if (!latest || r.year > latest.year) latest = { year: r.year, amount: amt };
            else if (r.year === latest.year) latest = { year: r.year, amount: latest.amount + amt };
        } else if (r.kind === "ITBI") itbi += amt;
        else other += amt;
        if (first === null || r.year < first) first = r.year;
        if (last === null || r.year > last) last = r.year;
    }
    return {
        iptuTotal: round2(iptuTotal),
        iptuByTenant: round2(iptuByTenant),
        iptuByLandlord: round2(iptuByLandlord),
        iptuYears: iptuYears.size,
        iptuAvgPerYear: iptuYears.size ? round2(iptuTotal / iptuYears.size) : 0,
        iptuLatest: latest,
        itbi: round2(itbi),
        other: round2(other),
        total: round2(iptuTotal + itbi + other),
        firstYear: first,
        lastYear: last,
    };
}

/**
 * Groups the investment ledger's IPTU transactions by year so the register
 * can be seeded before those rows are removed from the ledger.
 */
export function iptuYearsFromTransactions(txs: PropertyTransaction[], paidBy: TaxPayer = "TENANT"): PropertyTaxInput[] {
    const byYear = new Map<number, { amount: number; last: string }>();
    for (const t of txs) {
        if (t.kind !== "IPTU") continue;
        const year = Number(t.occurred_on.slice(0, 4));
        const cur = byYear.get(year) ?? { amount: 0, last: t.occurred_on };
        cur.amount += Number(t.amount) || 0;
        if (t.occurred_on > cur.last) cur.last = t.occurred_on;
        byYear.set(year, cur);
    }
    return Array.from(byYear.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, v]) => ({
            year,
            kind: "IPTU" as const,
            amount: round2(v.amount),
            paid_by: paidBy,
            paid_on: v.last,
            comment: "Gerado a partir dos lançamentos de IPTU do investimento",
        }));
}
