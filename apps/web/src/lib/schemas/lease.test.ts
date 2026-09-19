import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { leaseInputSchema, leaseTerminationSchema } from "./lease";

const valid = {
    reference_name: " Kitnet 3 ",
    property_id: "prop-1",
    primary_tenant_id: "tenant-1",
    management_type: "SELF_MANAGED",
    start_date: "2026-01-31",
    end_date: "2028-01-30",
    monthly_rent: "R$ 1.234,56",
    rent_due_day: "10",
    security_deposit: "2469.12",
    deposit_months: "2",
    adjustment_index: "IGP_M",
    adjustment_frequency: "12",
    next_adjustment_date: "2027-01-31",
    status: "ACTIVE",
    additional_tenants: [{ tenant_id: "tenant-2", role: "CO_TENANT" }, { tenant_id: "", role: "CO_TENANT" }, { tenant_id: "x", role: "BOSS" }],
    charges: [{ charge_type: "WATER", responsibility: "TENANT", amount: "80,00", label: " Água ", adjustment_index: "IPCA", adjustment_notes: " Anual " }, { charge_type: "PIZZA", responsibility: "TENANT" }],
};

describe("leaseInputSchema", () => {
    it("keeps the unit of a multi-unit property; none means the whole property", () => {
        expect(leaseInputSchema.parse({ ...valid, unit_id: " unit-7 " }).lease.unit_id).toBe("unit-7");
        expect(leaseInputSchema.parse({ ...valid, unit_id: "" }).lease.unit_id).toBeNull();
        expect(leaseInputSchema.parse(valid).lease.unit_id).toBeNull();
    });

    it("normalises a valid payload into lease, tenants and charges", () => {
        const out = leaseInputSchema.parse(valid);
        expect(out.lease.reference_name).toBe("Kitnet 3");
        expect(out.lease.monthly_rent).toBe(1234.56);
        expect(out.lease.security_deposit).toBe(2469.12);
        expect(out.lease.rent_due_day).toBe(10);
        expect(out.lease.deposit_months).toBe(2);
        expect(out.lease.adjustment_index).toBe("IGP_M");
        expect(out.lease.adjustment_frequency).toBe(12);
        expect(out.lease.agency_id).toBeNull();
        expect(out.lease.agent_id).toBeNull();
        expect(out.additional_tenants).toEqual([{ tenant_id: "tenant-2", role: "CO_TENANT" }]);
        expect(out.charges).toEqual([{ charge_type: "WATER", label: "Água", responsibility: "TENANT", amount: 80, adjustment_index: "IPCA", adjustment_notes: "Anual" }]);
    });

    it("reports the form's messages for missing required fields", () => {
        const r = leaseInputSchema.safeParse({});
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.property_id).toBe("Selecione um imóvel.");
            expect(e.primary_tenant_id).toBe("Selecione um inquilino.");
            expect(e.management_type).toBe("Tipo de gestão é obrigatório.");
            expect(e.start_date).toBe("Data de início é obrigatória.");
            expect(e.monthly_rent).toBe("Valor do aluguel deve ser maior que zero.");
            expect(e.rent_due_day).toBe("Dia de vencimento deve ser entre 1 e 31.");
        }
    });

    it("requires the agency or the agent according to the management type", () => {
        const a = leaseInputSchema.safeParse({ ...valid, management_type: "AGENCY" });
        expect(a.success).toBe(false);
        if (!a.success) expect(fieldErrors(a.error).agency_id).toBe("Selecione a imobiliária.");
        const b = leaseInputSchema.safeParse({ ...valid, management_type: "AGENT" });
        expect(b.success).toBe(false);
        if (!b.success) expect(fieldErrors(b.error).agent_id).toBe("Selecione o corretor.");
        const ok = leaseInputSchema.parse({ ...valid, management_type: "AGENT", agent_id: "ag-9", agency_id: "should-drop" });
        expect(ok.lease.agent_id).toBe("ag-9");
        expect(ok.lease.agency_id).toBeNull();
    });

    it("rejects an end date on or before the start", () => {
        // Cross-field rules run once every individual field is valid (zod skips
        // object-level refinements while field errors exist).
        const r = leaseInputSchema.safeParse({ ...valid, end_date: "2026-01-31" });
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).end_date).toBe("Data de término deve ser posterior à data de início.");
    });

    it("rejects a zero rent, a bad due day and a bad status", () => {
        const r = leaseInputSchema.safeParse({ ...valid, monthly_rent: "0,00", rent_due_day: "32", status: "WHATEVER" });
        expect(r.success).toBe(false);
        if (!r.success) {
            const e = fieldErrors(r.error);
            expect(e.monthly_rent).toBe("Valor do aluguel deve ser maior que zero.");
            expect(e.rent_due_day).toBe("Dia de vencimento deve ser entre 1 e 31.");
            expect(e.status).toBe("Status inválido.");
        }
    });

    it("applies the defaults the form relies on", () => {
        const out = leaseInputSchema.parse({ ...valid, status: "", adjustment_index: "", adjustment_frequency: "", end_date: null, additional_tenants: undefined, charges: "nope" });
        expect(out.lease.status).toBe("ACTIVE");
        expect(out.lease.adjustment_index).toBeNull();
        expect(out.lease.adjustment_frequency).toBe(12);
        expect(out.lease.end_date).toBeNull();
        expect(out.additional_tenants).toEqual([]);
        expect(out.charges).toEqual([]);
    });

    it("rejects dates that are not ISO", () => {
        const r = leaseInputSchema.safeParse({ ...valid, start_date: "31/01/2026" });
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).start_date).toBe("Data de início inválida.");
    });
});

describe("leaseTerminationSchema", () => {
    it("requires an ISO termination date", () => {
        const r = leaseTerminationSchema.safeParse({});
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).termination_date).toBe("Data de rescisão é obrigatória.");
        expect(leaseTerminationSchema.parse({ termination_date: "2026-09-30", termination_reason: " mudança " }).termination_reason).toBe("mudança");
    });
});
