/**
 * The account's rental properties as the Imóveis page sees them — the profile JSON entries (the first
 * property in `property_type` / `property_details` / `property_address` / `sub_units`, the rest in
 * `additional_properties[]`) paired with the `properties` rows by id and, for the first property, by name
 * (the same rules as the units and the photos, lib/property-units-server.ts / property-photos-server.ts).
 *
 * An entry without a row (a wizard that never reached the API) keeps `id: null`: it can be counted and put
 * on the map, but nothing in the ledgers or the leases can point to it yet.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { addressFromProfile, addressText, type AddressParts } from "@/lib/geocode";
import { orderPhotos } from "@/lib/property-photos-server";

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export interface PropertyEntry {
    /** `properties.id` when paired, else null */
    id: string | null;
    /** the id, or `profile:<index>` for an entry without a row — stable within one profile */
    key: string;
    /** 0 = the first property (the profile's own columns), 1.. = additional_properties[index - 1] */
    index: number;
    name: string;
    propertyType: "single" | "multi";
    /** rentable units: multi → max(numberOfUnits, subUnits, 1); single → 1 */
    units: number;
    /** the sub-units' ids (multi), the ones a lease can point to */
    unitIds: string[];
    /** sub-units registered (multi; 0 for single): a property with sub-units leaves its IPTU from 2025-01 to the condominium (TaxScope) */
    subUnitCount: number;
    address: AddressParts;
    addressText: string;
    /** the chosen cover, then the other photos */
    photos: string[];
    hasSolar: boolean;
    isSaved: boolean;
}

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

function unitIdsOf(raw: unknown): string[] {
    return (Array.isArray(raw) ? raw : []).map(u => str(asObject(u)?.id)).filter(Boolean);
}

function entryOf(args: { id: string | null; index: number; type: unknown; details: Json | null; address: Json | null; subUnits: unknown; cover: unknown; photos: unknown; isSaved: boolean }): PropertyEntry {
    const propertyType: "single" | "multi" = args.type === "multi" ? "multi" : "single";
    const subUnits = Array.isArray(args.subUnits) ? args.subUnits : [];
    const declared = Number(args.details?.numberOfUnits) || 0;
    const address = addressFromProfile(args.address);
    const name = str(args.details?.propertyName) || [address.street, address.number].filter(Boolean).join(", ") || `Imóvel ${args.index + 1}`;
    return {
        id: args.id,
        key: args.id ?? `profile:${args.index}`,
        index: args.index,
        name,
        propertyType,
        units: propertyType === "multi" ? Math.max(declared, subUnits.length, 1) : 1,
        unitIds: propertyType === "multi" ? unitIdsOf(subUnits) : [],
        subUnitCount: propertyType === "multi" ? subUnits.filter(u => asObject(u)).length : 0,
        address,
        addressText: addressText(address),
        photos: orderPhotos(args.cover, args.photos),
        hasSolar: args.details?.solarEnergy === true,
        isSaved: args.isSaved,
    };
}

/**
 * Pairs the profile's entries with the property rows (oldest first). Additional entries claim a row by id,
 * then by name; the first property claims a row by name, else the oldest row still free. An entry that is
 * not "real" (no name and no street) is skipped, as the Energia loader does.
 */
export function pairPropertyEntries(properties: { id: string; name: string }[], profile: Json): PropertyEntry[] {
    const entries: PropertyEntry[] = [];
    const claimed = new Set<string>();

    const additional = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];
    additional.forEach((raw, i) => {
        const entry = asObject(raw);
        if (!entry) return;
        const details = asObject(entry.details);
        const address = asObject(entry.address);
        if (!str(details?.propertyName) && !str(address?.street)) return;
        const entryName = str(details?.propertyName).toLowerCase();
        const row =
            properties.find(p => p.id === entry.id) ??
            properties.find(p => !claimed.has(p.id) && entryName !== "" && p.name.trim().toLowerCase() === entryName);
        if (row) claimed.add(row.id);
        entries.push(entryOf({ id: row?.id ?? null, index: i + 1, type: entry.propertyType, details, address, subUnits: entry.subUnits, cover: entry.profilePhotoUrl, photos: entry.savedPhotos, isSaved: entry.isSavedProperty === true }));
    });

    const primaryDetails = asObject(profile.property_details);
    const primaryAddress = asObject(profile.property_address);
    const hasRealPrimary = !!profile.property_type && (str(primaryDetails?.propertyName) !== "" || str(primaryAddress?.street) !== "");
    if (hasRealPrimary) {
        const primaryName = str(primaryDetails?.propertyName).toLowerCase();
        const free = properties.filter(p => !claimed.has(p.id));
        const primary = free.find(p => primaryName !== "" && p.name.trim().toLowerCase() === primaryName) ?? free[0];
        entries.unshift(entryOf({ id: primary?.id ?? null, index: 0, type: profile.property_type, details: primaryDetails, address: primaryAddress, subUnits: profile.sub_units, cover: profile.profile_photo_url, photos: profile.property_photos, isSaved: true }));
    }
    return entries;
}

export interface PropertyEntriesResult {
    entries: PropertyEntry[];
    profile: { fullName: string | null; email: string | null };
}

export async function loadPropertyEntries(supabase: AdminSupabase, profileId: string): Promise<PropertyEntriesResult> {
    const [{ data: rows, error: rowsError }, { data, error }] = await Promise.all([
        supabase.from("properties").select("id, name, electronic_id").eq("owner_id", profileId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("full_name, email, property_type, property_details, property_address, sub_units, property_photos, profile_photo_url, additional_properties").eq("id", profileId).maybeSingle(),
    ]);
    if (rowsError) throw new Error(`properties: ${rowsError.message}`);
    if (error) throw new Error(`profile: ${error.message}`);
    const properties = (rows || [])
        .filter(p => !isStandaloneUc(p.electronic_id))
        .map(p => ({ id: p.id as string, name: (p.name as string) || "" }));
    const profile = (data ?? {}) as Json;
    return {
        entries: pairPropertyEntries(properties, profile),
        // the e-mail as stored (lowercased, not trimmed): the gateway pilot gate compares it exactly
        profile: { fullName: str(profile.full_name) || null, email: typeof profile.email === "string" && profile.email ? profile.email.toLowerCase() : null },
    };
}
