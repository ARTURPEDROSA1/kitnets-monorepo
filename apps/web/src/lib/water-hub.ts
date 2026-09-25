/**
 * The maths behind the Água hub: what a property's water bills add up to (the newest bill and the
 * last twelve months), one row per property (due state, staleness, spikes, whether the current PDF
 * and the utility's logo are kept), the hub totals and the attention list. Pure functions, shared
 * by the server loader (`summarizeWaterBills`) and the client.
 */
import type { WaterPropertySummary } from "@/lib/water-properties-server";
import { normalizeText } from "@/lib/lease-extract";

type Numeric = number | string | null | undefined;
const num = (v: Numeric): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const numOrNull = (v: Numeric): number | null => { if (v === null || v === undefined || v === "") return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

// ── Months ───────────────────────────────────────────────────────────

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" + (-11) → "2025-10" */
export function addMonths(month: string, n: number): string {
    const [y, m] = month.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** whole months from `from` to `to` ("2026-07" → "2026-09" = 2) */
export function monthsBetween(from: string, to: string): number {
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    return (ty - fy) * 12 + (tm - fm);
}

/** "2026-09" → "set/2026" */
export function monthLabel(month: string | null | undefined): string {
    if (!month) return "—";
    const [y, m] = month.split("-");
    return `${MONTHS[Number(m) - 1] ?? m}/${y}`;
}

const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
/** calendar days from `from` to `to` (negative when `to` is earlier) */
export function daysBetween(from: string, to: string): number {
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}

// ── What a property's bills add up to ─────────────────────────────────

/** The water_bills columns the hub reads. */
export interface WaterBillLike {
    reference_month: string;
    due_date?: string | null;
    reading_date?: string | null;
    total_amount?: Numeric;
    consumption_m3?: Numeric;
    billed_consumption_m3?: Numeric;
    effective_rate_per_m3?: Numeric;
    meter_number?: string | null;
    occurrence_code?: string | null;
}

/** The newest bill's figures — the card's tiles and the hub's KPIs. */
export interface WaterLatest {
    /** "YYYY-MM" */
    month: string;
    dueDate: string | null;
    readingDate: string | null;
    total: number;
    consumptionM3: number;
    billedM3: number | null;
    /** R$ per m³ (total ÷ consumption) */
    ratePerM3: number | null;
    meterNumber: string | null;
    occurrence: string | null;
}

/** The twelve months up to the newest bill. */
export interface WaterPeriod {
    months: number;
    consumptionM3: number;
    paidAmount: number;
    avgConsumptionM3: number;
    avgAmount: number;
    /** R$ per m³ over the period */
    avgRate: number | null;
}

export const EMPTY_WATER_PERIOD: WaterPeriod = { months: 0, consumptionM3: 0, paidAmount: 0, avgConsumptionM3: 0, avgAmount: 0, avgRate: null };

export function summarizeWaterBills(bills: WaterBillLike[]): { latest: WaterLatest | null; last12: WaterPeriod } {
    const rows = bills
        .filter(b => typeof b.reference_month === "string" && b.reference_month.length >= 7)
        .map(b => ({ ...b, reference_month: b.reference_month.slice(0, 7) }))
        .sort((a, b) => b.reference_month.localeCompare(a.reference_month));
    if (rows.length === 0) return { latest: null, last12: EMPTY_WATER_PERIOD };

    const newest = rows[0];
    const consumption = num(newest.consumption_m3);
    const total = num(newest.total_amount);
    const latest: WaterLatest = {
        month: newest.reference_month,
        dueDate: newest.due_date ? String(newest.due_date).slice(0, 10) : null,
        readingDate: newest.reading_date ? String(newest.reading_date).slice(0, 10) : null,
        total,
        consumptionM3: consumption,
        billedM3: numOrNull(newest.billed_consumption_m3),
        ratePerM3: numOrNull(newest.effective_rate_per_m3) ?? (consumption > 0 ? Math.round((total / consumption) * 100) / 100 : null),
        meterNumber: newest.meter_number ?? null,
        occurrence: newest.occurrence_code ?? null,
    };

    const from = addMonths(newest.reference_month, -11);
    const seen = new Set<string>();
    const window = rows.filter(b => {
        if (b.reference_month < from || seen.has(b.reference_month)) return false;
        seen.add(b.reference_month);
        return true;
    });
    const consumptionM3 = window.reduce((s, b) => s + num(b.consumption_m3), 0);
    const paidAmount = window.reduce((s, b) => s + num(b.total_amount), 0);
    return {
        latest,
        last12: {
            months: window.length,
            consumptionM3,
            paidAmount,
            avgConsumptionM3: window.length > 0 ? consumptionM3 / window.length : 0,
            avgAmount: window.length > 0 ? paidAmount / window.length : 0,
            avgRate: consumptionM3 > 0 ? Math.round((paidAmount / consumptionM3) * 100) / 100 : null,
        },
    };
}

// ── Views ────────────────────────────────────────────────────────────

export type WaterView = "todos" | "com-contas" | "sem-contas";
export const DEFAULT_WATER_VIEW: WaterView = "todos";
export const WATER_VIEWS: Array<{ key: WaterView; label: string; empty: string }> = [
    { key: "todos", label: "Todos", empty: "Nenhum imóvel com água principal." },
    { key: "com-contas", label: "Com contas", empty: "Nenhum imóvel com contas de água importadas." },
    { key: "sem-contas", label: "Sem contas", empty: "Todos os imóveis já têm contas importadas." },
];
export const waterViewFromParam = (v: string | null): WaterView => (WATER_VIEWS.some(x => x.key === v) ? (v as WaterView) : DEFAULT_WATER_VIEW);

export function inWaterView(hasBills: boolean, view: WaterView): boolean {
    if (view === "todos") return true;
    return view === "com-contas" ? hasBills : !hasBills;
}

// ── Rows ─────────────────────────────────────────────────────────────

export type DueState = "overdue" | "due_soon" | "ok";
export const OVERDUE_WINDOW_DAYS = 45;
export const DUE_SOON_DAYS = 7;
export const STALE_MONTHS = 2;
export const SPIKE_RATIO = 1.3;
export const SPIKE_MIN_M3 = 5;

export interface WaterUnitRow {
    unit: WaterPropertySummary;
    latest: WaterLatest | null;
    last12: WaterPeriod;
    hasBills: boolean;
    daysToDue: number | null;
    dueState: DueState | null;
    monthsSinceLatest: number | null;
    stale: boolean;
    spike: boolean;
    /** the current bill's PDF is kept */
    hasPdf: boolean;
    /** the utility's logo (the card's cover) is kept */
    hasLogo: boolean;
    place: string;
    haystack: string;
}

export function waterRows(units: WaterPropertySummary[], today: string): WaterUnitRow[] {
    const thisMonth = today.slice(0, 7);
    return units.map(unit => {
        const latest = unit.latest ?? null;
        const last12 = unit.last12 ?? EMPTY_WATER_PERIOD;
        const daysToDue = latest?.dueDate ? daysBetween(today, latest.dueDate) : null;
        const dueState: DueState | null = daysToDue === null ? null : daysToDue < 0 ? (daysToDue >= -OVERDUE_WINDOW_DAYS ? "overdue" : "ok") : daysToDue <= DUE_SOON_DAYS ? "due_soon" : "ok";
        const monthsSinceLatest = latest ? monthsBetween(latest.month, thisMonth) : null;
        const spike = Boolean(latest && last12.months >= 3 && latest.consumptionM3 > last12.avgConsumptionM3 * SPIKE_RATIO && latest.consumptionM3 - last12.avgConsumptionM3 >= SPIKE_MIN_M3);
        return {
            unit,
            latest,
            last12,
            hasBills: unit.billsCount > 0,
            daysToDue,
            dueState,
            monthsSinceLatest,
            stale: monthsSinceLatest !== null && monthsSinceLatest >= STALE_MONTHS,
            spike,
            hasPdf: Boolean(unit.latestBillPdfUrl),
            hasLogo: Boolean(unit.logoUrl),
            place: [unit.city, unit.state].filter(Boolean).join("/"),
            haystack: normalizeText([unit.name, unit.address, unit.city, unit.state, unit.connectionCode, unit.meterNumber, latest?.meterNumber].filter(Boolean).join(" ")),
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface WaterHubTotals {
    units: number;
    withBills: number;
    consumptionLatest: number;
    consumption12: number;
    billsLatest: number;
    paid12: number;
    dueSoon: number;
    overdue: number;
    /** R$ per m³ over the newest bills, added up */
    rateLatest: number | null;
    /** R$ per m³ over the last twelve months of every property */
    rate12: number | null;
    withPdf: number;
    withLogo: number;
    stale: number;
    spikes: number;
}

export function waterHubTotals(rows: WaterUnitRow[]): WaterHubTotals {
    const sum = (f: (r: WaterUnitRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const consumptionLatest = sum(r => r.latest?.consumptionM3 ?? 0);
    const billsLatest = sum(r => r.latest?.total ?? 0);
    const consumption12 = sum(r => r.last12.consumptionM3);
    const paid12 = sum(r => r.last12.paidAmount);
    return {
        units: rows.length,
        withBills: rows.filter(r => r.hasBills).length,
        consumptionLatest,
        consumption12,
        billsLatest,
        paid12,
        dueSoon: rows.filter(r => r.dueState === "due_soon").length,
        overdue: rows.filter(r => r.dueState === "overdue").length,
        rateLatest: consumptionLatest > 0 ? Math.round((billsLatest / consumptionLatest) * 100) / 100 : null,
        rate12: consumption12 > 0 ? Math.round((paid12 / consumption12) * 100) / 100 : null,
        withPdf: rows.filter(r => r.hasPdf).length,
        withLogo: rows.filter(r => r.hasLogo).length,
        stale: rows.filter(r => r.stale).length,
        spikes: rows.filter(r => r.spike).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type WaterAttentionKind = "overdue" | "due_soon" | "stale" | "spike" | "no_pdf" | "no_bills";

export interface WaterAttentionItem {
    kind: WaterAttentionKind;
    tone: "rose" | "amber" | "slate";
    row: WaterUnitRow;
    text: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const m3 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³`;
const brDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What deserves a look, worst first. */
export function waterAttention(rows: WaterUnitRow[]): WaterAttentionItem[] {
    const items: WaterAttentionItem[] = [];
    for (const row of rows) {
        const { latest } = row;
        if (latest && row.dueState === "overdue" && latest.dueDate && row.daysToDue !== null) {
            items.push({ kind: "overdue", tone: "rose", row, text: `Conta de ${monthLabel(latest.month)} (${brl(latest.total)}) venceu em ${brDate(latest.dueDate)}, há ${plural(-row.daysToDue, "dia", "dias")}.` });
        } else if (latest && row.dueState === "due_soon" && latest.dueDate && row.daysToDue !== null) {
            items.push({ kind: "due_soon", tone: "amber", row, text: row.daysToDue === 0 ? `Conta de ${monthLabel(latest.month)} (${brl(latest.total)}) vence hoje.` : `Conta de ${monthLabel(latest.month)} (${brl(latest.total)}) vence em ${plural(row.daysToDue, "dia", "dias")} (${brDate(latest.dueDate)}).` });
        }
        if (latest && row.stale && row.monthsSinceLatest !== null) {
            items.push({ kind: "stale", tone: "amber", row, text: `A conta mais recente é de ${monthLabel(latest.month)}, há ${plural(row.monthsSinceLatest, "mês", "meses")}: importe a conta atual.` });
        }
        if (latest && row.spike) {
            const pct = Math.round((latest.consumptionM3 / row.last12.avgConsumptionM3 - 1) * 100);
            items.push({ kind: "spike", tone: "amber", row, text: `Consumo de ${m3(latest.consumptionM3)} em ${monthLabel(latest.month)}, ${pct}% acima da média de 12 meses (${m3(row.last12.avgConsumptionM3)}): confira vazamentos.` });
        }
        if (latest && !row.hasPdf) {
            items.push({ kind: "no_pdf", tone: "slate", row, text: `A conta de ${monthLabel(latest.month)} está lançada sem o PDF: envie o arquivo para guardá-lo${row.hasLogo ? "" : " e ler o logo da concessionária"}.` });
        }
        if (!latest) {
            items.push({ kind: "no_bills", tone: "slate", row, text: "Nenhuma conta de água importada ainda: envie a conta da concessionária e a IA lê consumo, tarifas e vencimento." });
        }
    }
    const rank: Record<WaterAttentionKind, number> = { overdue: 0, due_soon: 1, stale: 2, spike: 3, no_pdf: 4, no_bills: 5 };
    return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
