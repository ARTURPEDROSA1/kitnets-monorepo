/**
 * Property taxes register — pure helpers.
 *
 * One row per tax event: IPTU per fiscal year, ITBI at purchase, others.
 * A row may be split into up to 6 parcelas (`installments`), each with its
 * own amount, payer and date — e.g. the landlord pays the parcelas that fall
 * in a vacancy. When parcelas exist they are the source of truth for the
 * row's amount and payer split.
 *
 * This register is the source of truth for IPTU: what the landlord pays
 * enters the costs of the month it was paid (DRE, cost centre, analysis).
 */
import { round2 } from "./property-income";
import type { PropertyTransaction } from "./property-investment";
import { inPeriod, monthLabel, type PeriodRange } from "./period-filter";

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

/** Assessment fields read from the municipal IPTU document (DAM). All optional. */
export interface IptuAssessment {
    municipio: string | null;
    inscricao: string | null;
    /** "Única", "1/6"… */
    referencia: string | null;
    vencimento: string | null;
    area_terreno: number | null;
    area_construida: number | null;
    valor_venal_terreno: number | null;
    valor_venal_predial: number | null;
    valor_venal_imovel: number | null;
    /** % (e.g. 0.5) */
    aliquota_pct: number | null;
    valor_imposto: number | null;
    coleta_lixo: number | null;
    tsa: number | null;
    desconto: number | null;
}

export const IPTU_ASSESSMENT_KEYS: ReadonlyArray<keyof IptuAssessment> = [
    "municipio", "inscricao", "referencia", "vencimento", "area_terreno", "area_construida",
    "valor_venal_terreno", "valor_venal_predial", "valor_venal_imovel", "aliquota_pct",
    "valor_imposto", "coleta_lixo", "tsa", "desconto",
];

export interface PropertyTax extends IptuAssessment {
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
    /** storage path of the current IPTU PDF (only one row per property) */
    document_path: string | null;
    /** short-lived signed URL, added by the API when `document_path` is set */
    document_url?: string | null;
    extracted_at: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PropertyTaxInput extends Partial<IptuAssessment> {
    id?: string;
    year: number;
    kind: TaxKind;
    amount: number;
    paid_by: TaxPayer;
    paid_on?: string | null;
    comment?: string | null;
    installments?: TaxInstallment[];
}

/** What the AI returns for a municipal IPTU document (DAM). */
export interface ExtractedIptu {
    municipio: string | null;
    contribuinte: string | null;
    inscricao: string | null;
    exercicio: number | null;
    /** "Única" or "n/N" */
    referencia: string | null;
    vencimento: string | null;
    areaTerreno: number | null;
    areaConstruida: number | null;
    valorVenalTerreno: number | null;
    valorVenalPredial: number | null;
    valorVenalImovel: number | null;
    aliquotaPct: number | null;
    valorImposto: number | null;
    coletaLixo: number | null;
    tsa: number | null;
    desconto: number | null;
    total: number | null;
    confidence: number;
}

/** Parses "1/6" → { numero: 1, de: 6 }; "Única"/null → null. */
export function parseReferencia(ref: string | null | undefined): { numero: number; de: number } | null {
    if (!ref) return null;
    const m = String(ref).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!m) return null;
    const numero = Number(m[1]), de = Number(m[2]);
    return de > 1 && numero >= 1 && numero <= de ? { numero, de } : null;
}

/**
 * Sanity-checks the DAM arithmetic: imposto + lixo + TSA − desconto = total.
 * Returns the computed total (null if the parts are missing) and whether it
 * agrees with the printed total within 5 cents.
 */
export function checkIptuTotals(x: Pick<ExtractedIptu, "valorImposto" | "coletaLixo" | "tsa" | "desconto" | "total">): { computed: number | null; matches: boolean | null } {
    if (x.valorImposto === null || x.valorImposto === undefined) return { computed: null, matches: null };
    const computed = round2((x.valorImposto || 0) + (x.coletaLixo || 0) + (x.tsa || 0) - (x.desconto || 0));
    if (x.total === null || x.total === undefined) return { computed, matches: null };
    return { computed, matches: Math.abs(computed - x.total) <= 0.05 };
}

/** Builds a tax-row input from an extraction, for the review form / import. */
export function iptuFromExtraction(x: ExtractedIptu, paidBy: TaxPayer, fallbackYear = new Date().getFullYear()): PropertyTaxInput {
    const totals = checkIptuTotals(x);
    const amount = x.total ?? totals.computed ?? 0;
    return {
        year: x.exercicio ?? fallbackYear,
        kind: "IPTU",
        amount: round2(Math.max(0, amount)),
        paid_by: paidBy,
        paid_on: null,
        comment: null,
        installments: [],
        municipio: x.municipio ?? null,
        inscricao: x.inscricao ?? null,
        referencia: x.referencia ?? null,
        vencimento: x.vencimento ?? null,
        area_terreno: x.areaTerreno ?? null,
        area_construida: x.areaConstruida ?? null,
        valor_venal_terreno: x.valorVenalTerreno ?? null,
        valor_venal_predial: x.valorVenalPredial ?? null,
        valor_venal_imovel: x.valorVenalImovel ?? null,
        aliquota_pct: x.aliquotaPct ?? null,
        valor_imposto: x.valorImposto ?? null,
        coleta_lixo: x.coletaLixo ?? null,
        tsa: x.tsa ?? null,
        desconto: x.desconto ?? null,
    };
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
            installments: [] as TaxInstallment[],
        }));
}

/**
 * Taxes paid by the landlord, by calendar month (`YYYY-MM`), from the register:
 * a parcela lands in the month of its `paid_on`; a single payment in the month
 * of the row's `paid_on`; rows without a date fall in January of their year.
 * This is the only tax source of the money model (dashboard, DRE, engine).
 * `kinds` defaults to every kind (IPTU, ITBI, OUTRO).
 */
export function landlordTaxesByMonth(taxes: PropertyTax[], kinds: TaxKind[] = ["IPTU", "ITBI", "OUTRO"]): Map<string, number> {
    const out = new Map<string, number>();
    const add = (m: string, amt: number) => { if (amt > 0) out.set(m, round2((out.get(m) ?? 0) + amt)); };
    for (const tax of taxes) {
        if (!kinds.includes(tax.kind)) continue;
        const year = String(tax.year);
        const parts = Array.isArray(tax.installments) ? tax.installments : [];
        if (parts.length === 0) {
            if (tax.paid_by === "LANDLORD") add(tax.paid_on ? tax.paid_on.slice(0, 7) : `${year}-01`, Number(tax.amount) || 0);
        } else {
            parts.forEach((p, i) => {
                if (p.paid_by !== "LANDLORD") return;
                add(p.paid_on ? p.paid_on.slice(0, 7) : `${year}-${String(Math.min(12, i + 1)).padStart(2, "0")}`, Number(p.amount) || 0);
            });
        }
    }
    return out;
}

/** Payment month of parcela i (without a date: month i of the exercício). */
const parcelaMonth = (year: number, i: number, paidOn: string | null) => paidOn ? paidOn.slice(0, 7) : `${year}-${String(Math.min(12, i + 1)).padStart(2, "0")}`;

/**
 * Months (`YYYY-MM`) where a tax row's money falls: each parcela's payment month, the row's
 * payment month, or — with no dates at all — every month of its exercício.
 */
export function taxMonths(row: Pick<PropertyTax, "year" | "paid_on" | "installments">): string[] {
    const parts = Array.isArray(row.installments) ? row.installments : [];
    const dated = parts.map(p => p.paid_on?.slice(0, 7)).filter((m): m is string => Boolean(m));
    if (dated.length) return dated;
    if (row.paid_on) return [row.paid_on.slice(0, 7)];
    return Array.from({ length: 12 }, (_, i) => `${row.year}-${String(i + 1).padStart(2, "0")}`);
}

/** Whether any of the row's months is inside the period. */
export function taxInPeriod(row: Pick<PropertyTax, "year" | "paid_on" | "installments">, range: PeriodRange): boolean {
    return taxMonths(row).some(m => inPeriod(m, range));
}

export interface IptuMonthPoint { key: string; month: string; inquilino: number; proprietario: number; total: number }

/**
 * IPTU per payment month (cash basis, like the DRE): each parcela in the month it was paid;
 * without dates, parcela i falls in month i of the exercício and a single amount in January.
 * Oldest first; feed it to `groupMonthly` for quarters/years.
 */
export function iptuByMonth(rows: PropertyTax[]): IptuMonthPoint[] {
    const out = new Map<string, IptuMonthPoint>();
    const add = (m: string, payer: TaxPayer, amt: number) => {
        if (!(amt > 0)) return;
        const cur = out.get(m) ?? { key: m, month: monthLabel(m), inquilino: 0, proprietario: 0, total: 0 };
        if (payer === "LANDLORD") cur.proprietario = round2(cur.proprietario + amt); else cur.inquilino = round2(cur.inquilino + amt);
        cur.total = round2(cur.inquilino + cur.proprietario);
        out.set(m, cur);
    };
    for (const tax of rows) {
        if (tax.kind !== "IPTU") continue;
        const parts = Array.isArray(tax.installments) ? tax.installments : [];
        if (parts.length === 0) add(tax.paid_on ? tax.paid_on.slice(0, 7) : `${tax.year}-01`, tax.paid_by, Number(tax.amount) || 0);
        else parts.forEach((p, i) => add(parcelaMonth(tax.year, i, p.paid_on), p.paid_by, Number(p.amount) || 0));
    }
    return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** IPTU only (kept for callers that split IPTU from the other taxes). */
export function landlordIptuByMonth(taxes: PropertyTax[]): Map<string, number> {
    return landlordTaxesByMonth(taxes, ["IPTU"]);
}

/** Landlord taxes (any kind) that fall in one month (`YYYY-MM`). */
export function landlordTaxesForMonth(taxes: PropertyTax[], month: string): number {
    return landlordTaxesByMonth(taxes).get(month) ?? 0;
}

/** Landlord IPTU that falls in one month (`YYYY-MM`). */
export function landlordIptuForMonth(taxes: PropertyTax[], month: string): number {
    return landlordIptuByMonth(taxes).get(month) ?? 0;
}

/** Totals paid by the landlord per kind, all years. */
export function landlordTaxTotals(taxes: PropertyTax[]): { iptu: number; itbi: number; other: number; total: number } {
    let iptu = 0, itbi = 0, other = 0;
    for (const t of taxes) {
        const v = effectiveTax(t).byLandlord;
        if (t.kind === "IPTU") iptu += v; else if (t.kind === "ITBI") itbi += v; else other += v;
    }
    return { iptu: round2(iptu), itbi: round2(itbi), other: round2(other), total: round2(iptu + itbi + other) };
}
