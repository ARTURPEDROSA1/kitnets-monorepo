/**
 * Builds what the Condomínio page renders — the owner's condominiums with their card figures and the
 * property's photos, and the multi-unit properties a condominium can be tied to — for the API routes
 * (`GET /api/condominium`, `GET /api/condominium/properties`) and the page, which preloads both on
 * the server so the first paint already has the cards.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { loadPropertyUnits } from "@/lib/property-units-server";
import { loadPropertyPhotos } from "@/lib/property-photos-server";
import { condominiumKpis, type Condominium } from "@/lib/condominium";
import { CONDOMINIUMS_TABLE, loadMonthsByProperty } from "@/lib/condominium-server";

export const CONDOMINIUM_COLUMNS = "id, property_id, name, notes, solar_payback_from_result, created_at, updated_at";

export interface CondoPropertyOption {
    id: string;
    name: string;
    address: string;
    units: number;
    /** null while the property has no condominium (what "Novo condomínio" offers) */
    condominium_id: string | null;
}

/** The owner's condominiums, oldest first, with their months' figures and the property's photos. */
export async function loadCondominiumList(supabase: AdminSupabase, profileId: string): Promise<Condominium[]> {
    const [{ data, error }, units, photos] = await Promise.all([
        supabase.from(CONDOMINIUMS_TABLE).select(CONDOMINIUM_COLUMNS).eq("owner_id", profileId).order("created_at", { ascending: true }),
        loadPropertyUnits(supabase, profileId),
        loadPropertyPhotos(supabase, profileId),
    ]);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.property_id as string);
    const [{ data: props, error: e2 }, months] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, state").in("id", ids),
        loadMonthsByProperty(supabase, profileId, ids),
    ]);
    if (e2) throw new Error(e2.message);
    return rows.map(r => {
        const p = (props ?? []).find(x => x.id === r.property_id);
        return {
            id: r.id as string,
            property_id: r.property_id as string,
            name: r.name as string,
            notes: (r.notes as string | null) ?? null,
            solar_payback_from_result: r.solar_payback_from_result === true,
            property_name: (p?.name as string) || "Imóvel",
            property_address: [p?.address, p?.city, p?.state].filter(Boolean).join(", "),
            units: units.get(r.property_id as string)?.length ?? 0,
            kpis: condominiumKpis(months.get(r.property_id as string) ?? []),
            photos: photos.get(r.property_id as string) ?? [],
        };
    });
}

/** The owner's multi-unit properties (the ones with units registered), oldest first, each with its condominium id when it has one. */
export async function loadCondoProperties(supabase: AdminSupabase, profileId: string): Promise<CondoPropertyOption[]> {
    const units = await loadPropertyUnits(supabase, profileId);
    const ids = [...units.entries()].filter(([, list]) => list.length > 0).map(([id]) => id);
    if (ids.length === 0) return [];
    const [{ data, error }, { data: condos, error: e2 }] = await Promise.all([
        supabase.from("properties").select("id, name, address, city, state, created_at").in("id", ids).order("created_at", { ascending: true }),
        supabase.from(CONDOMINIUMS_TABLE).select("id, property_id").eq("owner_id", profileId),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    return (data ?? []).map(p => ({
        id: p.id as string,
        name: (p.name as string) || "Imóvel",
        address: [p.address, p.city, p.state].filter(Boolean).join(", "),
        units: units.get(p.id as string)?.length ?? 0,
        condominium_id: ((condos ?? []).find(c => c.property_id === p.id)?.id as string | undefined) ?? null,
    }));
}
