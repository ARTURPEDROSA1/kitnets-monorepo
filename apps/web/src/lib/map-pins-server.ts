/**
 * The map pins of an account: its rental properties, its live projects and the agencies with a contract in
 * force, paired with the geocode cache. Serves POST /api/geocode, which fills the cache for the addresses
 * still missing. (The dashboard used to draw these on its map; the map left the dashboard in its money-first
 * redesign and the pins stay here for whichever page shows them next.)
 */
import { loadAgencyList } from "@/lib/agency-views-server";
import type { AdminSupabase } from "@/lib/api-auth";
import { addressFromAgency, addressFromInvestment, attachGeocodes, type GeocodeMiss, type MapPin, type PinSource } from "@/lib/geocode";
import { googleGeocodingAvailable, readGeocodes } from "@/lib/geocode-server";
import { IN_FORCE, todayBRT } from "@/lib/lease-dashboard";
import { STRATEGY_LABELS, investmentTitle, type NewInvestment } from "@/lib/new-investments";
import { loadInvestmentList } from "@/lib/new-investments-server";
import { mappableProjects } from "@/lib/project-hub";
import { loadPropertyEntries, type PropertyEntry } from "@/lib/property-entries-server";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-type";
import type { AgencyLeaseSummary } from "@/lib/agency-views";
import type { AgencyWithRole } from "@/types/agency";

/** Paths are the Portuguese ones; the client prefixes the language (`/en`, `/es`). */
export function propertyPinSources(entries: PropertyEntry[]): PinSource[] {
    return entries.map(e => ({
        id: e.key,
        kind: "property",
        label: e.name,
        subtitle: e.propertyType === "multi" ? `${e.units} ${e.units === 1 ? "unidade" : "unidades"}` : PROPERTY_TYPE_LABELS[e.propertyType],
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
