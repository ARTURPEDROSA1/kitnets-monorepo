/**
 * The dashboard's bundle, built on the server: every module's own loader in parallel (the same ones the
 * hubs preload), the portfolio's latest ledger month per property, the taxes register, the gateways for
 * the pilot accounts, and the map pins paired with the geocode cache. A loader that fails is reported in
 * `failed` and its figures show as unavailable; the page never blanks. Shared by the page preload and
 * GET /api/dashboard; `loadMapPins` also serves POST /api/geocode.
 */
import { loadAgencyList } from "@/lib/agency-views-server";
import { loadAgentList } from "@/lib/agent-views-server";
import type { AdminSupabase } from "@/lib/api-auth";
import { loadCondominiumList } from "@/lib/condominium-views-server";
import type { DashboardGateway, DashboardIncomeSnapshot, DashboardLoader, DashboardView } from "@/lib/dashboard-views";
import { getOwnerPropertiesSummary } from "@/lib/energy-properties-server";
import { env } from "@/lib/env";
import { canSeeGateways } from "@/lib/gateways-access";
import { addressFromAgency, addressFromInvestment, attachGeocodes, type GeocodeMiss, type MapPin, type PinSource } from "@/lib/geocode";
import { googleGeocodingAvailable, readGeocodes } from "@/lib/geocode-server";
import { IN_FORCE, todayBRT } from "@/lib/lease-dashboard";
import { loadLeaseRows } from "@/lib/lease-views-server";
import { computeInvestmentMetrics, toCardSummary, type InvestmentCardSummary } from "@/lib/new-investment-metrics";
import { STRATEGY_LABELS, investmentTitle, type NewInvestment } from "@/lib/new-investments";
import { loadInvestmentList } from "@/lib/new-investments-server";
import { mappableProjects } from "@/lib/project-hub";
import { loadPropertyEntries, type PropertyEntry } from "@/lib/property-entries-server";
import { aggregateIncomeByMonth, breakdown, currentMonthKey, monthKey, summarize, type PropertyIncomeRow } from "@/lib/property-income";
import { landlordIptuForMonth, normalizeInstallments, taxScopeForProperty, type PropertyTax } from "@/lib/property-taxes";
import { loadTenantList } from "@/lib/tenant-views-server";
import { getOwnerWaterPropertiesSummary } from "@/lib/water-properties-server";
import type { AgencyLeaseSummary } from "@/lib/agency-views";
import type { AgencyWithRole } from "@/types/agency";

const TAX_COLUMNS = "id, property_id, year, kind, amount, paid_by, paid_on, installments";
const INCOME_COLUMNS = "id, property_id, month, unit_id, received_on, received_amount, energy_portion, other_income, other_expenses, condo_amount, fee_on_condo, iptu_amount, agency_fee_pct, status, source, bank_reference, notes";
/** A gateway is online when it reported in the last ten minutes. */
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Runs a loader, recording its failure instead of throwing. */
async function settle<T>(failed: DashboardLoader[], name: DashboardLoader, run: () => Promise<T>): Promise<T | null> {
    try {
        return await run();
    } catch (err) {
        console.error(`[Dashboard] ${name} failed:`, err);
        failed.push(name);
        return null;
    }
}

export async function loadTaxRowsByOwner(supabase: AdminSupabase, profileId: string): Promise<PropertyTax[]> {
    const { data, error } = await supabase.from("property_taxes").select(TAX_COLUMNS).eq("owner_id", profileId);
    if (error) throw new Error(`taxes: ${error.message}`);
    return ((data ?? []) as unknown as PropertyTax[]).map(t => ({ ...t, amount: Number(t.amount) || 0, installments: normalizeInstallments(t.installments) }));
}

/**
 * The latest confirmed ledger month per property (months after the current one ignored) with the
 * landlord's IPTU of that month as a cost, plus the all-time agency fee — the same figures the property
 * cards and the ledger show (GET /api/properties/income-summary).
 */
export async function loadIncomeSnapshots(supabase: AdminSupabase, profileId: string, entries: PropertyEntry[], taxes: PropertyTax[]): Promise<DashboardIncomeSnapshot[]> {
    const { data, error } = await supabase
        .from("property_income_months")
        .select(INCOME_COLUMNS)
        .eq("owner_id", profileId)
        .eq("status", "CONFIRMED")
        .lte("month", `${currentMonthKey()}-01`)
        .order("month", { ascending: false });
    if (error) throw new Error(`income: ${error.message}`);
    // a property with sub-units leaves its IPTU from 2025-01 to the condominium (the rule of GET /api/properties/income-summary)
    const multi = new Set(entries.filter(e => e.id && e.subUnitCount > 0).map(e => e.id as string));
    const taxesByProperty = new Map<string, PropertyTax[]>();
    for (const t of taxes) taxesByProperty.set(t.property_id, [...(taxesByProperty.get(t.property_id) ?? []), t]);
    const byProperty = new Map<string, PropertyIncomeRow[]>();
    for (const raw of (data ?? []) as unknown as PropertyIncomeRow[]) {
        const row: PropertyIncomeRow = {
            ...raw,
            received_amount: Number(raw.received_amount) || 0,
            energy_portion: Number(raw.energy_portion) || 0,
            other_income: Number(raw.other_income) || 0,
            other_expenses: Number(raw.other_expenses) || 0,
            condo_amount: Number(raw.condo_amount) || 0,
            iptu_amount: Number(raw.iptu_amount) || 0,
            agency_fee_pct: Number(raw.agency_fee_pct) || 0,
        };
        byProperty.set(row.property_id, [...(byProperty.get(row.property_id) ?? []), row]);
    }
    const snapshots: DashboardIncomeSnapshot[] = [];
    for (const [propertyId, list] of byProperty) {
        const monthly = aggregateIncomeByMonth(list).sort((x, y) => (x.month < y.month ? 1 : -1));
        const latest = monthly[0];
        if (!latest) continue;
        const b = breakdown(latest);
        const iptu = landlordIptuForMonth(taxesByProperty.get(propertyId) ?? [], monthKey(latest.month), taxScopeForProperty(multi.has(propertyId)));
        const all = summarize(list);
        snapshots.push({
            propertyId,
            month: monthKey(latest.month),
            revenue: r2(b.revenue),
            grossRent: r2(b.grossRent),
            netRent: r2(b.netRent),
            received: r2(b.received),
            feeAmount: r2(b.feeAmount),
            opex: r2(b.opex + iptu),
            noi: r2(b.noi - iptu),
            confirmedMonths: monthly.length,
            totalFee: all.totalFee,
            fee12m: all.fee12m,
        });
    }
    return snapshots;
}

/**
 * The account's gateways. The ingest API stamps `last_seen_at`; a gateway that never reported reads "Nunca".
 * (The old page fell back to the newest meter reading of any account, which leaked another owner's sync time.)
 */
async function loadGateways(supabase: AdminSupabase, profileId: string): Promise<DashboardGateway[]> {
    const { data, error } = await supabase.from("gateways").select("id, label, serial_number, status, last_seen_at, property_id").eq("owner_id", profileId).order("created_at", { ascending: true });
    if (error) throw new Error(`gateways: ${error.message}`);
    const now = Date.now();
    const rows = (data ?? []) as Array<{ id: string; label: string | null; serial_number: string; status: string | null; last_seen_at: string | null; property_id: string | null }>;
    return rows.map(gw => {
        const seen = gw.last_seen_at ? Date.parse(gw.last_seen_at) : NaN;
        return { id: gw.id, label: gw.label, serialNumber: gw.serial_number, status: gw.status, lastSeenAt: gw.last_seen_at, online: Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS, propertyId: gw.property_id };
    });
}

// ── Map ──────────────────────────────────────────────────────────────

/** Paths are the Portuguese ones; the client prefixes the language (`/en`, `/es`). */
export function propertyPinSources(entries: PropertyEntry[]): PinSource[] {
    return entries.map(e => ({
        id: e.key,
        kind: "property",
        label: e.name,
        subtitle: e.propertyType === "multi" ? `${e.units} ${e.units === 1 ? "unidade" : "unidades"}` : "Unifamiliar",
        address: e.address,
        href: e.id ? `/imoveis?id=${e.id}` : "/imoveis",
        cover: e.photos[0] ?? null,
    }));
}

export function projectPinSources(investments: NewInvestment[]): PinSource[] {
    return mappableProjects(investments).map(i => ({
        id: i.id,
        kind: "project",
        label: investmentTitle(i),
        subtitle: [STRATEGY_LABELS[i.strategy], i.developer].filter(Boolean).join(" · ") || null,
        address: addressFromInvestment(i),
        href: `/projetos?id=${i.id}`,
        cover: null,
    }));
}

/** The agencies with at least one contract in force. */
export function agencyPinSources(agencies: AgencyWithRole[], leases: AgencyLeaseSummary[]): PinSource[] {
    const inForce = new Map<string, number>();
    for (const l of leases) if (IN_FORCE.has(l.status)) inForce.set(l.agency_id, (inForce.get(l.agency_id) ?? 0) + 1);
    return agencies
        .filter(a => (inForce.get(a.id) ?? 0) > 0)
        .map(a => {
            const n = inForce.get(a.id) ?? 0;
            return {
                id: a.id,
                kind: "agency" as const,
                label: a.trade_name || a.name,
                subtitle: `${n} ${n === 1 ? "contrato em vigor" : "contratos em vigor"}`,
                address: addressFromAgency(a),
                href: `/imobiliaria?id=${a.id}`,
                cover: a.logo_url ?? null,
            };
        });
}

/** Reads the cache for the sources' keys and pairs them: the pins (located or not) and what is still to geocode. */
export async function pairPins(supabase: AdminSupabase, sources: PinSource[]): Promise<{ pins: MapPin[]; misses: GeocodeMiss[] }> {
    const today = todayBRT();
    const keys = [...new Set(attachGeocodes(sources, new Map(), { today, googleAvailable: false }).pins.map(p => p.addressKey))];
    const cache = await readGeocodes(supabase, keys);
    return attachGeocodes(sources, cache, { today, googleAvailable: googleGeocodingAvailable() });
}

/** The pins alone (what POST /api/geocode needs): the properties, the live projects and the agencies with contracts. */
export async function loadMapPins(supabase: AdminSupabase, profileId: string): Promise<{ pins: MapPin[]; misses: GeocodeMiss[] }> {
    const [entries, agencies, investments] = await Promise.all([
        loadPropertyEntries(supabase, profileId),
        loadAgencyList(supabase, profileId).catch(() => null),
        loadInvestmentList(supabase, profileId).catch(() => null),
    ]);
    const sources: PinSource[] = [
        ...propertyPinSources(entries.entries),
        ...projectPinSources(investments?.investments ?? []),
        ...agencyPinSources(agencies?.agencies ?? [], agencies?.leases ?? []),
    ];
    return pairPins(supabase, sources);
}

// ── The bundle ───────────────────────────────────────────────────────

export async function loadDashboard(supabase: AdminSupabase, profileId: string, userId: string): Promise<DashboardView> {
    const failed: DashboardLoader[] = [];
    // The energy loader creates the `properties` rows still missing for profile entries; the water loader
    // builds on it. They run one after the other on a single energy result: two concurrent runs would both
    // see the row missing and insert it twice.
    const energyThenWater = (async () => {
        const energy = await settle(failed, "energy", () => getOwnerPropertiesSummary(userId));
        const water = await settle(failed, "water", () => getOwnerWaterPropertiesSummary(userId, energy ?? undefined));
        return { energy, water };
    })();
    const [entriesResult, taxes, leases, tenants, agents, agencies, { energy, water }, condominiums, investments] = await Promise.all([
        settle(failed, "properties", () => loadPropertyEntries(supabase, profileId)),
        settle(failed, "taxes", () => loadTaxRowsByOwner(supabase, profileId)),
        settle(failed, "leases", () => loadLeaseRows(supabase, profileId)),
        settle(failed, "tenants", () => loadTenantList(supabase, profileId)),
        settle(failed, "agents", () => loadAgentList(supabase, profileId)),
        settle(failed, "agencies", () => loadAgencyList(supabase, profileId)),
        energyThenWater,
        settle(failed, "condominiums", () => loadCondominiumList(supabase, profileId)),
        settle(failed, "projects", () => loadInvestmentList(supabase, profileId)),
    ]);
    const entries = entriesResult?.entries ?? [];
    const profile = entriesResult?.profile ?? { fullName: null, email: null };

    // The projects' figures without signing their photos (the cards do that on their own hub).
    let projects: DashboardView["projects"] = null;
    if (investments) {
        const asOf = new Date();
        const summaries: Record<string, InvestmentCardSummary> = {};
        for (const inv of investments.investments) {
            const own = investments.schedules.filter(s => s.investment_id === inv.id);
            const ownPayments = investments.payments.filter(p => p.investment_id === inv.id);
            summaries[inv.id] = toCardSummary(inv.id, computeInvestmentMetrics(inv, own, ownPayments, asOf), investments.documentCounts.get(inv.id) ?? 0, []);
        }
        projects = { investments: investments.investments, summaries };
    }

    const showGateways = canSeeGateways(profile.email, env.GATEWAY_PILOT_EMAILS);
    const [income, gateways, map] = await Promise.all([
        settle(failed, "income", () => loadIncomeSnapshots(supabase, profileId, entries, taxes ?? [])),
        showGateways ? settle(failed, "gateways", () => loadGateways(supabase, profileId)) : Promise.resolve(null),
        settle(failed, "map", () => pairPins(supabase, [
            ...propertyPinSources(entries),
            ...projectPinSources(investments?.investments ?? []),
            ...agencyPinSources(agencies?.agencies ?? [], agencies?.leases ?? []),
        ])),
    ]);

    return {
        profile,
        properties: entries,
        income: income ?? [],
        leases,
        tenants,
        agents,
        agencies,
        energy,
        water,
        condominiums,
        projects,
        taxes,
        gateways: showGateways ? gateways ?? [] : null,
        map: { pins: map?.pins ?? [], pending: map?.misses.length ?? 0 },
        failed,
    };
}
