import type { AdminSupabase } from "@/lib/api-auth";

/**
 * The rentable units of the account's multi-unit properties, keyed by `properties.id`.
 *
 * Units have no table of their own: they live in the owner's profile JSON
 * (`sub_units` for the first property, `additional_properties[].subUnits` for
 * the rest), which the Imóveis page pairs with the `properties` rows by id and,
 * for the first property, by name. A lease points to one through `leases.unit_id`.
 */

export interface PropertyUnitOption {
    id: string;
    name: string;
}

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);

/** Units of one profile entry. Gives an id to any unit still without one; `changed` says it did. */
function readUnits(rawUnits: unknown): { units: PropertyUnitOption[]; stamped: unknown[]; changed: boolean } {
    const list = Array.isArray(rawUnits) ? rawUnits : [];
    let changed = false;
    const units: PropertyUnitOption[] = [];
    const stamped = list.map((raw, idx) => {
        const unit = asObject(raw);
        if (!unit) return raw;
        let id = typeof unit.id === "string" ? unit.id : "";
        if (!id) {
            id = crypto.randomUUID();
            changed = true;
        }
        const name = typeof unit.name === "string" && unit.name.trim() ? unit.name.trim() : `Unidade ${idx + 1}`;
        units.push({ id, name });
        return id === unit.id ? unit : { ...unit, id };
    });
    return { units, stamped, changed };
}

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

export async function loadPropertyUnits(supabase: AdminSupabase, profileId: string): Promise<Map<string, PropertyUnitOption[]>> {
    const [{ data: rows }, { data }] = await Promise.all([
        supabase.from("properties").select("id, name, electronic_id").eq("owner_id", profileId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("property_type, property_details, sub_units, additional_properties").eq("id", profileId).maybeSingle(),
    ]);
    // Standalone consumer units are energy-only records, not rentable properties
    const properties = (rows || [])
        .filter((p) => !isStandaloneUc(p.electronic_id))
        .map((p) => ({ id: p.id as string, name: (p.name as string) || "" }));
    const profile = data as Json | null;
    if (!profile || properties.length === 0) return new Map();

    const { units, update } = pairPropertyUnits(properties, profile);

    // Units saved by an older client have no id yet: keep the ones just handed out
    if (Object.keys(update).length > 0) {
        const { error } = await supabase.from("profiles").update(update).eq("id", profileId);
        if (error) console.error("[Property units] Could not store unit ids:", error.message);
    }

    return units;
}

/**
 * Pairs the profile's multi-unit entries with the property rows (oldest first).
 * `update` holds the profile columns that changed because a unit had no id yet.
 */
export function pairPropertyUnits(
    properties: { id: string; name: string }[],
    profile: Json
): { units: Map<string, PropertyUnitOption[]>; update: Json } {
    const result = new Map<string, PropertyUnitOption[]>();
    const update: Json = {};
    const claimed = new Set<string>();

    // Additional properties carry the row id
    const additional = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];
    let additionalChanged = false;
    const stampedAdditional = additional.map((raw) => {
        const entry = asObject(raw);
        if (!entry) return raw;
        const entryName = typeof asObject(entry.details)?.propertyName === "string" ? (asObject(entry.details)!.propertyName as string).trim().toLowerCase() : "";
        const row =
            properties.find((p) => p.id === entry.id) ??
            properties.find((p) => !claimed.has(p.id) && entryName !== "" && p.name.trim().toLowerCase() === entryName);
        if (row) claimed.add(row.id);
        if (entry.propertyType !== "multi") return raw;
        const { units, stamped, changed } = readUnits(entry.subUnits);
        if (row) result.set(row.id, units);
        if (!changed) return raw;
        additionalChanged = true;
        return { ...entry, subUnits: stamped };
    });
    if (additionalChanged) update.additional_properties = stampedAdditional;

    // The first property is paired by name, else with the oldest row left (as the Imóveis page does)
    if (profile.property_type === "multi") {
        const primaryName = typeof asObject(profile.property_details)?.propertyName === "string"
            ? (asObject(profile.property_details)!.propertyName as string).trim().toLowerCase()
            : "";
        const free = properties.filter((p) => !claimed.has(p.id));
        const row = free.find((p) => primaryName !== "" && p.name.trim().toLowerCase() === primaryName) ?? free[0];
        const { units, stamped, changed } = readUnits(profile.sub_units);
        if (row) result.set(row.id, units);
        if (changed) update.sub_units = stamped;
    }

    return { units: result, update };
}

/** The unit a lease names, or null when the property has no such unit. */
export async function findPropertyUnit(
    supabase: AdminSupabase,
    profileId: string,
    propertyId: string,
    unitId: string
): Promise<PropertyUnitOption | null> {
    const units = await loadPropertyUnits(supabase, profileId);
    return units.get(propertyId)?.find((u) => u.id === unitId) ?? null;
}
