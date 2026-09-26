/**
 * The dashboard map's addresses. One normalized key per address (the `geocodes` cache is keyed by it, not
 * by entity: see supabase/migrations/20260925190000_geocodes.sql), the query sent to the geocoder, the
 * adapters from each register's address shape, and the pins built from the account's rental properties,
 * live projects and the agencies with a contract in force.
 *
 * Pure: the loaders read the cache and the route fills it (lib/geocode-server.ts). Nothing here touches
 * the network.
 */
import { normalizeText } from "@/lib/lease-extract";

export interface AddressParts {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    country?: string | null;
}

/** The CEP as its eight digits, or "" */
export const cepDigits = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "").slice(0, 8);

/** Lowercase, accent-free, single-spaced. */
const clean = (v: string | null | undefined): string => normalizeText((v ?? "").trim()).replace(/\s+/g, " ").trim();
const text = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * The cache key of an address: lowercase, accent-free parts joined in a fixed order, the CEP as digits,
 * the country defaulting to Brazil. Null when there is nothing to geocode (no street, no city, no CEP).
 */
export function normalizeAddressKey(p: AddressParts): string | null {
    const street = clean(p.street);
    const city = clean(p.city);
    const cep = cepDigits(p.cep);
    if (!street && !city && !cep) return null;
    return [street, clean(p.number), clean(p.neighborhood), city, clean(p.state), cep, clean(p.country) || "br"].join("|");
}

/** "Rua X, 12, Centro, Florianópolis - SC, 88015-200, Brasil": what the geocoder receives. */
export function geocodeQuery(p: AddressParts): string {
    const cep = cepDigits(p.cep);
    const line = [text(p.street), text(p.number)].filter(Boolean).join(", ");
    const cityState = [text(p.city), text(p.state).toUpperCase()].filter(Boolean).join(" - ");
    return [line || null, text(p.neighborhood) || null, cityState || null, cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null, "Brasil"].filter(Boolean).join(", ");
}

/** "Rua X, 12 · Centro · Florianópolis/SC": what the owner reads. */
export function addressText(p: AddressParts): string {
    const line = [text(p.street), text(p.number)].filter(Boolean).join(", ");
    const cityState = [text(p.city), text(p.state).toUpperCase()].filter(Boolean).join("/");
    return [line || null, text(p.neighborhood) || null, cityState || null].filter(Boolean).join(" · ");
}

// ── Adapters ─────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The address object of a property in the profile JSON ({ cep, street, number, city, state, neighborhood, complement }). */
export function addressFromProfile(a: Record<string, unknown> | null | undefined): AddressParts {
    if (!a) return {};
    return { street: str(a.street), number: str(a.number), neighborhood: str(a.neighborhood), city: str(a.city), state: str(a.state), cep: str(a.cep) };
}

/** An agency row (every column NOT NULL except the complement). */
export function addressFromAgency(a: { postal_code: string | null; street: string | null; street_number: string | null; neighborhood: string | null; city: string | null; state: string | null; country?: string | null }): AddressParts {
    return { street: str(a.street), number: str(a.street_number), neighborhood: str(a.neighborhood), city: str(a.city), state: str(a.state), cep: str(a.postal_code), country: str(a.country) };
}

/** A project: `address` is the one line "street, number - neighborhood" that addressLine() builds, or whatever was typed. */
export function addressFromInvestment(i: { address: string | null; city: string | null; state: string | null; zip: string | null }): AddressParts {
    const [line, ...rest] = (i.address ?? "").split(" - ");
    const neighborhood = rest.join(" - ").trim() || null;
    const m = /^(.*?),\s*([^,]*)$/.exec(line.trim());
    const street = m ? m[1].trim() : line.trim();
    const number = m ? m[2].trim() : null;
    return { street: street || null, number: number || null, neighborhood, city: str(i.city), state: str(i.state), cep: str(i.zip) };
}

// ── Pins ─────────────────────────────────────────────────────────────

export type MapPinKind = "property" | "project" | "agency";

export const PIN_KIND_META: Record<MapPinKind, { label: string; plural: string; color: string; border: string }> = {
    property: { label: "Imóvel", plural: "Imóveis", color: "#059669", border: "#065f46" },
    project: { label: "Projeto", plural: "Projetos", color: "#d97706", border: "#92400e" },
    agency: { label: "Imobiliária", plural: "Imobiliárias", color: "#7c3aed", border: "#4c1d95" },
};

/** What goes on the map before the cache is consulted. */
export interface PinSource {
    id: string;
    kind: MapPinKind;
    label: string;
    subtitle: string | null;
    address: AddressParts;
    href: string;
    cover: string | null;
}

export interface MapPin extends Omit<PinSource, "address"> {
    addressKey: string;
    addressText: string;
    query: string;
    lat: number | null;
    lng: number | null;
    /** Google's location_type (ROOFTOP…), "CEP" for a CEP-level position, null when not located */
    precision: string | null;
}

export interface GeocodeHit {
    lat: number | null;
    lng: number | null;
    precision: string | null;
    provider: string;
    /** ISO timestamp */
    fetchedAt: string;
}

export interface GeocodeMiss {
    key: string;
    query: string;
    cep: string | null;
    /** the CEP-level position already known: kept when the better geocoder finds nothing */
    keep: { lat: number; lng: number } | null;
}

/** A negative result is asked again after this many days. */
export const NEGATIVE_RETRY_DAYS = 30;

const daysSince = (iso: string, today: string): number => {
    const a = Date.parse(iso.slice(0, 10));
    const b = Date.parse(today);
    return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86_400_000) : Number.POSITIVE_INFINITY;
};

/**
 * Pairs the sources with the cache. Sources without a usable address are dropped; the others become pins
 * (with coordinates when cached) and the keys still to geocode come back as `misses`: never cached, a
 * negative result older than 30 days, or a BrasilAPI (CEP-level) answer that a Google key can now improve —
 * in which case the known position travels along (`keep`) so a Google "nothing found" never erases it.
 */
export function attachGeocodes(sources: PinSource[], cache: Map<string, GeocodeHit>, opts: { today: string; googleAvailable: boolean }): { pins: MapPin[]; misses: GeocodeMiss[] } {
    const pins: MapPin[] = [];
    const misses = new Map<string, GeocodeMiss>();
    for (const s of sources) {
        const key = normalizeAddressKey(s.address);
        if (!key) continue;
        const hit = cache.get(key);
        const located = !!hit && hit.lat !== null && hit.lng !== null;
        const retry = !!hit && !located && daysSince(hit.fetchedAt, opts.today) >= NEGATIVE_RETRY_DAYS;
        const better = !!hit && hit.provider !== "google" && opts.googleAvailable;
        if (!hit || retry || better) {
            const cep = cepDigits(s.address.cep);
            misses.set(key, { key, query: geocodeQuery(s.address), cep: cep.length === 8 ? cep : null, keep: located && better ? { lat: hit.lat as number, lng: hit.lng as number } : null });
        }
        pins.push({
            id: s.id, kind: s.kind, label: s.label, subtitle: s.subtitle, href: s.href, cover: s.cover,
            addressKey: key, addressText: addressText(s.address), query: geocodeQuery(s.address),
            lat: hit?.lat ?? null, lng: hit?.lng ?? null, precision: hit?.precision ?? null,
        });
    }
    return { pins, misses: [...misses.values()] };
}

/**
 * Pins that share a position (a CEP-level answer covers a whole street or town; two registers can share a
 * building) are spread on a small circle around it, so each marker can be seen and clicked once zoomed in.
 * `radius` is in degrees of latitude (0.0002° ≈ 22 m); longitude is scaled by the latitude.
 */
export function spreadOverlapping<T extends { lat: number | null; lng: number | null }>(pins: T[], radius = 0.0002): T[] {
    const groups = new Map<string, number[]>();
    pins.forEach((p, i) => {
        if (p.lat === null || p.lng === null) return;
        const k = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
        groups.set(k, [...(groups.get(k) ?? []), i]);
    });
    const out = pins.slice();
    for (const idxs of groups.values()) {
        if (idxs.length < 2) continue;
        idxs.forEach((i, n) => {
            const p = pins[i];
            const lat = p.lat as number;
            const angle = (2 * Math.PI * n) / idxs.length;
            const lngScale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
            out[i] = { ...p, lat: lat + radius * Math.sin(angle), lng: (p.lng as number) + radius * lngScale * Math.cos(angle) };
        });
    }
    return out;
}

/** The bounds of the located pins, or null. */
export function pinBounds(pins: Array<Pick<MapPin, "lat" | "lng">>): { north: number; south: number; east: number; west: number } | null {
    const located = pins.filter((p): p is Pick<MapPin, "lat" | "lng"> & { lat: number; lng: number } => p.lat !== null && p.lng !== null);
    if (located.length === 0) return null;
    return {
        north: Math.max(...located.map(p => p.lat)),
        south: Math.min(...located.map(p => p.lat)),
        east: Math.max(...located.map(p => p.lng)),
        west: Math.min(...located.map(p => p.lng)),
    };
}
