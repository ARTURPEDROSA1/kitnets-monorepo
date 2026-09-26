import { describe, expect, it } from "vitest";
import { addressFromAgency, addressFromInvestment, addressFromProfile, addressText, attachGeocodes, geocodeQuery, normalizeAddressKey, pinBounds, spreadOverlapping, type GeocodeHit, type PinSource } from "./geocode";

const TODAY = "2026-09-25";

describe("normalizeAddressKey", () => {
    it("lowercases, strips accents and spaces, keeps the CEP as digits and defaults the country", () => {
        expect(normalizeAddressKey({ street: "Rua Felipe  Schmidt", number: "515", neighborhood: "Centro", city: "Florianópolis", state: "sc", cep: "88015-200" }))
            .toBe("rua felipe schmidt|515|centro|florianopolis|sc|88015200|br");
    });
    it("gives the same key to the same address written differently", () => {
        const a = normalizeAddressKey({ street: "Av. Beira-Mar", number: "1000", city: "FLORIANÓPOLIS", state: "SC", cep: "88015200" });
        const b = normalizeAddressKey({ street: "av. beira-mar ", number: " 1000", city: "Florianopolis", state: "sc", cep: "88015-200", country: "BR" });
        expect(a).toBe(b);
    });
    it("is null without a street, a city or a CEP", () => {
        expect(normalizeAddressKey({ number: "10", state: "SC" })).toBeNull();
        expect(normalizeAddressKey({ cep: "88015200" })).not.toBeNull();
    });
});

describe("geocodeQuery / addressText", () => {
    it("writes the query the geocoder likes and the line the owner reads", () => {
        const p = { street: "Rua Felipe Schmidt", number: "515", neighborhood: "Centro", city: "Florianópolis", state: "sc", cep: "88015200" };
        expect(geocodeQuery(p)).toBe("Rua Felipe Schmidt, 515, Centro, Florianópolis - SC, 88015-200, Brasil");
        expect(addressText(p)).toBe("Rua Felipe Schmidt, 515 · Centro · Florianópolis/SC");
    });
    it("skips what is missing", () => {
        expect(geocodeQuery({ city: "Itabirito", state: "MG" })).toBe("Itabirito - MG, Brasil");
        expect(addressText({})).toBe("");
    });
});

describe("adapters", () => {
    it("reads the profile JSON address", () => {
        expect(addressFromProfile({ cep: "", street: "Rua A", number: "1", city: "X", state: "SC", neighborhood: null, complement: "casa 2" })).toEqual({ street: "Rua A", number: "1", neighborhood: null, city: "X", state: "SC", cep: null });
        expect(addressFromProfile(null)).toEqual({});
    });
    it("reads an agency row", () => {
        expect(addressFromAgency({ postal_code: "30130010", street: "Av. Afonso Pena", street_number: "1500", neighborhood: "Centro", city: "Belo Horizonte", state: "MG", country: "BR" }))
            .toEqual({ street: "Av. Afonso Pena", number: "1500", neighborhood: "Centro", city: "Belo Horizonte", state: "MG", cep: "30130010", country: "BR" });
    });
    it("splits a project's one-line address back into its parts", () => {
        expect(addressFromInvestment({ address: "Rua A, 12 - Centro", city: "X", state: "sc", zip: "88015200" })).toEqual({ street: "Rua A", number: "12", neighborhood: "Centro", city: "X", state: "sc", cep: "88015200" });
        expect(addressFromInvestment({ address: "Rua B - Bairro Alto", city: null, state: null, zip: null })).toEqual({ street: "Rua B", number: null, neighborhood: "Bairro Alto", city: null, state: null, cep: null });
        expect(addressFromInvestment({ address: null, city: "Y", state: "MG", zip: null })).toEqual({ street: null, number: null, neighborhood: null, city: "Y", state: "MG", cep: null });
    });
});

const source = (id: string, over: Partial<PinSource> = {}): PinSource => ({
    id, kind: "property", label: id, subtitle: null, href: `/imoveis?id=${id}`, cover: null,
    address: { street: `Rua ${id}`, number: "1", city: "Florianópolis", state: "SC", cep: "88015200" },
    ...over,
});
const hit = (over: Partial<GeocodeHit> = {}): GeocodeHit => ({ lat: -27.59, lng: -48.55, precision: "ROOFTOP", provider: "google", fetchedAt: "2026-09-01T00:00:00Z", ...over });

describe("attachGeocodes", () => {
    it("locates cached addresses, reports the rest as misses and drops sources without an address", () => {
        const a = source("a");
        const b = source("b");
        const none = source("c", { address: {} });
        const cache = new Map([[normalizeAddressKey(a.address) as string, hit()]]);
        const { pins, misses } = attachGeocodes([a, b, none], cache, { today: TODAY, googleAvailable: true });
        expect(pins.map(p => [p.id, p.lat !== null])).toEqual([["a", true], ["b", false]]);
        expect(misses.map(m => m.key)).toEqual([normalizeAddressKey(b.address)]);
        expect(misses[0].cep).toBe("88015200");
        expect(misses[0].query).toContain("Rua b, 1");
    });
    it("retries a negative result only after 30 days and upgrades a CEP-level hit when Google is available", () => {
        const a = source("a");
        const key = normalizeAddressKey(a.address) as string;
        const recent = new Map([[key, hit({ lat: null, lng: null, precision: null, fetchedAt: "2026-09-20T00:00:00Z" })]]);
        expect(attachGeocodes([a], recent, { today: TODAY, googleAvailable: true }).misses).toHaveLength(0);
        const old = new Map([[key, hit({ lat: null, lng: null, precision: null, fetchedAt: "2026-07-01T00:00:00Z" })]]);
        expect(attachGeocodes([a], old, { today: TODAY, googleAvailable: false }).misses).toHaveLength(1);
        const cep = new Map([[key, hit({ provider: "brasilapi", precision: "CEP" })]]);
        const withGoogle = attachGeocodes([a], cep, { today: TODAY, googleAvailable: true });
        expect(withGoogle.pins[0].lat).toBe(-27.59);   // shown where it is meanwhile
        expect(withGoogle.misses).toHaveLength(1);
        expect(withGoogle.misses[0].keep).toEqual({ lat: -27.59, lng: -48.55 });   // kept if Google finds nothing better
        expect(attachGeocodes([a], cep, { today: TODAY, googleAvailable: false }).misses).toHaveLength(0);
    });
    it("asks Google at once for an address BrasilAPI could not place, with nothing to keep", () => {
        const a = source("a", { address: { street: "Rua Sem CEP", city: "Itabirito", state: "MG" } });
        const key = normalizeAddressKey(a.address) as string;
        const noCep = new Map([[key, hit({ lat: null, lng: null, precision: null, provider: "brasilapi", fetchedAt: "2026-09-24T00:00:00Z" })]]);
        const misses = attachGeocodes([a], noCep, { today: TODAY, googleAvailable: true }).misses;
        expect(misses).toHaveLength(1);
        expect(misses[0]).toMatchObject({ cep: null, keep: null });
        expect(attachGeocodes([a], noCep, { today: TODAY, googleAvailable: false }).misses).toHaveLength(0);
    });
    it("asks once for two sources sharing an address", () => {
        const a = source("a");
        const b = source("b", { kind: "agency", address: a.address });
        expect(attachGeocodes([a, b], new Map(), { today: TODAY, googleAvailable: false }).misses).toHaveLength(1);
    });
});

describe("spreadOverlapping", () => {
    it("spreads pins sharing a position and leaves the others alone", () => {
        const pins = [
            { id: "a", lat: -20.25, lng: -43.8 },
            { id: "b", lat: -20.25, lng: -43.8 },
            { id: "c", lat: -20.25, lng: -43.8 },
            { id: "d", lat: -19.92, lng: -43.94 },
            { id: "e", lat: null, lng: null },
        ];
        const out = spreadOverlapping(pins);
        const spots = new Set(out.slice(0, 3).map(p => `${p.lat},${p.lng}`));
        expect(spots.size).toBe(3);
        for (const p of out.slice(0, 3)) {
            expect(Math.abs((p.lat as number) + 20.25)).toBeLessThan(0.001);
            expect(Math.abs((p.lng as number) + 43.8)).toBeLessThan(0.001);
        }
        expect(out[3]).toEqual(pins[3]);
        expect(out[4]).toEqual(pins[4]);
        expect(out.map(p => p.id)).toEqual(["a", "b", "c", "d", "e"]);
    });
});

describe("pinBounds", () => {
    it("frames the located pins", () => {
        expect(pinBounds([{ lat: -27.5, lng: -48.5 }, { lat: -19.9, lng: -43.9 }, { lat: null, lng: null }])).toEqual({ north: -19.9, south: -27.5, east: -43.9, west: -48.5 });
        expect(pinBounds([{ lat: null, lng: null }])).toBeNull();
    });
});
