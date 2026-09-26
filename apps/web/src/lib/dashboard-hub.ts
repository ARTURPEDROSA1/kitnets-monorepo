/**
 * The maths behind the Dashboard: the headline figures, each module's figures, the occupancy, the taxes
 * and the merged "Atenção" list, all from the bundle `loadDashboard` returns (lib/dashboard-views.ts).
 * Pure functions built on the hubs' own maths (lease-, tenant-, agent-, agency-dashboard, energy-,
 * water-, condominium-, project-hub, property-taxes), so the dashboard says exactly what each hub says.
 * The components only render. `today` is a Brasília YYYY-MM-DD string, computed once by the caller.
 */
import { agencyAttention, agencyHubTotals, agencyRows, type AgencyHubTotals, type AgencyRow } from "@/lib/agency-dashboard";
import { agentAttention, agentHubTotals, agentRows, type AgentHubTotals, type AgentRow } from "@/lib/agent-dashboard";
import { condoAttention, condoHubTotals, condoRows, type CondoHubTotals, type CondoRow } from "@/lib/condominium-hub";
import type { DashboardIncomeSnapshot, DashboardView } from "@/lib/dashboard-views";
import { energyAttention, energyHubTotals, energyRows, type EnergyHubTotals, type EnergyUnitRow } from "@/lib/energy-hub";
import { IN_FORCE, attentionItems, brl, hubTotals, summarizeLeases, titleOf, type HubTotals, type LeaseRow } from "@/lib/lease-dashboard";
import { daysBetween } from "@/lib/lease-summary";
import { investmentTitle } from "@/lib/new-investments";
import { IN_PROGRESS_STATUSES, projectHubTotals, type ProjectHubTotals } from "@/lib/project-hub";
import type { PropertyEntry } from "@/lib/property-entries-server";
import { iptuByMonth, landlordIptuByMonth, landlordTaxTotals, landlordTaxesByMonth, type PropertyTax } from "@/lib/property-taxes";
import { tenantAttention, tenantHubTotals, tenantRows, type TenantHubTotals, type TenantRow } from "@/lib/tenant-dashboard";
import { waterAttention, waterHubTotals, waterRows, type WaterHubTotals, type WaterUnitRow } from "@/lib/water-hub";
import type { LeaseWithDetails } from "@/types/lease";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Occupancy ────────────────────────────────────────────────────────

export interface Occupancy {
    /** rentable units across the portfolio (a single-family property counts one) */
    units: number;
    /** units with a contract in force */
    occupied: number;
    /** occupied ÷ units × 100, null without units */
    pct: number | null;
    /** properties with at least one contract in force */
    propertiesWithLease: number;
}

/**
 * Units with a contract in force (stored ACTIVE / EXPIRING_SOON, the hubs' rule). A single-family property
 * counts one. A multi-unit property counts each unit named by a lease once, plus one per lease that names
 * no unit (saved before leases pointed to units, or on the whole building), never more than its units. A
 * property without a row cannot have leases yet.
 */
export function occupancyOf(entries: PropertyEntry[], leases: Array<Pick<LeaseWithDetails, "property_id" | "unit_id" | "status">>): Occupancy {
    const inForce = leases.filter(l => IN_FORCE.has(l.status));
    let units = 0;
    let occupied = 0;
    let propertiesWithLease = 0;
    for (const e of entries) {
        units += e.units;
        if (!e.id) continue;
        const mine = inForce.filter(l => l.property_id === e.id);
        if (mine.length === 0) continue;
        propertiesWithLease += 1;
        if (e.propertyType === "single") {
            occupied += 1;
            continue;
        }
        const named = new Set(mine.map(l => l.unit_id).filter((u): u is string => !!u));
        const unitless = mine.filter(l => !l.unit_id).length;
        occupied += Math.min(e.units, named.size + unitless);
    }
    return { units, occupied, pct: units > 0 ? r1((occupied / units) * 100) : null, propertiesWithLease };
}

// ── Income ───────────────────────────────────────────────────────────

export interface IncomeFigures {
    /** the newest ledger month among the properties, YYYY-MM */
    month: string | null;
    /** properties with a confirmed ledger month */
    withLedger: number;
    revenue: number;
    grossRent: number;
    netRent: number;
    /** the agencies' cut in the latest months */
    feeMonth: number;
    opex: number;
    noi: number;
    /** noi ÷ revenue × 100, null without revenue */
    margin: number | null;
    /** agency fees kept before crediting, all time: the potential saving of self-management */
    feeAllTime: number;
    fee12m: number;
}

export function incomeFigures(snapshots: DashboardIncomeSnapshot[]): IncomeFigures {
    const sum = (pick: (s: DashboardIncomeSnapshot) => number) => r2(snapshots.reduce((acc, s) => acc + pick(s), 0));
    const revenue = sum(s => s.revenue);
    const noi = sum(s => s.noi);
    return {
        month: snapshots.reduce<string | null>((m, s) => (m === null || s.month > m ? s.month : m), null),
        withLedger: snapshots.length,
        revenue,
        grossRent: sum(s => s.grossRent),
        netRent: sum(s => s.netRent),
        feeMonth: sum(s => s.feeAmount),
        opex: sum(s => s.opex),
        noi,
        margin: revenue > 0 ? r1((noi / revenue) * 100) : null,
        feeAllTime: sum(s => s.totalFee),
        fee12m: sum(s => s.fee12m),
    };
}

// ── Taxes ────────────────────────────────────────────────────────────

export interface TaxFigures {
    year: number;
    /** IPTU paid by the owner this year, in the month paid (the DRE's rule; no scope, so property + condominium once) */
    iptuLandlordYtd: number;
    /** IPTU the tenants paid this year */
    iptuTenantYtd: number;
    /** ITBI and other taxes paid by the owner this year */
    itbiOtherYtd: number;
    iptuLandlordAllTime: number;
    itbiAllTime: number;
    otherAllTime: number;
    /** properties with an IPTU row in the register */
    propertiesWithIptu: number;
}

export function taxFigures(rows: PropertyTax[], today: string): TaxFigures {
    const year = Number(today.slice(0, 4));
    const prefix = `${year}-`;
    const month = today.slice(0, 7);
    // January up to this month: an undated parcela sits in month i of the exercício, which may still be ahead
    const inYtd = (k: string) => k.startsWith(prefix) && k <= month;
    const ytd = (m: Map<string, number>) => r2([...m].filter(([k]) => inYtd(k)).reduce((acc, [, v]) => acc + v, 0));
    const totals = landlordTaxTotals(rows);
    return {
        year,
        iptuLandlordYtd: ytd(landlordIptuByMonth(rows)),
        iptuTenantYtd: r2(iptuByMonth(rows).filter(p => inYtd(p.key)).reduce((acc, p) => acc + p.inquilino, 0)),
        itbiOtherYtd: ytd(landlordTaxesByMonth(rows, ["ITBI", "OUTRO"])),
        iptuLandlordAllTime: totals.iptu,
        itbiAllTime: totals.itbi,
        otherAllTime: totals.other,
        propertiesWithIptu: new Set(rows.filter(r => r.kind === "IPTU").map(r => r.property_id)).size,
    };
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface DashboardRows {
    leases: LeaseRow[];
    tenants: TenantRow[];
    agents: AgentRow[];
    agencies: AgencyRow[];
    /** the rental properties only: the owner's own home or a relative's consumer unit is not a portfolio cost */
    energy: EnergyUnitRow[];
    water: WaterUnitRow[];
    condos: CondoRow[];
}

export function dashboardRows(view: DashboardView, today: string): DashboardRows {
    return {
        leases: summarizeLeases(view.leases ?? [], {}, today),
        tenants: view.tenants ? tenantRows(view.tenants.tenants, view.tenants.leases, today) : [],
        agents: view.agents ? agentRows(view.agents.agents, view.agents.leases, view.agents.tenants, today) : [],
        agencies: view.agencies ? agencyRows(view.agencies.agencies, view.agencies.leases, view.agencies.tenants, view.agencies.agents, today) : [],
        energy: energyRows(view.energy ?? [], today).filter(r => r.kind === "rental"),
        water: waterRows(view.water ?? [], today),
        condos: condoRows(view.condominiums ?? []),
    };
}

// ── Totals ───────────────────────────────────────────────────────────

export interface DashboardTotals {
    properties: { count: number; single: number; multi: number; solar: number; /** entries the wizard never sent to the API */ unlinked: number };
    occupancy: Occupancy;
    income: IncomeFigures;
    contracts: HubTotals;
    people: {
        /** distinct people (titular, co-tenants, occupants) on contracts in force */
        housed: number;
        tenants: TenantHubTotals;
    };
    jobs: {
        agents: AgentHubTotals;
        agencies: AgencyHubTotals;
        /** agencies with at least one contract in force */
        agenciesWithLeases: number;
    };
    energy: EnergyHubTotals | null;
    water: WaterHubTotals | null;
    condo: CondoHubTotals | null;
    /** the counts over every project; the money over the hub's slices, as the Projetos hub shows it */
    projects: { all: ProjectHubTotals; inProgress: ProjectHubTotals; sold: ProjectHubTotals } | null;
    taxes: TaxFigures | null;
}

export function dashboardTotals(view: DashboardView, today: string, rows: DashboardRows = dashboardRows(view, today)): DashboardTotals {
    const housed = new Set((view.tenants?.leases ?? []).filter(e => IN_FORCE.has(e.status)).map(e => e.tenant_id)).size;
    return {
        properties: {
            count: view.properties.length,
            single: view.properties.filter(p => p.propertyType === "single").length,
            multi: view.properties.filter(p => p.propertyType === "multi").length,
            solar: view.properties.filter(p => p.hasSolar).length,
            unlinked: view.properties.filter(p => !p.id).length,
        },
        occupancy: occupancyOf(view.properties, view.leases ?? []),
        income: incomeFigures(view.income),
        contracts: hubTotals(rows.leases, today),
        people: { housed, tenants: tenantHubTotals(rows.tenants) },
        jobs: { agents: agentHubTotals(rows.agents), agencies: agencyHubTotals(rows.agencies), agenciesWithLeases: rows.agencies.filter(r => r.inForce.length > 0).length },
        energy: view.energy ? energyHubTotals(rows.energy) : null,
        water: view.water ? waterHubTotals(rows.water) : null,
        condo: view.condominiums ? condoHubTotals(rows.condos) : null,
        projects: view.projects ? {
            all: projectHubTotals(view.projects.investments, view.projects.summaries),
            inProgress: projectHubTotals(view.projects.investments.filter(i => IN_PROGRESS_STATUSES.has(i.status)), view.projects.summaries),
            sold: projectHubTotals(view.projects.investments.filter(i => i.status === "SOLD"), view.projects.summaries),
        } : null,
        taxes: view.taxes ? taxFigures(view.taxes, today) : null,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type DashboardModule = "imoveis" | "contratos" | "inquilinos" | "corretores" | "imobiliaria" | "energia" | "agua" | "condominio" | "projetos" | "tributos";

/** Label, hub path (Portuguese; the client prefixes the language) and display order of each module. */
export const MODULE_META: Record<DashboardModule, { label: string; path: string; order: number }> = {
    imoveis: { label: "Imóveis", path: "/imoveis", order: 0 },
    contratos: { label: "Contratos", path: "/contratos", order: 1 },
    inquilinos: { label: "Inquilinos", path: "/inquilinos", order: 2 },
    corretores: { label: "Corretores", path: "/corretores", order: 3 },
    imobiliaria: { label: "Imobiliárias", path: "/imobiliaria", order: 4 },
    energia: { label: "Energia", path: "/dashboard/energy", order: 5 },
    agua: { label: "Água", path: "/dashboard/water", order: 6 },
    condominio: { label: "Condomínio", path: "/condominio", order: 7 },
    projetos: { label: "Projetos", path: "/projetos", order: 8 },
    tributos: { label: "Tributos", path: "/imoveis", order: 9 },
};

export type DashboardTone = "rose" | "amber" | "sky" | "emerald" | "slate";

export interface DashboardAttentionItem {
    module: DashboardModule;
    tone: DashboardTone;
    /** who or what the item is about */
    name: string;
    /** the sentence, without the name */
    text: string;
    date: string | null;
    /** where to act: the Portuguese path, the client prefixes the language */
    href: string;
}

const TONE_RANK: Record<DashboardTone, number> = { rose: 0, amber: 1, sky: 2, emerald: 3, slate: 4 };

/** Every module's attention list merged: act-now first, then soon, then arrivals, good news and idle data; modules in their order within a tone. */
export function dashboardAttention(view: DashboardView, today: string, rows: DashboardRows = dashboardRows(view, today)): DashboardAttentionItem[] {
    const items: DashboardAttentionItem[] = [];
    for (const it of attentionItems(rows.leases)) items.push({ module: "contratos", tone: it.tone, name: titleOf(it.row.lease), text: it.text, date: it.date, href: `/contratos?id=${it.row.lease.id}` });
    for (const it of tenantAttention(rows.tenants, today)) items.push({ module: "inquilinos", tone: it.tone, name: it.row.tenant.full_name, text: it.text, date: it.date, href: `/inquilinos?id=${it.row.tenant.id}` });
    for (const it of agentAttention(rows.agents)) items.push({ module: "corretores", tone: it.tone, name: it.row.agent.full_name, text: it.text, date: null, href: `/corretores?id=${it.row.agent.id}` });
    for (const it of agencyAttention(rows.agencies)) items.push({ module: "imobiliaria", tone: it.tone, name: it.row.displayName, text: it.text, date: null, href: `/imobiliaria?id=${it.row.agency.id}` });
    for (const it of energyAttention(rows.energy)) items.push({ module: "energia", tone: it.tone, name: it.row.unit.name, text: it.text, date: null, href: `/dashboard/energy/${it.row.unit.id}` });
    for (const it of waterAttention(rows.water)) items.push({ module: "agua", tone: it.tone, name: it.row.unit.name, text: it.text, date: null, href: `/dashboard/billing/${it.row.unit.id}` });
    for (const it of condoAttention(rows.condos)) items.push({ module: "condominio", tone: it.tone, name: it.row.condo.name, text: it.text, date: null, href: `/condominio?id=${it.row.condo.id}` });
    if (view.projects) {
        for (const inv of view.projects.investments) {
            if (inv.status !== "ACTIVE") continue;
            const s = view.projects.summaries[inv.id];
            if (!s) continue;
            if (s.overdueCount > 0) {
                items.push({ module: "projetos", tone: "rose", name: investmentTitle(inv), text: `${s.overdueCount} ${s.overdueCount === 1 ? "parcela em atraso" : "parcelas em atraso"}`, date: null, href: `/projetos?id=${inv.id}` });
            } else if (s.nextDueOn && daysBetween(today, s.nextDueOn) <= 7) {
                const days = daysBetween(today, s.nextDueOn);
                items.push({ module: "projetos", tone: "amber", name: investmentTitle(inv), text: `parcela de ${brl(s.nextDueAmount, 0)} ${days === 0 ? "vence hoje" : `vence em ${days} ${days === 1 ? "dia" : "dias"}`}`, date: s.nextDueOn, href: `/projetos?id=${inv.id}` });
            }
        }
    }
    return items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => TONE_RANK[a.item.tone] - TONE_RANK[b.item.tone] || MODULE_META[a.item.module].order - MODULE_META[b.item.module].order || a.i - b.i)
        .map(x => x.item);
}

/** True when the account has nothing registered yet: the dashboard shows the first steps instead of empty figures. */
export function isEmptyPortfolio(view: DashboardView): boolean {
    return view.properties.length === 0 && (view.leases?.length ?? 0) === 0 && (view.projects?.investments.length ?? 0) === 0 && (view.tenants?.tenants.length ?? 0) === 0;
}
