import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { tenantInputSchema } from "./tenant";

const valid = {
    full_name: "  Maria da Silva ",
    cpf: "529.982.247-25",
    main_phone: "(11) 98765-4321",
    email: " Maria@Example.COM ",
    property_id: "prop-1",
    management_type: "AGENCY",
    agency_id: "ag-1",
    agent_id: "agent-1",
    postal_code: "01310-100",
    state: "sp",
    use_property_address: true,
};

describe("tenantInputSchema", () => {
    it("normalises a valid payload", () => {
        const out = tenantInputSchema.parse(valid);
        expect(out.full_name).toBe("Maria da Silva");
        expect(out.cpf).toBe("52998224725");
        expect(out.main_phone).toMatch(/^\+55\d{10,11}$/);
        expect(out.email).toBe("maria@example.com");
        expect(out.postal_code).toBe("01310100");
        expect(out.state).toBe("SP");
        expect(out.status).toBe("ACTIVE");
        expect(out.use_property_address).toBe(true);
        expect(out.agency_id).toBe("ag-1");
        expect(out.notes).toBeNull();
    });

    it("reports the form's messages for missing required fields", () => {
        const r = tenantInputSchema.safeParse({});
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.full_name).toBe("Nome completo é obrigatório.");
            expect(e.cpf).toBe("CPF é obrigatório.");
            expect(e.main_phone).toBe("Telefone principal é obrigatório.");
            expect(e.property_id).toBe("Imóvel é obrigatório.");
            expect(e.management_type).toBe("Tipo de gestão é obrigatório.");
        }
    });

    it("rejects an invalid CPF, phone, e-mail and CEP with the right messages", () => {
        const r = tenantInputSchema.safeParse({ ...valid, cpf: "111.111.111-11", main_phone: "12", email: "nope", postal_code: "123" });
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.cpf).toBe("CPF inválido. Verifique os dígitos.");
            expect(e.main_phone).toBe("Telefone principal inválido.");
            expect(e.email).toBe("E-mail inválido.");
            expect(e.postal_code).toBe("CEP inválido (8 dígitos).");
        }
    });

    it("requires an agency when the tenant is agency-managed", () => {
        const r = tenantInputSchema.safeParse({ ...valid, agency_id: "" });
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).agency_id).toBe("Selecione a imobiliária.");
    });

    it("drops agency links for self-managed tenants", () => {
        const out = tenantInputSchema.parse({ ...valid, management_type: "SELF_MANAGED" });
        expect(out.agency_id).toBeNull();
        expect(out.agent_id).toBeNull();
    });

    it("treats empty optional strings as null and keeps a blank CEP as null", () => {
        const out = tenantInputSchema.parse({ ...valid, email: "", postal_code: "  ", rg: "" });
        expect(out.email).toBeNull();
        expect(out.postal_code).toBeNull();
        expect(out.rg).toBeNull();
    });
});
