/**
 * The maths behind the Condomínio hub: one row per condominium (the newest month, the year to date,
 * the months of the year whose costs were never entered), the hub totals and the attention list.
 * Pure functions over what `GET /api/condominium` returns; the components only render.
 */
import type { Condominium } from "@/lib/condominium";
import { normalizeText } from "@/lib/lease-extract";

// ── Views ────────────────────────────────────────────────────────────

export type CondoView = "todos" | "positivo" | "negativo";
export const DEFAULT_CONDO_VIEW: CondoView = "todos";
export const CONDO_VIEWS: Array<{ key: CondoView; label: string; empty: string }> = [
    { key: "todos", label: "Todos", empty: "Nenhum condomínio cadastrado." },
    { key: "positivo", label: "No azul", empty: "Nenhum condomínio com resultado positivo no ano." },
    { key: "negativo", label: "No vermelho", empty: "Nenhum condomínio com resultado negativo no ano." },
];
export const condoViewFromParam = (v: string | null): CondoView => (CONDO_VIEWS.some(x => x.key === v) ? (v as CondoView) : DEFAULT_CONDO_VIEW);

export function inCondoView(ytdResult: number, view: CondoView): boolean {
    if (view === "todos") return true;
    return view === "positivo" ? ytdResult >= 0 : ytdResult < 0;
}

// ── Rows ─────────────────────────────────────────────────────────────

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-09" → "set/2026" */
export function monthLabel(month: string | null | undefined): string {
    if (!month) return "—";
    const [y, m] = month.split("-");
    return `${MONTHS[Number(m) - 1] ?? m}/${y}`;
}

export interface CondoRow {
    condo: Condominium;
    /** the newest month, or null */
    latest: Condominium["kpis"]["latest"];
    year: number;
    ytdRevenue: number;
    ytdCost: number;
    ytdResult: number;
    ytdMarginPct: number | null;
    ytdMonths: number;
    /** months of the year with revenue whose costs were never entered */
    monthsWithoutCosts: number;
    negativeMonths: number;
    /** the property's photos (the card's cover carousel) */
    photos: string[];
    haystack: string;
}

export function condoRows(condominiums: Condominium[]): CondoRow[] {
    return condominiums.map(condo => {
        const k = condo.kpis;
        return {
            condo,
            latest: k.latest,
            year: k.year,
            ytdRevenue: k.ytd.revenue,
            ytdCost: k.ytd.totalCost,
            ytdResult: k.ytd.result,
            ytdMarginPct: k.ytd.marginPct,
            ytdMonths: k.ytd.months,
            monthsWithoutCosts: k.ytdMonthsWithoutCosts ?? 0,
            negativeMonths: k.ytdNegativeMonths ?? 0,
            photos: condo.photos ?? [],
            haystack: normalizeText([condo.name, condo.property_name, condo.property_address, condo.notes].filter(Boolean).join(" ")),
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface CondoHubTotals {
    condos: number;
    units: number;
    /** the newest month of each condominium, added up */
    revenueLatest: number;
    costLatest: number;
    resultLatest: number;
    /** the current year to date, added up */
    year: number;
    revenueYtd: number;
    costYtd: number;
    resultYtd: number;
    marginYtd: number | null;
    /** months of the year with revenue and no costs entered, over every condominium */
    monthsWithoutCosts: number;
    negativeCondos: number;
    /** condominiums whose result counts as solar payback */
    solarPayback: number;
    withPhotos: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function condoHubTotals(rows: CondoRow[]): CondoHubTotals {
    const sum = (f: (r: CondoRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
    const revenueYtd = sum(r => r.ytdRevenue);
    const resultYtd = sum(r => r.ytdResult);
    return {
        condos: rows.length,
        units: rows.reduce((s, r) => s + r.condo.units, 0),
        revenueLatest: sum(r => r.latest?.revenue ?? 0),
        costLatest: sum(r => r.latest?.totalCost ?? 0),
        resultLatest: sum(r => r.latest?.result ?? 0),
        year: rows[0]?.year ?? new Date().getFullYear(),
        revenueYtd,
        costYtd: sum(r => r.ytdCost),
        resultYtd,
        marginYtd: revenueYtd > 0 ? Math.round((resultYtd / revenueYtd) * 1000) / 10 : null,
        monthsWithoutCosts: rows.reduce((s, r) => s + r.monthsWithoutCosts, 0),
        negativeCondos: rows.filter(r => r.ytdResult < 0).length,
        solarPayback: rows.filter(r => r.condo.solar_payback_from_result).length,
        withPhotos: rows.filter(r => r.photos.length > 0).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type CondoAttentionKind = "latest_negative" | "ytd_negative" | "costs_missing" | "no_revenue" | "expected_only" | "no_months";

export interface CondoAttentionItem {
    kind: CondoAttentionKind;
    tone: "rose" | "amber" | "slate";
    row: CondoRow;
    text: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What deserves a look, worst first. */
export function condoAttention(rows: CondoRow[]): CondoAttentionItem[] {
    const items: CondoAttentionItem[] = [];
    for (const row of rows) {
        const { latest } = row;
        if (latest && !latest.expected && latest.result < 0) {
            items.push({ kind: "latest_negative", tone: "rose", row, text: `${monthLabel(latest.month)} fechou no vermelho: ${brl(latest.revenue)} de condomínio contra ${brl(latest.totalCost)} de custos (${brl(latest.result)}).` });
        }
        if (row.ytdMonths > 0 && row.ytdResult < 0) {
            items.push({ kind: "ytd_negative", tone: "rose", row, text: `No ano, o condomínio custa mais do que arrecada: ${brl(row.ytdResult)} em ${plural(row.ytdMonths, "mês", "meses")}${row.negativeMonths > 0 ? ` (${plural(row.negativeMonths, "mês negativo", "meses negativos")})` : ""}.` });
        }
        if (row.monthsWithoutCosts > 0) {
            items.push({ kind: "costs_missing", tone: "amber", row, text: `${plural(row.monthsWithoutCosts, "mês", "meses")} de ${row.year} com receita e sem custos lançados: o resultado está inflado até a internet e a manutenção entrarem.` });
        }
        if (latest && latest.revenue <= 0 && latest.totalCost > 0) {
            items.push({ kind: "no_revenue", tone: "amber", row, text: `${monthLabel(latest.month)} tem custos mas nenhuma unidade cobra condomínio: informe o condomínio das unidades em Receitas de Aluguel.` });
        }
        if (latest && latest.expected) {
            items.push({ kind: "expected_only", tone: "slate", row, text: `${monthLabel(latest.month)} ainda é previsto: nenhuma unidade confirmou o recebimento.` });
        }
        if (!latest) {
            items.push({ kind: "no_months", tone: "slate", row, text: "Nenhum mês ainda: os meses nascem em Receitas de Aluguel assim que uma unidade tem aluguel ou condomínio registrado." });
        }
    }
    const rank: Record<CondoAttentionKind, number> = { latest_negative: 0, ytd_negative: 1, costs_missing: 2, no_revenue: 3, expected_only: 4, no_months: 5 };
    return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
