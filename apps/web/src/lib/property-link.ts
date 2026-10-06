/**
 * Which `properties` row each Imóveis property is.
 *
 * The Imóveis page keeps the properties in the profile JSON (the first one in `property_type` /
 * `property_details` / `property_address`, the rest in `additional_properties[]`); leases, tenants, bills
 * and ledgers point to `properties` rows. Each entry carries the id of its row — `additional_properties[i].id`
 * and, for the first property, `property_details.propertyRowId` — and that id is the link. Names are labels:
 * two properties may share one (two houses in the same bairro), and a name never makes one property's row
 * stand for another's (2026-10-06: a new house named "SANTO ANTONIO" took the multi-unit SANTO ANTONIO's row,
 * and deleting the house deleted that property's contract charges, co-tenants and bills).
 *
 * Entries saved before the ids were stamped are paired once more by name, then (the first property only) by
 * address, but only with rows no other entry holds; lib/property-rows-server.ts stamps what it pairs, so this
 * happens once per entry. Pure: the Imóveis page (client) and the API (server) pair the same way.
 */

type Json = Record<string, unknown>;

/** where the first property keeps its row id (`additional_properties[i]` use `id`) */
export const PRIMARY_ROW_ID_KEY = "propertyRowId";

const asObject = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const norm = (v: unknown): string => text(v).toLowerCase().replace(/\s+/g, " ");

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProfilePropertyRef {
    /** 0 = the first property (the profile's own columns), n = additional_properties[n - 1] */
    slot: number;
    /** the row id the entry carries, as stored (null when none) */
    storedId: string | null;
    /** the row's name: the property name, else "street, number" */
    name: string;
    details: Json | null;
    address: Json | null;
}

/** What a property's row is called — as the energy loader always named it. */
export function propertyRowName(details: Json | null | undefined, address: Json | null | undefined): string {
    const name = text(details?.propertyName);
    if (name) return name;
    const street = text(address?.street);
    return street ? `${street}, ${text(address?.number)}`.trim() : "";
}

/** The row's address column: "street, number - neighborhood". */
export function propertyRowAddress(address: Json | null | undefined): string | null {
    const street = text(address?.street);
    return street ? `${street}, ${text(address?.number)} - ${text(address?.neighborhood)}`.trim() : null;
}

const storedIdOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The profile's properties that can have a row (a name or a street) or have one (a stored id), by slot. The
 * first property counts only while `property_type` is set, as on the Imóveis page.
 */
export function profilePropertyRefs(profile: Json): ProfilePropertyRef[] {
    const refs: ProfilePropertyRef[] = [];
    if (profile.property_type) {
        const details = asObject(profile.property_details);
        const address = asObject(profile.property_address);
        const name = propertyRowName(details, address);
        const storedId = storedIdOf(details?.[PRIMARY_ROW_ID_KEY]);
        if (name || storedId) refs.push({ slot: 0, storedId, name, details, address });
    }
    const additional = Array.isArray(profile.additional_properties) ? profile.additional_properties : [];
    additional.forEach((raw, i) => {
        const entry = asObject(raw);
        if (!entry) return;
        const details = asObject(entry.details);
        const address = asObject(entry.address);
        const name = propertyRowName(details, address);
        const storedId = storedIdOf(entry.id);
        if (name || storedId) refs.push({ slot: i + 1, storedId, name, details, address });
    });
    return refs;
}

export interface LinkableRow {
    id: string;
    name: string;
    address?: string | null;
}

export interface PropertyLink {
    ref: ProfilePropertyRef;
    /** the entry's row, or null when it has none yet */
    rowId: string | null;
    /** how it was paired: by the stored id, or (entries saved before the ids) by name / address */
    by: "id" | "name" | "address" | null;
}

/** The row's address is the entry's street and number (spaces and case aside). */
export function sameStreetAddress(rowAddress: string | null | undefined, address: Json | null | undefined): boolean {
    const street = norm(address?.street);
    if (!street || !rowAddress) return false;
    const key = `${street}, ${norm(address?.number)}`.trim();
    const row = norm(rowAddress);
    return row === key || row.startsWith(`${key} -`);
}

/**
 * Pairs the profile's properties with the owner's rental rows (standalone consumer units left out, oldest
 * first). An entry with a stored id is linked by it and by nothing else: when that row is gone the entry has
 * none (lib/property-rows-server.ts creates it again with the same id). The same id stored twice links only
 * the first entry. Entries without an id take the oldest free row of the same name (one at the same address
 * first); the first property, renamed before its row followed, the oldest free row at its address.
 */
export function linkPropertyRows(rows: LinkableRow[], profile: Json): PropertyLink[] {
    const refs = profilePropertyRefs(profile);
    const ids = new Set(rows.map(r => r.id));
    const claimed = new Set<string>();
    const links: PropertyLink[] = refs.map(ref => ({ ref, rowId: null, by: null }));

    for (const link of links) {
        const id = link.ref.storedId;
        if (id && ids.has(id) && !claimed.has(id)) {
            link.rowId = id;
            link.by = "id";
            claimed.add(id);
        }
    }

    // an entry whose stored id is its own (not a duplicate) waits for that row; the others pair as if they had none
    const ownsStoredId = (link: PropertyLink) => !!link.ref.storedId && !links.some(o => o !== link && o.rowId === link.ref.storedId);
    const unpaired = links.filter(l => !l.rowId && !(ownsStoredId(l) && !ids.has(l.ref.storedId!)));

    for (const link of unpaired) {
        const key = norm(link.ref.name);
        if (!key) continue;
        const same = rows.filter(r => !claimed.has(r.id) && norm(r.name) === key);
        const row = same.find(r => sameStreetAddress(r.address, link.ref.address)) ?? same[0];
        if (!row) continue;
        link.rowId = row.id;
        link.by = "name";
        claimed.add(row.id);
    }

    const primary = unpaired.find(l => l.ref.slot === 0 && !l.rowId);
    if (primary) {
        const row = rows.find(r => !claimed.has(r.id) && sameStreetAddress(r.address, primary.ref.address));
        if (row) {
            primary.rowId = row.id;
            primary.by = "address";
            claimed.add(row.id);
        }
    }
    return links;
}

/** Slot → row id, for the entries that have a row. */
export function rowIdsBySlot(links: PropertyLink[]): Map<number, string> {
    return new Map(links.filter(l => l.rowId).map(l => [l.ref.slot, l.rowId as string]));
}

/**
 * A name no other property uses: the wanted one, else "wanted · street, number", else "wanted (2)", "(3)"…
 * `taken` are the other properties' names.
 */
export function uniquePropertyName(wanted: string, taken: Iterable<string>, address?: Json | null): string {
    const base = wanted.trim();
    const used = new Set([...taken].map(norm));
    if (!base || !used.has(norm(base))) return base;
    const street = text(address?.street);
    if (street) {
        const withStreet = `${base} · ${[street, text(address?.number)].filter(Boolean).join(", ")}`;
        if (!used.has(norm(withStreet))) return withStreet;
    }
    for (let n = 2; ; n++) {
        const candidate = `${base} (${n})`;
        if (!used.has(norm(candidate))) return candidate;
    }
}

/** Two property names are the same (spaces and case aside). */
export function samePropertyName(a: unknown, b: unknown): boolean {
    const x = norm(a);
    return x !== "" && x === norm(b);
}
