/**
 * Every property of the owner's profile JSON has its `properties` row, linked by id.
 *
 * The Imóveis wizard saves a property in the profile only (`property_details` / `property_address` for
 * the first one, `additional_properties[]` for the rest); leases, tenants, bills and ledgers point to
 * `properties` rows. Whatever lists the account's properties calls this first; the Imóveis page calls it
 * after saving (POST /api/properties/sync) and takes the ids it returns.
 *
 * Each entry carries its row id (lib/property-link.ts). An entry without a row gets one, and an entry paired
 * the old way (by name) gets its id stamped, through the database function link_profile_property_row
 * (per-owner lock: readers running at the same time never create a row twice). The rows follow the profile:
 * a renamed property, or a new address, is renamed on its row, so Energia, Contratos and Água show it too.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { linkPropertyRows, propertyRowAddress, UUID_RE, type PropertyLink, type ProfilePropertyRef } from "@/lib/property-link";

type Json = Record<string, unknown>;

export interface WantedPropertyRow {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
}

interface Row {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    electronic_id?: unknown;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function isStandaloneUc(electronicId: unknown): boolean {
    if (!electronicId) return false;
    try {
        return !!JSON.parse(electronicId as string).isStandaloneUc;
    } catch {
        return false;
    }
}

/** The row an entry should have: its name and address, as the energy loader always wrote them. */
export function wantedRowOf(ref: ProfilePropertyRef): WantedPropertyRow {
    return {
        name: ref.name,
        address: propertyRowAddress(ref.address),
        city: text(ref.address?.city) || null,
        state: text(ref.address?.state) || null,
        zip: text(ref.address?.cep) || null,
    };
}

const PROFILE_COLUMNS = "property_type, property_details, property_address, additional_properties";
const ROW_COLUMNS = "id, name, address, city, state, zip, electronic_id";

export interface PropertyRowsSync {
    /** rows created or changed (renamed, new address): a caller holding the rows reads them again */
    changed: number;
    /** each profile property and its row (null when it could not get one) */
    links: PropertyLink[];
}

const missingFunction = (error: { code?: string; message?: string }) =>
    error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");

/**
 * Links every profile property to its row, creating and stamping what is missing, and brings the rows'
 * names and addresses in line with the profile. Never throws: a failure is logged and the caller reads
 * whatever rows there are.
 */
export async function syncPropertyRows(
    supabase: AdminSupabase,
    profileId: string,
    preloaded: { profile?: Json | null; rows?: Row[] } = {},
): Promise<PropertyRowsSync> {
    try {
        const [profile, rows] = await Promise.all([
            preloaded.profile !== undefined
                ? Promise.resolve(preloaded.profile)
                : supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", profileId).maybeSingle().then(r => (r.data as Json | null) ?? null),
            preloaded.rows !== undefined
                ? Promise.resolve(preloaded.rows)
                : supabase.from("properties").select(ROW_COLUMNS).eq("owner_id", profileId).order("created_at", { ascending: true }).then(r => (r.data ?? []) as Row[]),
        ]);
        if (!profile) return { changed: 0, links: [] };
        const rental = rows.filter(r => !isStandaloneUc(r.electronic_id));
        const standaloneIds = new Set(rows.filter(r => isStandaloneUc(r.electronic_id)).map(r => r.id));
        const links = linkPropertyRows(rental.map(r => ({ id: r.id, name: String(r.name ?? ""), address: r.address ?? null })), profile);

        let changed = 0;
        for (const link of links) {
            // linked by its id, or nothing to name a new row by
            if (link.by === "id" || !link.ref.name) continue;
            const stored = link.ref.storedId;
            // the row to stamp: the one paired by name / address; else the entry's own id (its row is gone and is
            // created again with it) unless that id is another entry's, a consumer unit's, or not an id at all
            const ownIdUsable = !!stored && UUID_RE.test(stored) && !standaloneIds.has(stored) && !links.some(o => o !== link && o.rowId === stored);
            const rowId = link.rowId ?? (ownIdUsable ? stored : null);
            const want = wantedRowOf(link.ref);
            const { data, error } = await supabase.rpc("link_profile_property_row", {
                p_owner_id: profileId,
                p_slot: link.ref.slot,
                p_expected_stored: stored,
                p_row_id: rowId,
                p_name: want.name,
                p_address: want.address,
                p_city: want.city,
                p_state: want.state,
                p_zip: want.zip,
            });
            if (error) {
                // code deployed before its migration: the rows wait for the function (never by name again)
                if (missingFunction(error)) {
                    console.warn("[Property rows] link_profile_property_row not deployed yet");
                    break;
                }
                console.error("[Property rows] link_profile_property_row failed:", error.message);
                continue;
            }
            if (typeof data !== "string") continue; // the profile changed meanwhile: the next reader links it
            if (!link.rowId) changed++;
            link.rowId = data;
        }

        // the rows follow the profile (only rows linked by their id: a row paired by name already has the name)
        for (const link of links) {
            if (link.by !== "id" || !link.rowId || !link.ref.name) continue;
            const row = rental.find(r => r.id === link.rowId);
            if (!row) continue;
            const want = wantedRowOf(link.ref);
            const patch: Partial<WantedPropertyRow> = {};
            if (text(row.name) !== want.name) patch.name = want.name;
            if (want.address && text(row.address) !== want.address) patch.address = want.address;
            if (want.city && text(row.city) !== want.city) patch.city = want.city;
            if (want.state && text(row.state) !== want.state) patch.state = want.state;
            if (want.zip && text(row.zip) !== want.zip) patch.zip = want.zip;
            if (Object.keys(patch).length === 0) continue;
            const { error } = await supabase.from("properties").update(patch).eq("id", row.id).eq("owner_id", profileId);
            if (error) console.error("[Property rows] row update failed:", error.message);
            else changed++;
        }
        return { changed, links };
    } catch (err) {
        console.error("[Property rows] sync failed:", (err as Error).message);
        return { changed: 0, links: [] };
    }
}

/** syncPropertyRows for callers that only need the rows in place; → how many rows were created or changed. */
export async function ensurePropertyRows(
    supabase: AdminSupabase,
    profileId: string,
    preloaded: { profile?: Json | null; rows?: Row[] } = {},
): Promise<number> {
    return (await syncPropertyRows(supabase, profileId, preloaded)).changed;
}
