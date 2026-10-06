/**
 * Every property of the owner's profile JSON has its `properties` row.
 *
 * The Imóveis wizard saves a property in the profile only (`property_details` / `property_address` for
 * the first one, `additional_properties[]` for the rest); leases, tenants, bills and ledgers point to
 * `properties` rows. The row used to appear only when the energy loader ran, so a new property was
 * missing from Contratos and Inquilinos until the owner opened Energia. Whatever lists the account's
 * properties calls this first; the Imóveis page calls it after saving (POST /api/properties/sync).
 *
 * Rows are named as the energy loader always named them, and created through the database function
 * ensure_property_row (per-owner lock), so readers running at the same time never create one twice.
 */
import type { AdminSupabase } from "@/lib/api-auth";

type Json = Record<string, unknown>;

export interface WantedPropertyRow {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
}

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

function rowOf(name: string, address: Json | null): WantedPropertyRow {
    const street = text(address?.street);
    return {
        name,
        address: street ? `${street}, ${text(address?.number)} - ${text(address?.neighborhood)}`.trim() : null,
        city: text(address?.city) || null,
        state: text(address?.state) || null,
        zip: text(address?.cep) || null,
    };
}

/** The rows the profile's properties should have, named as the energy loader names them. */
export function wantedPropertyRows(profile: Json): WantedPropertyRow[] {
    const out: WantedPropertyRow[] = [];
    const primaryDetails = asObject(profile.property_details);
    const primaryAddress = asObject(profile.property_address);
    const primaryName = text(primaryDetails?.propertyName);
    const primaryStreet = text(primaryAddress?.street);
    if (primaryName || primaryStreet) {
        const name = primaryName || `${primaryStreet}, ${text(primaryAddress?.number)}`.trim();
        out.push(rowOf(name, primaryAddress));
    }
    for (const raw of Array.isArray(profile.additional_properties) ? profile.additional_properties : []) {
        const entry = asObject(raw);
        if (!entry) continue;
        const address = asObject(entry.address);
        const street = text(address?.street);
        const name = text(asObject(entry.details)?.propertyName) || (street ? `${street}, ${text(address?.number)}`.trim() : "");
        if (name) out.push(rowOf(name, address));
    }
    return out;
}

const PROFILE_COLUMNS = "property_details, property_address, additional_properties";

/**
 * Creates the rows the profile's properties are missing; → how many it created (0 when none was).
 * Never throws: a failure is logged and the caller reads whatever rows there are.
 */
export async function ensurePropertyRows(
    supabase: AdminSupabase,
    profileId: string,
    preloaded: { profile?: Json | null; rows?: { name: string; electronic_id?: unknown }[] } = {},
): Promise<number> {
    try {
        const [profile, rows] = await Promise.all([
            preloaded.profile !== undefined
                ? Promise.resolve(preloaded.profile)
                : supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", profileId).maybeSingle().then(r => (r.data as Json | null) ?? null),
            preloaded.rows !== undefined
                ? Promise.resolve(preloaded.rows)
                : supabase.from("properties").select("name, electronic_id").eq("owner_id", profileId).then(r => (r.data ?? []) as { name: string; electronic_id?: unknown }[]),
        ]);
        if (!profile) return 0;
        const have = new Set(rows.filter(r => !isStandaloneUc(r.electronic_id)).map(r => String(r.name ?? "").trim().toLowerCase()));
        const missing = wantedPropertyRows(profile).filter((w, i, all) => {
            const key = w.name.toLowerCase();
            return !have.has(key) && all.findIndex(o => o.name.toLowerCase() === key) === i;
        });
        let created = 0;
        for (const w of missing) {
            const { error } = await supabase.rpc("ensure_property_row", { p_owner_id: profileId, p_name: w.name, p_address: w.address, p_city: w.city, p_state: w.state, p_zip: w.zip });
            if (!error) {
                created++;
                continue;
            }
            // the function not deployed yet (code before migration): insert as the energy loader did
            if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) {
                const { error: insertError } = await supabase.from("properties").insert({ owner_id: profileId, name: w.name, address: w.address, city: w.city, state: w.state, zip: w.zip });
                if (!insertError) created++;
                else console.error("[Property rows] insert failed:", insertError.message);
            } else {
                console.error("[Property rows] ensure_property_row failed:", error.message);
            }
        }
        return created;
    } catch (err) {
        console.error("[Property rows] sync failed:", (err as Error).message);
        return 0;
    }
}
