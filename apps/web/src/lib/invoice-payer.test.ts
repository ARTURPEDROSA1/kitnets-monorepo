import { describe, expect, it } from "vitest";
import { blockersText, resolvePayer, type PayerProperty, type PayerTenant } from "./invoice-payer";

const tenant = (over: Partial<PayerTenant> = {}): PayerTenant => ({
    full_name: " Ana Souza ", cpf: "529.982.247-25", email: "ana@example.com",
    postal_code: "30130-000", street: "Rua da Bahia", street_number: "100", address_complement: "ap 2", neighborhood: "Centro", city: "Belo Horizonte", state: "mg",
    use_property_address: false, ...over,
});
const property: PayerProperty = { address: "Rua Santo Antônio, 35 - Centro", city: "Nova Lima", state: "MG", zip: "34000-123" };

describe("resolvePayer", () => {
    it("uses the tenant's own address when it is complete", () => {
        const payer = resolvePayer(tenant(), property, "Kitnet 35C");
        expect(payer).toMatchObject({ name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", blockers: [] });
        expect(payer.address).toEqual({ cep: "30130000", street: "Rua da Bahia", number: "100", complement: "ap 2", neighborhood: "Centro", city: "Belo Horizonte", state: "MG" });
    });

    it("a tenant who lives in the rented property gets its address, with the unit as the complement", () => {
        const payer = resolvePayer(tenant({ use_property_address: true }), property, "Kitnet 35C");
        expect(payer.address).toEqual({ cep: "34000123", street: "Rua Santo Antônio, 35 - Centro", number: "", complement: "Kitnet 35C", neighborhood: "", city: "Nova Lima", state: "MG" });
        expect(payer.blockers).toEqual([]);
    });

    it("falls back to the property when the tenant has no address of their own (contract import)", () => {
        const payer = resolvePayer(tenant({ postal_code: null, street: null, street_number: null, city: null, state: null }), property, null);
        expect(payer.address?.city).toBe("Nova Lima");
        expect(payer.blockers).toEqual([]);
    });

    it("says what is missing instead of inventing it", () => {
        const payer = resolvePayer(tenant({ email: null, cpf: "11111111111", street: null }), { address: "Rua A, 1", city: "Nova Lima", state: "MG", zip: null }, null);
        expect(payer.blockers).toEqual(["NO_EMAIL", "INVALID_CPF", "NO_CEP"]);
        expect(resolvePayer(tenant({ street: null }), null).blockers).toEqual(["NO_ADDRESS"]);
        expect(resolvePayer(tenant({ street: null }), { address: null, city: "Nova Lima", state: "MG", zip: "34000123" }).blockers).toEqual(["NO_ADDRESS"]);
    });

    it("the lease's own invoice e-mail wins; a malformed one is ignored", () => {
        expect(resolvePayer(tenant(), property, null, "financeiro@example.com").email).toBe("financeiro@example.com");
        expect(resolvePayer(tenant(), property, null, "sem-arroba").email).toBe("ana@example.com");
        expect(resolvePayer(tenant({ email: "  " }), property).blockers).toEqual(["NO_EMAIL"]);
    });
});

describe("blockersText", () => {
    it("reads as a sentence and skips what it does not know", () => {
        expect(blockersText(["NO_EMAIL", "NO_CEP", "WHATEVER"])).toBe("inquilino sem e-mail, endereço do pagador sem CEP");
        expect(blockersText([])).toBe("");
    });
});
