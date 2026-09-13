/**
 * Property taxes register — pure helpers.
 *
 * One row per tax event: IPTU per fiscal year, ITBI at purchase, others.
 * A row may be split into up to 6 parcelas (`installments`), each with its
 * own amount, payer and date — e.g. the landlord pays the parcelas that fall
 * in a vacancy. When parcelas exist they are the source of truth for the
 * row's amount and payer split.
 *
 * Informational: KPIs take landlord-paid IPTU from the income ledger's
 * monthly IPTU column and ITBI from the investment ledger, so this register
 * never double counts.
 */
import { round2 } from "./property-income";
import type { PropertyTransaction } from "./property-investment";

export type TaxKind = "IPTU" | "ITBI" | "OUTRO";
export type TaxPayer = "TENANT" | "LANDLORD";
export type EffectivePayer = TaxPayer | "MIXED";

export const MAX_INSTALLMENTS = 6;

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
export const TAX_PAYER_VALUES = TAX_PAYERS.map(p => p.value) as TaxPayer[];

export interface TaxInstallment {
    /** 1-based parcela number */
    seq: number;
    amount: number;
    paid_by: TaxPayer;
    /** `YYYY-MM-DD` or null */
    paid_on: string | null;
}

export interface PropertyTax {
    id: string;
    property_id: string;
    year: number;
    kind: TaxKind;
    /** total for the row; equals Σ installments when they exist */
    amount: number;
    /** payer for the row; with mixed parcelas the API stores the majority payer */
    paid_by: TaxPayer;
    paid_on: string | null;
    comment: string | null;
    installments: TaxInstallment[];
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
    installments?: TaxInstallment[];
}

export interface EffectiveTax {
    amount: number;
    byTenant: number;
    byLandlord: number;
    payer: EffectivePayer;
    installments: number;
}

/** Amount and payer split of a row, honouring parcelas when present. */
export function effectiveTax(row: Pick<PropertyTax, "amount" | "paid_by" | "installments">): EffectiveTax {
    const parts = Array.isArray(row.installments) ? row.installments : [];
    if (parts.length === 0) {
        const amount = round2(Number(row.amount) || 0);
        return {
            amount,
            byTenant: row.paid_by === "TENANT" ? amount : 0,
            byLandlord: row.paid_by === "LANDLORD" ? amount : 0,
            payer: row.paid_by,
            installments: 0,
        };
    }
    let byTenant = 0, byLandlord = 0;
    for (const p of parts) {
        const a = Number(p.amount) || 0;
        if (p.paid_by === "LANDLORD") byLandlord += a; else byTenant += a;
    }
    byTenant = round2(byTenant);
    byLandlord = round2(byLandlord);
    const payer: EffectivePayer = byTenant > 0 && byLandlord > 0 ? "MIXED" : byLandlord > 0 ? "LANDLORD" : "TENANT";
    return { amount: round2(byTenant + byLandlord), byTenant, byLandlord, payer, installments: parts.length };
}

/** Splits `total` into `n` parcelas (equal, rounding to the last one). */
export function splitInstallments(total: number, n: number, paidBy: TaxPayer, existing: TaxInstallment[] = []): TaxInstallment[] {
    const count = Math.min(Math.max(Math.round(n), 1), MAX_INSTALLMENTS);
    const each = Math.floor((total / count) * 100) / 100;
    const out: TaxInstallment[] = [];
    let acc = 0;
    for (let i = 1; i <= count; i++) {
        const amount = i === count ? round2(total - acc) : each;
        acc = round2(acc + amount);
        const prev = existing.find(e => e.seq === i);
        out.push({ seq: i, amount, paid_by: prev?.paid_by ?? paidBy, paid_on: prev?.paid_on ?? null });
    }
    return out;
}

/** Normalises parcelas coming from the API/UI: sorted, renumbered, amounts ≥ 0. */
export function normalizeInstallments(parts: TaxInstallment[] | undefined | null): TaxInstallment[] {
    if (!Array.isArray(parts)) return [];
    return parts
        .filter(p => p && Number.isFinite(Number(p.amount)))
        .slice(0, MAX_INSTALLMENTS)
        .map((p, i) => ({
            seq: i + 1,
            amount: round2(Math.max(0, Number(p.amount) || 0)),
            paid_by: p.paid_by === "LANDLORD" ? "LANDLORD" : "TENANT",
            paid_on: p.paid_on && /^\d{4}-\d{2}-\d{2}$/.test(p.paid_on) ? p.paid_on : null,
        }));
}

export interface TaxSummary {
    iptuTotal: number;
    iptuByTenant: number;
    iptuByLandlord: number;
    iptuYears: number;
    iptuAvgPerYear: number;
    /** latest IPTU year's total, for the "current" figure */
    iptuLatest: { year: number; amount: number } | null;
    /** growth of the latest year over the previous one, in % (null with < 2 years) */
    iptuGrowthPct: number | null;
    /** compound annual growth from the first to the latest year, in % (null with < 2 years) */
    iptuCagrPct: number | null;
    itbi: number;
    other: number;
    total: number;
    firstYear: number | null;
    lastYear: number | null;
}

export interface IptuYearPoint {
    year: number;
    amount: number;
    byTenant: number;
    byLandlord: number;
    /** % vs previous year, null for the first point */
    growthPct: number | null;
}

/** IPTU per fiscal year, oldest first (rows of the same year are added together). */
export function iptuSeries(rows: PropertyTax[]): IptuYearPoint[] {
    const byYear = new Map<number, { amount: number; byTenant: number; byLandlord: number }>();
    for (const r of rows) {
        if (r.kind !== "IPTU") continue;
        const e = effectiveTax(r);
        const cur = byYear.get(r.year) ?? { amount: 0, byTenant: 0, byLandlord: 0 };
        cur.amount += e.amount; cur.byTenant += e.byTenant; cur.byLandlord += e.byLandlord;
        byYear.set(r.year, cur);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    return years.map((year, i) => {
        const v = byYear.get(year)!;
        const prev = i > 0 ? byYear.get(years[i - 1])!.amount : 0;
        return {
            year,
            amount: round2(v.amount),
            byTenant: round2(v.byTenant),
            byLandlord: round2(v.byLandlord),
            growthPct: i > 0 && prev > 0 ? Math.round(((v.amount / prev) - 1) * 1000) / 10 : null,
        };
    });
}

export function summarizeTaxes(rows: PropertyTax[]): TaxSummary {
    let itbi = 0, other = 0;
    let first: number | null = null, last: number | null = null;
    for (const r of rows) {
        const e = effectiveTax(r);
        if (r.kind === "ITBI") itbi += e.amount;
        else if (r.kind === "OUTRO") other += e.amount;
        if (first === null || r.year < first) first = r.year;
        if (last === null || r.year > last) last = r.year;
    }
    const series = iptuSeries(rows);
    const iptuTotal = round2(series.reduce((a, p) => a + p.amount, 0));
    const iptuByTenant = round2(series.reduce((a, p) => a + p.byTenant, 0));
    const iptuByLandlord = round2(series.reduce((a, p) => a + p.byLandlord, 0));
    const latest = series.length ? series[series.length - 1] : null;
    const firstPt = series.length ? series[0] : null;
    const span = latest && firstPt ? latest.year - firstPt.year : 0;
    const cagr = latest && firstPt && span > 0 && firstPt.amount > 0
        ? Math.round((Math.pow(latest.amount / firstPt.amount, 1 / span) - 1) * 1000) / 10
        : null;
    return {
        iptuTotal,
        iptuByTenant,
        iptuByLandlord,
        iptuYears: series.length,
        iptuAvgPerYear: series.length ? round2(iptuTotal / series.length) : 0,
        iptuLatest: latest ? { year: latest.year, amount: latest.amount } : null,
        iptuGrowthPct: latest?.growthPct ?? null,
        iptuCagrPct: cagr,
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
            installments: [],
        }));
}
