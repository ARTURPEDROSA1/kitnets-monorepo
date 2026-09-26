import { describe, expect, it } from "vitest";
import { pairPropertyEntries } from "./property-entries-server";

const rows = [
    { id: "p1", name: "SANTO ANTONIO" },
    { id: "p2", name: "Prédio Aurora" },
    { id: "p3", name: "casa x" },
];

const profile = {
    property_type: "multi",
    property_details: { propertyName: "Santo Antonio", numberOfUnits: 2, solarEnergy: true },
    property_address: { cep: "35450-272", street: "Rua Claudionor Idelf Braga", number: "35", neighborhood: "Santo Antonio", city: "Itabirito", state: "MG" },
    sub_units: [{ id: "u1", name: "Kitnet 35" }, { id: "u2", name: "Kitnet 35A" }, { name: "Kitnet 35B" }],
    property_photos: ["a.jpg", "b.jpg"],
    profile_photo_url: "b.jpg",
    additional_properties: [
        { id: "p2", propertyType: "single", details: { propertyName: "Prédio Aurora" }, address: { street: "Rua A", number: "1", city: "X", state: "SC" }, savedPhotos: ["c.jpg"], profilePhotoUrl: null, isSavedProperty: true },
        { propertyType: "single", details: { propertyName: "Casa X" }, address: { street: "Rua B", city: "Y", state: "SC" }, savedPhotos: [], isSavedProperty: true },
        { propertyType: "single", details: {}, address: {} },
        { propertyType: "multi", details: { propertyName: "Sem linha", numberOfUnits: 4 }, address: { street: "Rua C", city: "Z", state: "MG", cep: "12345678" }, subUnits: [], isSavedProperty: false },
    ],
};

describe("pairPropertyEntries", () => {
    it("pairs the first property by name, the additional ones by id then by name, and skips empty entries", () => {
        const entries = pairPropertyEntries(rows, profile);
        expect(entries.map(e => [e.index, e.id, e.name])).toEqual([
            [0, "p1", "Santo Antonio"],
            [1, "p2", "Prédio Aurora"],
            [2, "p3", "Casa X"],
            [4, null, "Sem linha"],
        ]);
        const primary = entries[0];
        expect(primary).toMatchObject({ key: "p1", propertyType: "multi", units: 3, unitIds: ["u1", "u2"], subUnitCount: 3, hasSolar: true, isSaved: true, addressText: "Rua Claudionor Idelf Braga, 35 · Santo Antonio · Itabirito/MG" });
        expect(primary.photos).toEqual(["b.jpg", "a.jpg"]);
        expect(primary.address).toMatchObject({ cep: "35450-272", state: "MG" });
        expect(entries[1]).toMatchObject({ propertyType: "single", subUnitCount: 0 });
        // a multi-unit entry without sub-units yet: 4 declared units, none registered (no condominium IPTU scope)
        expect(entries[3]).toMatchObject({ key: "profile:4", units: 4, unitIds: [], subUnitCount: 0, isSaved: false });
    });
    it("has no first property when the profile is unconfigured", () => {
        const entries = pairPropertyEntries(rows, { ...profile, property_type: null });
        expect(entries.map(e => e.index)).toEqual([1, 2, 4]);
        expect(pairPropertyEntries(rows, { property_type: "single", property_details: {}, property_address: {}, additional_properties: [] })).toEqual([]);
    });
    it("falls back to the oldest free row for the first property and names it by the street", () => {
        const entries = pairPropertyEntries([{ id: "r1", name: "Whatever" }], { property_type: "single", property_details: {}, property_address: { street: "Rua Z", number: "9", city: "W", state: "SP" } });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ id: "r1", name: "Rua Z, 9", units: 1, propertyType: "single" });
    });
});
