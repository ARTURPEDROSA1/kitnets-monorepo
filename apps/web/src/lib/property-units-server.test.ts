import { describe, expect, it } from "vitest";
import { pairPropertyUnits } from "./property-units-server";

const rows = [
    { id: "row-santo", name: "SANTO ANTONIO" },
    { id: "row-vale", name: "Vale do Sol" },
    { id: "row-casa", name: "Casa da Praia" },
];

describe("pairPropertyUnits", () => {
    it("lists the units of multi-unit properties under their property row", () => {
        const { units, update } = pairPropertyUnits(rows, {
            property_type: "multi",
            property_details: { propertyName: " santo antonio " },
            sub_units: [{ id: "u1", name: "Kitnet 35" }, { id: "u2", name: "  " }],
            additional_properties: [
                { id: "row-vale", propertyType: "multi", details: { propertyName: "Vale do Sol" }, subUnits: [{ id: "u3", name: "Apto 101" }] },
                { id: "row-casa", propertyType: "single", details: { propertyName: "Casa da Praia" }, subUnits: [] },
            ],
        });
        expect(units.get("row-santo")).toEqual([{ id: "u1", name: "Kitnet 35" }, { id: "u2", name: "Unidade 2" }]);
        expect(units.get("row-vale")).toEqual([{ id: "u3", name: "Apto 101" }]);
        expect(units.has("row-casa")).toBe(false);
        expect(update).toEqual({});
    });

    it("gives an id to units saved without one and reports the columns to store", () => {
        const { units, update } = pairPropertyUnits(rows, {
            property_type: "multi",
            property_details: { propertyName: "Santo Antonio" },
            sub_units: [{ name: "Kitnet 35", sqMeters: "30" }, { id: "u2", name: "Kitnet 36" }],
            additional_properties: [
                { id: "row-vale", propertyType: "multi", details: {}, subUnits: [{ name: "Apto 101" }] },
            ],
        });
        const [first, second] = units.get("row-santo")!;
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(second.id).toBe("u2");
        expect(update.sub_units).toEqual([{ name: "Kitnet 35", sqMeters: "30", id: first.id }, { id: "u2", name: "Kitnet 36" }]);
        const stored = update.additional_properties as Array<{ subUnits: Array<{ id: string }> }>;
        expect(stored[0].subUnits[0].id).toBe(units.get("row-vale")![0].id);
    });

    it("pairs a renamed first property with the oldest row no other entry claimed", () => {
        const { units } = pairPropertyUnits(rows, {
            property_type: "multi",
            property_details: { propertyName: "Nome novo" },
            sub_units: [{ id: "u1", name: "Kitnet 35" }],
            additional_properties: [
                { id: "row-santo", propertyType: "single", details: { propertyName: "SANTO ANTONIO" }, subUnits: [] },
            ],
        });
        expect(units.get("row-vale")).toEqual([{ id: "u1", name: "Kitnet 35" }]);
        expect(units.has("row-santo")).toBe(false);
    });

    it("has no units for an account with single-unit properties only", () => {
        const { units, update } = pairPropertyUnits(rows, { property_type: "single", sub_units: [], additional_properties: [] });
        expect(units.size).toBe(0);
        expect(update).toEqual({});
    });
});
