import { describe, expect, it } from "vitest";
import { addressLine, investmentRow } from "./new-investments-server";
import type { InvestmentInput } from "./schemas/new-investment";

/** The mapper takes any subset of the validated body; the tests only pass what they are about. */
const row = (input: Partial<InvestmentInput>) => investmentRow(input);

describe("addressLine", () => {
    it("joins the parts the way the create form sends them", () => {
        expect(addressLine({ street: "Avenida Nereu Ramos", street_number: "4077", neighborhood: "Meia Praia" }))
            .toBe("Avenida Nereu Ramos, 4077 - Meia Praia");
    });

    it("leaves out what the contract did not give", () => {
        expect(addressLine({ street: "Rua 208", street_number: null, neighborhood: null })).toBe("Rua 208");
        expect(addressLine({ street: "Rua 208", street_number: "90", neighborhood: null })).toBe("Rua 208, 90");
    });

    it("is null without a street, since the number alone addresses nothing", () => {
        expect(addressLine({ street: null, street_number: "4077", neighborhood: "Meia Praia" })).toBeNull();
    });
});

describe("investmentRow", () => {
    it("copies only the fields the caller actually sent", () => {
        expect(row({ kind: "STUDIO" })).toEqual({ kind: "STUDIO" });
    });

    it("leaves a field alone when it is absent, but clears it when it is an explicit null", () => {
        expect("developer" in row({ kind: "STUDIO" })).toBe(false);
        expect(row({ developer: null })).toEqual({ developer: null });
    });

    it("renames postal_code to the column the table actually has", () => {
        expect(row({ postal_code: "88220000" })).toEqual({ zip: "88220000" });
    });

    it("composes the address from the parts the create form sends", () => {
        expect(row({ street: "Rua 208", street_number: "90", neighborhood: "Meia Praia" }))
            .toEqual({ address: "Rua 208, 90 - Meia Praia" });
    });

    it("takes the one-line address the edit dialog sends as it is", () => {
        expect(row({ address: "Avenida Nereu Ramos, 4077 - Meia Praia" }))
            .toEqual({ address: "Avenida Nereu Ramos, 4077 - Meia Praia" });
    });

    it("lets the whole address win over the parts, so the two never half-apply", () => {
        expect(row({ street: "Rua 208", address: "Avenida Nereu Ramos, 4077" }))
            .toEqual({ address: "Avenida Nereu Ramos, 4077" });
    });

    it("clears the address when the edit dialog sends it empty", () => {
        expect(row({ address: null })).toEqual({ address: null });
    });

    it("never carries the schedules into the row: they are their own table", () => {
        const mapped = row({ name: "Sun Place", schedules: [] });
        expect(mapped).toEqual({ name: "Sun Place" });
    });
});
