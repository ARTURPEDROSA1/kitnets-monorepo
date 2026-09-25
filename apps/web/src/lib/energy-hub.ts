/**
 * The maths behind the Energia hub: what a unit's bills add up to (the newest bill and the last
 * twelve months), one row per unit (kind, category, due state, staleness, spikes), the hub totals
 * and the attention list. Pure functions, shared by the server loader (`summarizeUnitBills`) and
 * the client (`energyRows`, `energyHubTotals`, `energyAttention`).
 */
import type { OwnerPropertySummary, UcCategory } from "@/lib/energy-properties-server";
import { solarSavings } from "@/lib/energy-savings";
import { normalizeText } from "@/lib/lease-extract";

type Numeric = number | string | null | undefined;
const num = (v: Numeric): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// ── Months ───────────────────────────────────────────────────────────

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" + (-11) → "2025-10" */
export function addMonths(month: string, n: number): string {
    const [y, m] = month.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** whole months from `from` to `to` ("2026-07" → "2026-09" = 2; negative when `to` is earlier) */
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

// ── What a unit's bills add up to ─────────────────────────────────────

/** The energy_bills columns the hub reads. */
export interface EnergyBillLike {
    reference_month: string;
    reference_month_label?: string | null;
    due_date?: string | null;
    total_amount?: Numeric;
    is_historical_only?: boolean | null;
    grid_consumption_kwh?: Numeric;
    daily_avg_kwh?: Numeric;
    billing_days?: Numeric;
    solar_injected_kwh?: Numeric;
    solar_compensated_kwh?: Numeric;
    generation_balance_kwh?: Numeric;
    unit_price?: Numeric;
    availability_cost_amount?: Numeric;
    energy_compensated_amount?: Numeric;
    energy_scee_exempt_amount?: Numeric;
}

/** The newest full bill's figures — the card's tiles and the hub's KPIs. */
export interface EnergyLatestSnapshot {
    /** "YYYY-MM" */
    month: string;
    label: string | null;
    dueDate: string | null;
    total: number;
    consumptionKwh: number;
    dailyAvgKwh: number;
    injectedKwh: number;
    compensatedKwh: number;
    /** the generation credits stored with the utility */
    balanceKwh: number;
    unitPrice: number | null;
    availabilityAmount: number;
    /** what the utility credited (or kWh × tariff when the bill carries no credited amount) */
    savingsAmount: number;
    savingsEstimated: boolean;
    /** false when only a 13-month history row exists for the newest month */
    full: boolean;
}

/** The twelve months up to the newest bill. */
export interface EnergyPeriodTotals {
    months: number;
    consumptionKwh: number;
    /** full bills only */
    paidAmount: number;
    savingsAmount: number;
    injectedKwh: number;
    avgConsumptionKwh: number;
}

export const EMPTY_PERIOD: EnergyPeriodTotals = { months: 0, consumptionKwh: 0, paidAmount: 0, savingsAmount: 0, injectedKwh: 0, avgConsumptionKwh: 0 };

export function summarizeUnitBills(bills: EnergyBillLike[]): { latest: EnergyLatestSnapshot | null; last12: EnergyPeriodTotals } {
    const rows = bills
        .filter(b => typeof b.reference_month === "string" && b.reference_month.length >= 7)
        .map(b => ({ ...b, reference_month: b.reference_month.slice(0, 7) }))
        .sort((a, b) => b.reference_month.localeCompare(a.reference_month));
    if (rows.length === 0) return { latest: null, last12: EMPTY_PERIOD };

    const latestRow = rows.find(b => !b.is_historical_only) ?? rows[0];
    const savings = solarSavings(latestRow);
    const consumption = num(latestRow.grid_consumption_kwh);
    const days = num(latestRow.billing_days) || 30;
    const latest: EnergyLatestSnapshot = {
        month: latestRow.reference_month,
        label: latestRow.reference_month_label ?? null,
        dueDate: latestRow.due_date ? String(latestRow.due_date).slice(0, 10) : null,
        total: num(latestRow.total_amount),
        consumptionKwh: consumption,
        dailyAvgKwh: num(latestRow.daily_avg_kwh) || (days > 0 ? consumption / days : 0),
        injectedKwh: num(latestRow.solar_injected_kwh),
        compensatedKwh: num(latestRow.solar_compensated_kwh),
        balanceKwh: num(latestRow.generation_balance_kwh),
        unitPrice: num(latestRow.unit_price) || null,
        availabilityAmount: num(latestRow.availability_cost_amount),
        savingsAmount: savings.amount,
        savingsEstimated: savings.estimated,
        full: !latestRow.is_historical_only,
    };

    // the twelve months up to the newest bill, one row per month
    const from = addMonths(latestRow.reference_month, -11);
    const seen = new Set<string>();
    const window = rows.filter(b => {
        if (b.reference_month < from || b.reference_month > latestRow.reference_month || seen.has(b.reference_month)) return false;
        seen.add(b.reference_month);
        return true;
    });
    const full = window.filter(b => !b.is_historical_only);
    const consumptionKwh = window.reduce((s, b) => s + num(b.grid_consumption_kwh), 0);
    return {
        latest,
        last12: {
            months: window.length,
            consumptionKwh,
            paidAmount: full.reduce((s, b) => s + num(b.total_amount), 0),
            savingsAmount: full.reduce((s, b) => s + solarSavings(b).amount, 0),
            injectedKwh: window.reduce((s, b) => s + num(b.solar_injected_kwh), 0),
            avgConsumptionKwh: window.length > 0 ? consumptionKwh / window.length : 0,
        },
    };
}

// ── Kinds, categories, views ─────────────────────────────────────────

export type EnergyUnitKind = "rental" | "standalone" | "orphaned";
export type EnergyCategoryKey = UcCategory | "rental" | "orphaned";

export interface EnergyCategoryMeta { label: string; short: string; pill: string }

export const CATEGORY_META: Record<EnergyCategoryKey, EnergyCategoryMeta> = {
    rental: { label: "Imóvel de aluguel", short: "Aluguel", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    residencia_propria: { label: "Residência própria", short: "Casa própria", pill: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
    parente: { label: "Casa de parente", short: "Parente", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    beneficiaria: { label: "Unidade beneficiária (GD)", short: "Beneficiária", pill: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" },
    outro: { label: "UC avulsa", short: "Avulsa", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    orphaned: { label: "Desvinculada de Imóveis", short: "Desvinculada", pill: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300" },
};

export type EnergyView = "todas" | "aluguel" | "avulsas";
export const DEFAULT_ENERGY_VIEW: EnergyView = "todas";
export const ENERGY_VIEWS: Array<{ key: EnergyView; label: string; empty: string }> = [
    { key: "todas", label: "Todas", empty: "Nenhuma unidade cadastrada." },
    { key: "aluguel", label: "Imóveis de aluguel", empty: "Nenhum imóvel de aluguel com energia acompanhada." },
    { key: "avulsas", label: "UCs avulsas", empty: "Nenhuma UC avulsa cadastrada." },
];
export const energyViewFromParam = (v: string | null): EnergyView => (ENERGY_VIEWS.some(x => x.key === v) ? (v as EnergyView) : DEFAULT_ENERGY_VIEW);

export function unitKind(unit: Pick<OwnerPropertySummary, "isStandaloneUc" | "isOrphaned">): EnergyUnitKind {
    if (unit.isOrphaned) return "orphaned";
    return unit.isStandaloneUc ? "standalone" : "rental";
}

export function inEnergyView(kind: EnergyUnitKind, view: EnergyView): boolean {
    if (view === "todas") return true;
    return view === "aluguel" ? kind === "rental" : kind !== "rental";
}

// ── Rows ─────────────────────────────────────────────────────────────

/** the newest bill's due date against today; null without a due date or when it is long past */
export type DueState = "overdue" | "due_soon" | "ok";
/** a due date this many days past still counts as overdue (older bills were paid or forgotten) */
export const OVERDUE_WINDOW_DAYS = 45;
export const DUE_SOON_DAYS = 7;
/** months without a new bill before the unit counts as stale */
export const STALE_MONTHS = 2;
/** consumption this far above the 12-month average counts as a spike */
export const SPIKE_RATIO = 1.3;
export const SPIKE_MIN_KWH = 30;

export interface EnergyUnitRow {
    unit: OwnerPropertySummary;
    kind: EnergyUnitKind;
    categoryKey: EnergyCategoryKey;
    category: EnergyCategoryMeta;
    /** "Solar · 5 kWp" when the unit generates or is registered with a system; null otherwise */
    solarLabel: string | null;
    hasGeneration: boolean;
    latest: EnergyLatestSnapshot | null;
    last12: EnergyPeriodTotals;
    daysToDue: number | null;
    dueState: DueState | null;
    /** months since the newest bill; null without bills */
    monthsSinceLatest: number | null;
    stale: boolean;
    spike: boolean;
    distributor: string;
    place: string;
    haystack: string;
}

export function energyRows(units: OwnerPropertySummary[], today: string): EnergyUnitRow[] {
    const thisMonth = today.slice(0, 7);
    return units.map(unit => {
        const kind = unitKind(unit);
        const categoryKey: EnergyCategoryKey = kind === "rental" ? "rental" : kind === "orphaned" ? "orphaned" : (unit.ucCategory ?? "outro");
        const latest = unit.latest ?? null;
        const last12 = unit.last12 ?? EMPTY_PERIOD;
        const hasGeneration = latest ? latest.injectedKwh > 0 || latest.balanceKwh > 0 || latest.compensatedKwh > 0 : Boolean(unit.solarKwp);
        const daysToDue = latest?.dueDate ? daysBetween(today, latest.dueDate) : null;
        const dueState: DueState | null = daysToDue === null ? null : daysToDue < 0 ? (daysToDue >= -OVERDUE_WINDOW_DAYS ? "overdue" : "ok") : daysToDue <= DUE_SOON_DAYS ? "due_soon" : "ok";
        const monthsSinceLatest = latest ? monthsBetween(latest.month, thisMonth) : null;
        const spike = Boolean(latest && last12.months >= 3 && latest.consumptionKwh > last12.avgConsumptionKwh * SPIKE_RATIO && latest.consumptionKwh - last12.avgConsumptionKwh >= SPIKE_MIN_KWH);
        const category = CATEGORY_META[categoryKey];
        const distributor = unit.utilityCompany?.trim() || "Concessionária";
        return {
            unit,
            kind,
            categoryKey,
            category,
            solarLabel: hasGeneration ? (unit.solarKwp ? `Solar · ${unit.solarKwp} kWp` : "Solar") : null,
            hasGeneration,
            latest,
            last12,
            daysToDue,
            dueState,
            monthsSinceLatest,
            stale: monthsSinceLatest !== null && monthsSinceLatest >= STALE_MONTHS,
            spike,
            distributor,
            place: [unit.city, unit.state].filter(Boolean).join("/"),
            haystack: normalizeText([unit.name, unit.address, unit.city, unit.state, unit.consumerUnit, unit.utilityCompany, category.label, category.short, unit.notes].filter(Boolean).join(" ")),
        };
    });
}

// ── Hub totals ───────────────────────────────────────────────────────

export interface EnergyHubTotals {
    units: number;
    rental: number;
    standalone: number;
    orphaned: number;
    withBills: number;
    /** consumption on each unit's newest bill, added up */
    consumptionLatest: number;
    consumption12: number;
    dailyLatest: number;
    /** the newest bills' totals, added up */
    billsLatest: number;
    paid12: number;
    dueSoon: number;
    overdue: number;
    savingsLatest: number;
    savings12: number;
    balanceKwh: number;
    unitsWithBalance: number;
    injectedLatest: number;
    injected12: number;
    solarUnits: number;
    stale: number;
}

export function energyHubTotals(rows: EnergyUnitRow[]): EnergyHubTotals {
    const withLatest = rows.filter(r => r.latest);
    const sum = (f: (r: EnergyUnitRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
        units: rows.length,
        rental: rows.filter(r => r.kind === "rental").length,
        standalone: rows.filter(r => r.kind === "standalone").length,
        orphaned: rows.filter(r => r.kind === "orphaned").length,
        withBills: withLatest.length,
        consumptionLatest: sum(r => r.latest?.consumptionKwh ?? 0),
        consumption12: sum(r => r.last12.consumptionKwh),
        dailyLatest: sum(r => r.latest?.dailyAvgKwh ?? 0),
        billsLatest: sum(r => r.latest?.total ?? 0),
        paid12: sum(r => r.last12.paidAmount),
        dueSoon: rows.filter(r => r.dueState === "due_soon").length,
        overdue: rows.filter(r => r.dueState === "overdue").length,
        savingsLatest: sum(r => r.latest?.savingsAmount ?? 0),
        savings12: sum(r => r.last12.savingsAmount),
        balanceKwh: sum(r => r.latest?.balanceKwh ?? 0),
        unitsWithBalance: rows.filter(r => (r.latest?.balanceKwh ?? 0) > 0).length,
        injectedLatest: sum(r => r.latest?.injectedKwh ?? 0),
        injected12: sum(r => r.last12.injectedKwh),
        solarUnits: rows.filter(r => r.hasGeneration).length,
        stale: rows.filter(r => r.stale).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type EnergyAttentionKind = "overdue" | "due_soon" | "stale" | "spike" | "no_generation" | "no_bills";

export interface EnergyAttentionItem {
    kind: EnergyAttentionKind;
    tone: "rose" | "amber" | "slate";
    row: EnergyUnitRow;
    text: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const kwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;
const brDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What deserves a look, worst first. */
export function energyAttention(rows: EnergyUnitRow[]): EnergyAttentionItem[] {
    const items: EnergyAttentionItem[] = [];
    for (const row of rows) {
        const { latest } = row;
        if (latest && row.dueState === "overdue" && latest.dueDate && row.daysToDue !== null) {
            items.push({ kind: "overdue", tone: "rose", row, text: `Fatura de ${latest.label ?? monthLabel(latest.month)} (${brl(latest.total)}) venceu em ${brDate(latest.dueDate)}, há ${plural(-row.daysToDue, "dia", "dias")}.` });
        } else if (latest && row.dueState === "due_soon" && latest.dueDate && row.daysToDue !== null) {
            items.push({ kind: "due_soon", tone: "amber", row, text: row.daysToDue === 0 ? `Fatura de ${latest.label ?? monthLabel(latest.month)} (${brl(latest.total)}) vence hoje.` : `Fatura de ${latest.label ?? monthLabel(latest.month)} (${brl(latest.total)}) vence em ${plural(row.daysToDue, "dia", "dias")} (${brDate(latest.dueDate)}).` });
        }
        if (latest && row.stale && row.monthsSinceLatest !== null) {
            items.push({ kind: "stale", tone: "amber", row, text: `A fatura mais recente é de ${latest.label ?? monthLabel(latest.month)}, há ${plural(row.monthsSinceLatest, "mês", "meses")}: importe a fatura atual.` });
        }
        if (latest && row.spike) {
            const pct = Math.round((latest.consumptionKwh / row.last12.avgConsumptionKwh - 1) * 100);
            items.push({ kind: "spike", tone: "amber", row, text: `Consumo de ${kwh(latest.consumptionKwh)} em ${latest.label ?? monthLabel(latest.month)}, ${pct}% acima da média de 12 meses (${kwh(row.last12.avgConsumptionKwh)}).` });
        }
        if (latest && latest.full && row.kind === "rental" && row.unit.solarKwp && !row.hasGeneration) {
            items.push({ kind: "no_generation", tone: "slate", row, text: `Cadastrado com ${row.unit.solarKwp} kWp de geração, mas a fatura de ${latest.label ?? monthLabel(latest.month)} não traz injeção nem saldo de créditos.` });
        }
        if (!latest) {
            items.push({ kind: "no_bills", tone: "slate", row, text: "Nenhuma fatura importada ainda: envie a conta de luz mais recente e a IA lê o consumo e 13 meses de histórico." });
        }
    }
    const rank: Record<EnergyAttentionKind, number> = { overdue: 0, due_soon: 1, stale: 2, spike: 3, no_generation: 4, no_bills: 5 };
    return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
