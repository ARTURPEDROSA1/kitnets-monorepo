import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { agentInputSchema } from "./agent";

const valid = {
    full_name: " João Corretor ",
    creci_number: " 12345 ",
    creci_state: "sp",
    agent_type: "IMOBILIARIA",
    agency_id: "ag-1",
    main_phone: "(11) 98765-4321",
    main_phone_whatsapp: true,
    email: "Joao@Example.com",
    website: "example.com",
    status: "ACTIVE",
};

describe("agentInputSchema", () => {
    it("normalises a valid payload", () => {
        const out = agentInputSchema.parse(valid);
        expect(out.full_name).toBe("João Corretor");
        expect(out.creci_number).toBe("12345");
        expect(out.creci_state).toBe("SP");
        expect(out.main_phone).toMatch(/^\+55\d{10,11}$/);
        expect(out.main_phone_whatsapp).toBe(true);
        expect(out.additional_phone).toBeNull();
        expect(out.additional_phone_whatsapp).toBe(false);
        expect(out.email).toBe("joao@example.com");
        expect(out.website).toContain("example.com");
        expect(out.cpf).toBeNull();
        expect(out.agency_id).toBe("ag-1");
    });

    it("reports the form's messages for missing required fields", () => {
        const r = agentInputSchema.safeParse({});
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.full_name).toBe("Nome completo é obrigatório.");
            expect(e.creci_number).toBe("CRECI é obrigatório.");
            expect(e.creci_state).toBe("UF do CRECI é obrigatório.");
            expect(e.agent_type).toBe("Tipo de atuação é obrigatório.");
            expect(e.main_phone).toBe("Telefone principal é obrigatório.");
            expect(e.status).toBe("Status é obrigatório.");
        }
    });

    it("validates optional CPF, e-mail, phone and website when present", () => {
        const r = agentInputSchema.safeParse({ ...valid, cpf: "111.111.111-11", email: "x", additional_phone: "1", website: "not a site" });
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.cpf).toBe("CPF inválido. Verifique os dígitos.");
            expect(e.email).toBe("E-mail inválido.");
            expect(e.additional_phone).toBe("Telefone adicional inválido.");
            expect(e.website).toBe("Website inválido.");
        }
    });

    it("stores a valid CPF as digits and treats a blank one as null", () => {
        expect(agentInputSchema.parse({ ...valid, cpf: "529.982.247-25" }).cpf).toBe("52998224725");
        expect(agentInputSchema.parse({ ...valid, cpf: "  " }).cpf).toBeNull();
    });

    it("requires an agency for agency-based agents and drops it for autonomous ones", () => {
        const r = agentInputSchema.safeParse({ ...valid, agency_id: "" });
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).agency_id).toBe("Selecione a imobiliária.");
        expect(agentInputSchema.parse({ ...valid, agent_type: "AUTONOMO" }).agency_id).toBeNull();
    });

    it("keeps the additional WhatsApp flag only when there is an additional phone", () => {
        expect(agentInputSchema.parse({ ...valid, additional_phone_whatsapp: true }).additional_phone_whatsapp).toBe(false);
        const out = agentInputSchema.parse({ ...valid, additional_phone: "(11) 91234-5678", additional_phone_whatsapp: true });
        expect(out.additional_phone_whatsapp).toBe(true);
    });
});
