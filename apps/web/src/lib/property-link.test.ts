import { describe, expect, it } from "vitest";
import { linkPropertyRows, profilePropertyRefs, propertyRowName, sameStreetAddress, uniquePropertyName } from "./property-link";

// The account of 2026-10-06: the first property VALE DO SOL, the multi-unit SANTO ANTONIO (with its row id),
// and a new house named after the same bairro, without one
const rows = [
    { id: "row-vale", name: "VALE DO SOL", address: "RUA  ATLAS, 50 - VALE DO SOL" },
    { id: "row-santo", name: "SANTO ANTONIO", address: "RUA CLAUDIONOR IDELF BRAGA, 35 - SANTO ANTONIO" },
];
const profile = {
    property_type: "single",
    property_details: { propertyName: "VALE DO SOL" },
    property_address: { street: "RUA  ATLAS", number: "50", neighborhood: "VALE DO SOL" },
    additional_properties: [
        { id: "row-santo", propertyType: "multi", details: { propertyName: "SANTO ANTONIO" }, address: { street: "RUA CLAUDIONOR IDELF BRAGA", number: "35" } },
        { propertyType: "single", details: { propertyName: "SANTO ANTONIO" }, address: { street: "RUA JOSE GOIS", number: "45", neighborhood: "SANTO ANTONIO" } },
    ],
};

const pairs = (r: typeof rows, p: Record<string, unknown>) => linkPropertyRows(r, p).map(l => [l.ref.slot, l.rowId, l.by]);

describe("linkPropertyRows", () => {
    it("never gives a property its namesake's row", () => {
        expect(pairs(rows, profile)).toEqual([
            [0, "row-vale", "name"],
            [1, "row-santo", "id"],
            [2, null, null],
        ]);
    });

    it("links by the stored id even when the name changed", () => {
        const renamed = { ...profile, additional_properties: [{ ...profile.additional_properties[0], details: { propertyName: "Kitnets 35" } }] };
        expect(pairs(rows, renamed)).toEqual([[0, "row-vale", "name"], [1, "row-santo", "id"]]);
    });

    it("keeps the first property on its row through propertyRowId", () => {
        const stamped = { ...profile, property_details: { propertyName: "Casa nova", propertyRowId: "row-vale" } };
        expect(pairs(rows, stamped)[0]).toEqual([0, "row-vale", "id"]);
    });

    it("pairs a renamed first property without an id by its address, never with any free row", () => {
        const renamed = { ...profile, property_details: { propertyName: "Casa da Serra" }, additional_properties: [] };
        expect(pairs(rows, renamed)).toEqual([[0, "row-vale", "address"]]);
        const elsewhere = { ...renamed, property_address: { street: "RUA NOVA", number: "1" } };
        expect(pairs(rows, elsewhere)).toEqual([[0, null, null]]);
    });

    it("waits for a stored id whose row is gone instead of taking a namesake's", () => {
        // row-santo is free and named SANTO ANTONIO too: still not this house's
        const gone = { ...profile, additional_properties: [{ ...profile.additional_properties[1], id: "row-new" }] };
        expect(pairs(rows, gone)).toEqual([[0, "row-vale", "name"], [1, null, null]]);
    });

    it("links an id stored twice to the first entry only; the other pairs as if it had none", () => {
        const twice = {
            ...profile,
            additional_properties: [
                profile.additional_properties[0],
                { ...profile.additional_properties[1], id: "row-santo" },
            ],
        };
        expect(pairs(rows, twice)).toEqual([[0, "row-vale", "name"], [1, "row-santo", "id"], [2, null, null]]);
    });

    it("pairs entries saved without ids by name, the one at the same address first", () => {
        const legacy = {
            property_type: "single",
            property_details: { propertyName: "Casa" },
            property_address: { street: "Rua B", number: "2" },
            additional_properties: [{ details: { propertyName: "Casa" }, address: { street: "Rua A", number: "1" } }],
        };
        const casas = [
            { id: "casa-a", name: "Casa", address: "Rua A, 1 - Centro" },
            { id: "casa-b", name: "Casa", address: "Rua B, 2 - Centro" },
        ];
        expect(pairs(casas, legacy)).toEqual([[0, "casa-b", "name"], [1, "casa-a", "name"]]);
    });

    it("leaves out entries with nothing to name them by, and the first one while the profile has no type", () => {
        expect(profilePropertyRefs({ property_type: null, property_details: { propertyName: "X" }, additional_properties: [{ details: {}, address: {} }] })).toEqual([]);
    });
});

describe("names and addresses", () => {
    it("names a row by the property name, else by street and number", () => {
        expect(propertyRowName({ propertyName: "  Casa " }, null)).toBe("Casa");
        expect(propertyRowName({}, { street: "Rua A", number: "1" })).toBe("Rua A, 1");
        expect(propertyRowName({}, { street: "Rua A" })).toBe("Rua A,");
        expect(propertyRowName({}, {})).toBe("");
    });
    it("compares the street and number of a row's address, spaces and case aside", () => {
        expect(sameStreetAddress("RUA  ATLAS, 50 - VALE DO SOL", { street: "rua atlas", number: "50" })).toBe(true);
        expect(sameStreetAddress("RUA ATLAS, 500 - VALE DO SOL", { street: "RUA ATLAS", number: "50" })).toBe(false);
        expect(sameStreetAddress(null, { street: "RUA ATLAS" })).toBe(false);
    });
    it("gives a taken name the street, then a number", () => {
        expect(uniquePropertyName("SANTO ANTONIO", ["VALE DO SOL"], {})).toBe("SANTO ANTONIO");
        expect(uniquePropertyName("SANTO ANTONIO", ["santo antonio"], { street: "RUA JOSE GOIS", number: "45" })).toBe("SANTO ANTONIO · RUA JOSE GOIS, 45");
        expect(uniquePropertyName("SANTO ANTONIO", ["SANTO ANTONIO", "SANTO ANTONIO (2)"], {})).toBe("SANTO ANTONIO (3)");
    });
});
