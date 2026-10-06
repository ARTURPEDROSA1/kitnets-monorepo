import { describe, expect, it, vi } from "vitest";
import type { AdminSupabase } from "@/lib/api-auth";
import { syncPropertyRows } from "./property-rows-server";

const profile = {
    property_type: "single",
    property_details: { propertyName: "VALE DO SOL" },
    property_address: { street: "RUA ATLAS", number: "50", neighborhood: "VALE DO SOL", city: "Nova Lima", state: "MG", cep: "34000-000" },
    additional_properties: [
        { id: "row-santo", details: { propertyName: "SANTO ANTONIO" }, address: { street: "RUA CLAUDIONOR IDELF BRAGA", number: "35" } },
        // the new house, saved by the Imóveis wizard: only in the profile, named after the same bairro
        { details: { propertyName: " SANTO ANTONIO " }, address: { street: "RUA JOSE GOIS", number: "45", neighborhood: "SANTO ANTONIO", city: "Itabirito", state: "MG" } },
        // no name: the street names it
        { details: { propertyName: "" }, address: { street: "RUA SEM NOME", number: "7" } },
        // nothing to name it by: no row
        { details: {}, address: {} },
    ],
};

const rows = [
    { id: "row-vale", name: "VALE DO SOL", address: "RUA ATLAS, 50 - VALE DO SOL", city: "Nova Lima", state: "MG", zip: "34000-000", electronic_id: null },
    { id: "row-santo", name: "SANTO ANTONIO", address: "RUA CLAUDIONOR IDELF BRAGA, 35 -", city: null, state: null, zip: null, electronic_id: null },
    // an energy-only record of the same name does not count as the rental property
    { id: "row-uc", name: "RUA SEM NOME, 7", address: null, city: null, state: null, zip: null, electronic_id: JSON.stringify({ isStandaloneUc: true }) },
];

function fake(rpcResult: (args: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }) {
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => rpcResult(args));
    const eq2 = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: () => ({ eq: eq2 }) }));
    return { client: { rpc, from: () => ({ update }) } as unknown as AdminSupabase, rpc, update };
}

describe("syncPropertyRows", () => {
    it("gives the namesake house a row of its own, stamping the first property paired by name", async () => {
        const { client, rpc } = fake(args => ({ data: (args.p_row_id as string) ?? `new-${args.p_slot}`, error: null }));
        const { changed, links } = await syncPropertyRows(client, "owner-1", { profile, rows });
        expect(links.map(l => [l.ref.slot, l.rowId])).toEqual([[0, "row-vale"], [1, "row-santo"], [2, "new-2"], [3, "new-3"]]);
        expect(changed).toBe(2);
        expect(rpc.mock.calls.map(c => c[1])).toEqual([
            { p_owner_id: "owner-1", p_slot: 0, p_expected_stored: null, p_row_id: "row-vale", p_name: "VALE DO SOL", p_address: "RUA ATLAS, 50 - VALE DO SOL", p_city: "Nova Lima", p_state: "MG", p_zip: "34000-000" },
            { p_owner_id: "owner-1", p_slot: 2, p_expected_stored: null, p_row_id: null, p_name: "SANTO ANTONIO", p_address: "RUA JOSE GOIS, 45 - SANTO ANTONIO", p_city: "Itabirito", p_state: "MG", p_zip: null },
            { p_owner_id: "owner-1", p_slot: 3, p_expected_stored: null, p_row_id: null, p_name: "RUA SEM NOME, 7", p_address: "RUA SEM NOME, 7 -", p_city: null, p_state: null, p_zip: null },
        ]);
    });

    it("creates a row again with the entry's own id when it is gone", async () => {
        const gone = { ...profile, property_details: { propertyName: "VALE DO SOL", propertyRowId: "11111111-2222-3333-4444-555555555555" }, additional_properties: [] };
        const { client, rpc } = fake(args => ({ data: args.p_row_id, error: null }));
        await syncPropertyRows(client, "owner-1", { profile: gone, rows: [rows[2]] });
        expect(rpc.mock.calls[0][1]).toMatchObject({ p_slot: 0, p_expected_stored: "11111111-2222-3333-4444-555555555555", p_row_id: "11111111-2222-3333-4444-555555555555" });
    });

    it("renames the row of a property renamed in Imóveis", async () => {
        const renamed = { ...profile, property_details: { propertyName: "Casa da Serra", propertyRowId: "row-vale" }, additional_properties: [profile.additional_properties[0]] };
        const { client, rpc, update } = fake(() => ({ data: null, error: null }));
        const { changed } = await syncPropertyRows(client, "owner-1", { profile: renamed, rows });
        expect(rpc).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith({ name: "Casa da Serra" });
        expect(changed).toBe(1);
    });

    it("does nothing when every property is linked by its id and named alike", async () => {
        const linked = { ...profile, property_details: { propertyName: "VALE DO SOL", propertyRowId: "row-vale" }, additional_properties: [profile.additional_properties[0]] };
        const { client, rpc, update } = fake(() => ({ data: null, error: null }));
        expect((await syncPropertyRows(client, "owner-1", { profile: linked, rows })).changed).toBe(0);
        expect(rpc).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("never falls back to name lookups while the database function is not deployed", async () => {
        const { client, rpc } = fake(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.link_profile_property_row" } }));
        const { links } = await syncPropertyRows(client, "owner-1", { profile, rows });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(links.find(l => l.ref.slot === 2)?.rowId).toBeNull();
    });

    it("never throws", async () => {
        const client = { rpc: () => { throw new Error("boom"); } } as unknown as AdminSupabase;
        await expect(syncPropertyRows(client, "owner-1", { profile, rows })).resolves.toEqual({ changed: 0, links: [] });
    });
});
