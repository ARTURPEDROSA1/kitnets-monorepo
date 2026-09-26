/**
 * The geocode cache (table `geocodes`, service-role only) and the two geocoders behind it: Google's
 * Geocoding API when GOOGLE_MAPS_SERVER_KEY is set, else BrasilAPI's CEP coordinates (free, no key,
 * CEP-level precision). Positive results are permanent; a negative one is retried after 30 days; a BrasilAPI
 * result is upgraded the first time a Google key is available (lib/geocode.ts, attachGeocodes).
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { env } from "@/lib/env";
import type { GeocodeHit, GeocodeMiss } from "@/lib/geocode";

export const GEOCODES_TABLE = "geocodes";
/** Addresses geocoded per request: the map fills up over a couple of loads on a large portfolio. */
export const GEOCODE_BATCH = 25;

export const googleGeocodingAvailable = (): boolean => Boolean(env.GOOGLE_MAPS_SERVER_KEY);

export async function readGeocodes(supabase: AdminSupabase, keys: string[]): Promise<Map<string, GeocodeHit>> {
    const map = new Map<string, GeocodeHit>();
    if (keys.length === 0) return map;
    const { data, error } = await supabase.from(GEOCODES_TABLE).select("address_key, lat, lng, location_type, provider, fetched_at").in("address_key", keys);
    if (error) throw new Error(`geocodes: ${error.message}`);
    for (const row of (data ?? []) as Array<{ address_key: string; lat: number | string | null; lng: number | string | null; location_type: string | null; provider: string | null; fetched_at: string }>) {
        const lat = row.lat === null ? null : Number(row.lat);
        const lng = row.lng === null ? null : Number(row.lng);
        map.set(row.address_key, {
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            precision: row.location_type ?? null,
            provider: row.provider ?? "google",
            fetchedAt: String(row.fetched_at),
        });
    }
    return map;
}

interface GeocodeResult {
    lat: number | null;
    lng: number | null;
    locationType: string | null;
    formatted: string | null;
    provider: "google" | "brasilapi";
}

const nothing = (provider: GeocodeResult["provider"]): GeocodeResult => ({ lat: null, lng: null, locationType: null, formatted: null, provider });

/** Null = the service could not be asked (network, quota, denied): nothing is written and the address is retried next time. */
async function geocodeWithGoogle(query: string, key: string): Promise<GeocodeResult | null> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("components", "country:BR");
    url.searchParams.set("key", key);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
        console.error("[Geocode] Google HTTP", res.status);
        return null;
    }
    const json = (await res.json()) as { status?: string; error_message?: string; results?: Array<{ geometry?: { location?: { lat?: number; lng?: number }; location_type?: string }; formatted_address?: string }> };
    if (json.status === "OK" && json.results?.[0]?.geometry?.location) {
        const r = json.results[0];
        const lat = Number(r.geometry?.location?.lat);
        const lng = Number(r.geometry?.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return nothing("google");
        return { lat, lng, locationType: r.geometry?.location_type ?? null, formatted: r.formatted_address ?? null, provider: "google" };
    }
    if (json.status === "ZERO_RESULTS") return nothing("google");
    console.error("[Geocode] Google:", json.status, json.error_message ?? "");
    return null;
}

async function geocodeWithBrasilApi(cep: string): Promise<GeocodeResult | null> {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { cache: "no-store" });
    if (res.status === 404) return nothing("brasilapi");
    if (!res.ok) {
        console.error("[Geocode] BrasilAPI HTTP", res.status);
        return null;
    }
    const json = (await res.json()) as { street?: string; neighborhood?: string; city?: string; state?: string; location?: { coordinates?: { latitude?: string | number; longitude?: string | number } } };
    const lat = Number(json.location?.coordinates?.latitude);
    const lng = Number(json.location?.coordinates?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return { lat, lng, locationType: "CEP", formatted: [json.street, json.neighborhood, json.city, json.state].filter(Boolean).join(", ") || null, provider: "brasilapi" };
    }
    return nothing("brasilapi");
}

/**
 * Geocodes up to `max` misses and writes them to the cache. Returns how many rows were written. An address
 * that no provider can be asked about (no Google key and no CEP) is written as a negative BrasilAPI row, so
 * it is retried after 30 days or as soon as a Google key exists, instead of on every load.
 */
export async function geocodeMissing(supabase: AdminSupabase, misses: GeocodeMiss[], max = GEOCODE_BATCH): Promise<number> {
    const key = env.GOOGLE_MAPS_SERVER_KEY;
    const batch = misses.slice(0, max);
    if (batch.length === 0) return 0;
    const settled = await Promise.allSettled(batch.map(async (m): Promise<{ m: GeocodeMiss; r: GeocodeResult } | null> => {
        const r = key ? await geocodeWithGoogle(m.query, key) : m.cep ? await geocodeWithBrasilApi(m.cep) : nothing("brasilapi");
        if (!r) return null;
        // An upgrade Google could not improve keeps the CEP position (recorded as Google's answer, so it is not asked again)
        if (r.lat === null && m.keep) return { m, r: { ...r, lat: m.keep.lat, lng: m.keep.lng, locationType: "CEP" } };
        return { m, r };
    }));
    const now = new Date().toISOString();
    const rows = settled.flatMap(x => (x.status === "fulfilled" && x.value ? [x.value] : [])).map(({ m, r }) => ({
        address_key: m.key,
        query: m.query,
        lat: r.lat,
        lng: r.lng,
        location_type: r.locationType,
        formatted: r.formatted,
        provider: r.provider,
        fetched_at: now,
    }));
    for (const x of settled) if (x.status === "rejected") console.error("[Geocode] lookup failed:", x.reason);
    if (rows.length === 0) return 0;
    const { error } = await supabase.from(GEOCODES_TABLE).upsert(rows, { onConflict: "address_key" });
    if (error) {
        console.error("[Geocode] cache write failed:", error.message);
        return 0;
    }
    return rows.length;
}
