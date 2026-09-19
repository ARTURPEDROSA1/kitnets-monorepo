import { describe, expect, it } from "vitest";
import { refreshedLeaseUnitNames } from "./lease-unit-names";

describe("refreshedLeaseUnitNames", () => {
    it("replaces the default 'Unidade N' left in the reference once the unit has a name", () => {
        expect(refreshedLeaseUnitNames(
            { unit_name: "Kitnet 35C", reference_name: "SANTO ANTONIO · Unidade 4 - Anderson Serafim Calixto - 2026" },
            { name: "Kitnet 35C", position: 4 }
        )).toEqual({ unit_name: "Kitnet 35C", reference_name: "SANTO ANTONIO · Kitnet 35C - Anderson Serafim Calixto - 2026" });
    });

    it("follows a rename: snapshot and reference", () => {
        expect(refreshedLeaseUnitNames(
            { unit_name: "Kitnet 35C", reference_name: "SANTO ANTONIO · Kitnet 35C - Ana - 2026" },
            { name: "Kitnet 35-C (fundos)", position: 4 }
        )).toEqual({ unit_name: "Kitnet 35-C (fundos)", reference_name: "SANTO ANTONIO · Kitnet 35-C (fundos) - Ana - 2026" });
    });

    it("updates the snapshot alone when the user worded the reference differently", () => {
        expect(refreshedLeaseUnitNames(
            { unit_name: "Unidade 4", reference_name: "Contrato do Anderson (Unidade 4)" },
            { name: "Kitnet 35C", position: 4 }
        )).toEqual({ unit_name: "Kitnet 35C", reference_name: "Contrato do Anderson (Unidade 4)" });
    });

    it("does not touch another unit's number or a longer name", () => {
        expect(refreshedLeaseUnitNames(
            { unit_name: "Kitnet 35C", reference_name: "SANTO ANTONIO · Unidade 40 - Ana - 2026" },
            { name: "Kitnet 35C", position: 4 }
        )).toBeNull();
    });

    it("changes nothing when all is current, the unit is still 'Unidade N' or has no name", () => {
        expect(refreshedLeaseUnitNames({ unit_name: "Kitnet 35C", reference_name: "SANTO ANTONIO · Kitnet 35C - Ana - 2026" }, { name: "Kitnet 35C", position: 4 })).toBeNull();
        expect(refreshedLeaseUnitNames({ unit_name: "Unidade 4", reference_name: "SANTO ANTONIO · Unidade 4 - Ana - 2026" }, { name: "Unidade 4", position: 4 })).toBeNull();
        expect(refreshedLeaseUnitNames({ unit_name: "Unidade 4", reference_name: null }, { name: "  ", position: 4 })).toBeNull();
    });

    it("handles a reference that ends with the unit and names with special characters", () => {
        expect(refreshedLeaseUnitNames(
            { unit_name: "Apto (1)", reference_name: "Vale do Sol · Apto (1)" },
            { name: "Apto $1", position: 1 }
        )).toEqual({ unit_name: "Apto $1", reference_name: "Vale do Sol · Apto $1" });
    });
});
