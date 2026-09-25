/**
 * The photos of the account's properties, keyed by `properties.id` — the cover carousel of the cards
 * that belong to a property (the condominiums, and anything else built on a property).
 *
 * Photos have no table of their own: they live in the owner's profile JSON — `property_photos` and
 * `profile_photo_url` (the chosen cover) for the first property, `additional_properties[].savedPhotos`
 * and `.profilePhotoUrl` for the rest — which the Imóveis page pairs with the `properties` rows by id
 * and, for the first property, by name (the same rules as the units, lib/property-units-server.ts).
 * The URLs are public (bucket property-media), so nothing needs signing.
 */
import type { AdminSupabase } from "@/lib/api-auth";

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const urls = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.length > 0) : []);

/** The cover first, then the rest, without repeats. */
export function orderPhotos(cover: unknown, photos: unknown, limit = 12): string[] {
    const list = urls(photos);
    const first = typeof cover === "string" && cover ? [cover] : [];
    return Array.from(new Set([...first, ...list])).slice(0, limit);
}

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/** Pairs the profile's entries with the property rows (oldest first) and reads each one's photos. */
export function pairPropertyPhotos(properties: { id: string; name: string }[], profile: Json): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const claimed = new Set<string>();

    const additional = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];
    for (const raw of additional) {
        const entry = asObject(raw);
        if (!entry) continue;
        const entryName = typeof asObject(entry.details)?.propertyName === "string" ? (asObject(entry.details)!.propertyName as string).trim().toLowerCase() : "";
        const row =
            properties.find(p => p.id === entry.id) ??
            properties.find(p => !claimed.has(p.id) && entryName !== "" && p.name.trim().toLowerCase() === entryName);
        if (!row) continue;
        claimed.add(row.id);
        result.set(row.id, orderPhotos(entry.profilePhotoUrl, entry.savedPhotos));
    }

    const primaryName = typeof asObject(profile.property_details)?.propertyName === "string"
        ? (asObject(profile.property_details)!.propertyName as string).trim().toLowerCase()
        : "";
    const free = properties.filter(p => !claimed.has(p.id));
    const primary = free.find(p => primaryName !== "" && p.name.trim().toLowerCase() === primaryName) ?? free[0];
    if (primary) result.set(primary.id, orderPhotos(profile.profile_photo_url, profile.property_photos));

    return result;
}

export async function loadPropertyPhotos(supabase: AdminSupabase, profileId: string): Promise<Map<string, string[]>> {
    const [{ data: rows }, { data }] = await Promise.all([
        supabase.from("properties").select("id, name, electronic_id").eq("owner_id", profileId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("property_details, property_photos, profile_photo_url, additional_properties").eq("id", profileId).maybeSingle(),
    ]);
    const properties = (rows || [])
        .filter(p => !isStandaloneUc(p.electronic_id))
        .map(p => ({ id: p.id as string, name: (p.name as string) || "" }));
    const profile = data as Json | null;
    if (!profile || properties.length === 0) return new Map();
    return pairPropertyPhotos(properties, profile);
}
