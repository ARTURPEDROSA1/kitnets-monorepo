import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { agencyInputSchema } from "./agency";

const valid = {
    name: " Imobiliária Boa ",
    main_phone: "(11) 3333-4444",
    postal_code: "01310-100",
    street: "Av. Paulista",
    street_number: "1000",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "sp",
    cnpj: "11.222.333/0001-81",
    email: "Contato@Boa.com",
    website: "boa.com",
    management_fee: "8,5",
    creci_type: "pj",
};

describe("agencyInputSchema", () => {
    it("normalises a valid payload", () => {
        const out = agencyInputSchema.parse(valid);
        expect(out.name).toBe("Imobiliária Boa");
        expect(out.main_phone).toMatch(/^\+55\d{10,11}$/);
        expect(out.postal_code).toBe("01310100");
        expect(out.state).toBe("SP");
        expect(out.cnpj).toBe("11222333000181");
        expect(out.email).toBe("contato@boa.com");
        expect(out.website).toContain("boa.com");
        expect(out.management_fee).toBe(8.5);
        expect(out.creci_type).toBe("PJ");
        expect(out.country).toBe("BR");
        expect(out.service_agreement_url).toBeNull();
        expect(out.additional_phone_whatsapp).toBe(false);
    });

    it("reports the form's messages for missing required fields", () => {
        const r = agencyInputSchema.safeParse({});
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.name).toBe("Nome da imobiliária é obrigatório.");
            expect(e.main_phone).toBe("Telefone principal é obrigatório.");
            expect(e.postal_code).toBe("CEP é obrigatório e deve ter 8 dígitos.");
            expect(e.street).toBe("Logradouro é obrigatório.");
            expect(e.street_number).toBe("Número é obrigatório.");
            expect(e.neighborhood).toBe("Bairro é obrigatório.");
            expect(e.city).toBe("Cidade é obrigatória.");
            expect(e.state).toBe("Estado é obrigatório.");
        }
    });

    it("validates optional CNPJ, e-mail, website, phone, CEP and CRECI type", () => {
        const r = agencyInputSchema.safeParse({ ...valid, cnpj: "11.111.111/1111-11", email: "x", website: "not a site", additional_phone: "1", postal_code: "123", creci_type: "XX" });
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.cnpj).toBe("CNPJ inválido. Verifique os dígitos.");
            expect(e.email).toBe("E-mail inválido.");
            expect(e.website).toBe("Website inválido.");
            expect(e.additional_phone).toBe("Telefone adicional inválido.");
            expect(e.postal_code).toBe("CEP é obrigatório e deve ter 8 dígitos.");
            expect(e.creci_type).toBe("Tipo de CRECI inválido.");
        }
    });

    it("accepts an alphanumeric CNPJ", () => {
        const out = agencyInputSchema.parse({ ...valid, cnpj: "12.ABC.345/01DE-35" });
        expect(out.cnpj).toBe("12ABC34501DE35");
    });

    it("parses the management fee from number or text and drops garbage", () => {
        expect(agencyInputSchema.parse({ ...valid, management_fee: 10 }).management_fee).toBe(10);
        expect(agencyInputSchema.parse({ ...valid, management_fee: "" }).management_fee).toBeNull();
        expect(agencyInputSchema.parse({ ...valid, management_fee: "abc" }).management_fee).toBeNull();
    });

    it("keeps a storage path for the agreement and strips public URL prefixes", () => {
        const path = "agencies/x/agreements/1_contract.pdf";
        expect(agencyInputSchema.parse({ ...valid, service_agreement_url: path }).service_agreement_url).toBe(path);
        expect(agencyInputSchema.parse({ ...valid, service_agreement_url: `https://ref.supabase.co/storage/v1/object/public/documents/${path}` }).service_agreement_url).toBe(path);
    });
});
