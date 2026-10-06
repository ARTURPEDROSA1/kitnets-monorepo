import { describe, expect, it, vi } from "vitest";
import type { AdminSupabase } from "@/lib/api-auth";
import { ensurePropertyRows, wantedPropertyRows } from "./property-rows-server";

const profile = {
    property_details: { propertyName: "VALE DO SOL" },
    property_address: { street: "RUA ATLAS", number: "50", neighborhood: "VALE DO SOL", city: "Nova Lima", state: "MG", cep: "34000-000" },
    additional_properties: [
        { details: { propertyName: "SANTO ANTONIO" }, address: { street: "RUA CLAUDIONOR IDELF BRAGA", number: "35" } },
        // the new one, saved by the Imóveis wizard: only in the profile
        { details: { propertyName: " VILA JOSE LOPES " }, address: { street: "RUA JOSE GOIS", number: "45", neighborhood: "VILA JOSE LOPES", city: "Itabirito", state: "MG" } },
        // no name: the street names it
        { details: { propertyName: "" }, address: { street: "RUA SEM NOME", number: "7" } },
        // nothing to name it by: no row
        { details: {}, address: {} },
    ],
};

describe("the rows the profile's properties should have", () => {
    it("names them as the energy loader always did", () => {
        expect(wantedPropertyRows(profile)).toEqual([
            { name: "VALE DO SOL", address: "RUA ATLAS, 50 - VALE DO SOL", city: "Nova Lima", state: "MG", zip: "34000-000" },
            { name: "SANTO ANTONIO", address: "RUA CLAUDIONOR IDELF BRAGA, 35 -", city: null, state: null, zip: null },
            { name: "VILA JOSE LOPES", address: "RUA JOSE GOIS, 45 - VILA JOSE LOPES", city: "Itabirito", state: "MG", zip: null },
            { name: "RUA SEM NOME, 7", address: "RUA SEM NOME, 7 -", city: null, state: null, zip: null },
        ]);
    });
    it("has none for an empty profile", () => {
        expect(wantedPropertyRows({})).toEqual([]);
    });
});

describe("ensurePropertyRows", () => {
    const fake = (error: { code?: string; message: string } | null = null) => {
        const rpc = vi.fn(async () => ({ error }));
        const insert = vi.fn(async () => ({ error: null }));
        return { client: { rpc, from: () => ({ insert }) } as unknown as AdminSupabase, rpc, insert };
    };
    const rows = [
        { name: "VALE DO SOL", electronic_id: null },
        { name: "santo antonio ", electronic_id: null },
        // an energy-only record of the same name does not count as the rental property
        { name: "RUA SEM NOME, 7", electronic_id: JSON.stringify({ isStandaloneUc: true }) },
    ];

    it("creates only the missing rows, through the locked database function", async () => {
        const { client, rpc } = fake();
        expect(await ensurePropertyRows(client, "owner-1", { profile, rows })).toBe(2);
        expect(rpc.mock.calls.map(c => (c as unknown[])[1])).toEqual([
            { p_owner_id: "owner-1", p_name: "VILA JOSE LOPES", p_address: "RUA JOSE GOIS, 45 - VILA JOSE LOPES", p_city: "Itabirito", p_state: "MG", p_zip: null },
            { p_owner_id: "owner-1", p_name: "RUA SEM NOME, 7", p_address: "RUA SEM NOME, 7 -", p_city: null, p_state: null, p_zip: null },
        ]);
    });
    it("does nothing when every property has its row", async () => {
        const { client, rpc } = fake();
        const all = [...rows, { name: "VILA JOSE LOPES" }, { name: "RUA SEM NOME, 7" }];
        expect(await ensurePropertyRows(client, "owner-1", { profile, rows: all })).toBe(0);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("inserts directly while the database function is not deployed yet", async () => {
        const { client, insert } = fake({ code: "PGRST202", message: "Could not find the function public.ensure_property_row" });
        expect(await ensurePropertyRows(client, "owner-1", { profile, rows })).toBe(2);
        expect(insert).toHaveBeenCalledTimes(2);
    });
    it("never throws", async () => {
        const client = { rpc: () => { throw new Error("boom"); } } as unknown as AdminSupabase;
        await expect(ensurePropertyRows(client, "owner-1", { profile, rows })).resolves.toBe(0);
    });
});
