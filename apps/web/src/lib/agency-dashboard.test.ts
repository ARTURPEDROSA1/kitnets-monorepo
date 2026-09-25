import { describe, expect, it } from "vitest";
import { agencyAttention, agencyHubTotals, agencyRows, agreementInfo, creciLabel, daysBetween, feePercent, inAgencyView } from "./agency-dashboard";
import type { AgencyWithRole } from "@/types/agency";
import type { AgencyAgentSummary, AgencyLeaseSummary, AgencyTenantSummary } from "./agency-views";

const TODAY = "2026-09-25";

function agency(over: Partial<AgencyWithRole> = {}): AgencyWithRole {
    return {
        id: "a1", name: "Horizonte Imóveis Ltda", trade_name: "Horizonte", cnpj: "21951040000199", creci_number: "5358", creci_state: "MG", creci_type: "PJ",
        owner_name: "Marcos Oliveira", main_phone: "+5531999990001", additional_phone: null, main_phone_whatsapp: true, additional_phone_whatsapp: false,
        email: "contato@horizonte.com.br", website: null, postal_code: "34007718", street: "Av. Alaska", street_number: "220", address_complement: null,
        neighborhood: "Jardim Canadá", city: "Nova Lima", state: "MG", country: "BR", logo_url: null, description: null,
        service_agreement_url: "agencies/a1/agreements/x.pdf", service_agreement_filename: "x.pdf", management_fee: "10", agreement_start_date: "2026-01-01", agreement_end_date: "2026-12-31",
        status: "ACTIVE", verified_at: null, created_at: "2025-03-10T12:00:00Z", updated_at: "2026-09-20T12:00:00Z", role: "OWNER",
        ...over,
    };
}

function lease(over: Partial<AgencyLeaseSummary> = {}): AgencyLeaseSummary {
    return {
        id: "l1", agency_id: "a1", reference_name: "Kitnet 3", property_id: "p1", property_name: "Ed. Flores", unit_name: "Kitnet 3",
        start_date: "2026-01-01", end_date: "2026-12-31", termination_date: null, status: "ACTIVE", monthly_rent: 1500,
        primary_tenant_id: "t1", primary_tenant_name: "Beatriz Souza", agent_id: null, agent_name: null,
        ...over,
    };
}

const tenant = (over: Partial<AgencyTenantSummary> = {}): AgencyTenantSummary => ({ id: "t1", agency_id: "a1", full_name: "Beatriz Souza", status: "ACTIVE", property_id: "p1", property_name: "Ed. Flores", main_phone: null, ...over });
const agent = (over: Partial<AgencyAgentSummary> = {}): AgencyAgentSummary => ({ id: "g1", agency_id: "a1", full_name: "Marcos Oliveira", status: "ACTIVE", creci_number: "23456", creci_state: "MG", main_phone: null, main_phone_whatsapp: false, email: null, photo_url: null, ...over });

describe("feePercent / daysBetween / creciLabel", () => {
    it("reads the fee whatever the column holds", () => {
        expect(feePercent("12,5")).toBe(12.5);
        expect(feePercent(8)).toBe(8);
        expect(feePercent("")).toBeNull();
        expect(feePercent(null)).toBeNull();
        expect(feePercent("abc")).toBeNull();
    });
    it("counts calendar days", () => {
        expect(daysBetween("2026-09-25", "2026-12-31")).toBe(97);
        expect(daysBetween("2026-09-25", "2026-09-20")).toBe(-5);
    });
    it("labels the CRECI by its kind", () => {
        expect(creciLabel({ creci_number: "5358", creci_state: "MG", creci_type: "PJ" })).toBe("CRECI-J MG 5358");
        expect(creciLabel({ creci_number: "5358", creci_state: "MG", creci_type: null })).toBe("CRECI MG 5358");
        expect(creciLabel({ creci_number: null, creci_state: "MG", creci_type: "PJ" })).toBeNull();
    });
});

describe("agreementInfo", () => {
    it("flags an agreement ending within 90 days and one already ended", () => {
        expect(agreementInfo(agency({ agreement_end_date: "2026-12-31" }), TODAY)).toMatchObject({ hasFile: true, daysToEnd: 97, expiring: false, expired: false });
        expect(agreementInfo(agency({ agreement_end_date: "2026-11-01" }), TODAY)).toMatchObject({ daysToEnd: 37, expiring: true, expired: false });
        expect(agreementInfo(agency({ agreement_end_date: "2026-09-01" }), TODAY)).toMatchObject({ expiring: false, expired: true });
        expect(agreementInfo(agency({ agreement_end_date: null, service_agreement_url: null, service_agreement_filename: null }), TODAY)).toMatchObject({ hasFile: false, daysToEnd: null, expired: false });
    });
});

describe("agencyRows", () => {
    it("sums the rent in force and what the fee costs", () => {
        const rows = agencyRows(
            [agency()],
            [lease(), lease({ id: "l2", monthly_rent: 2500, status: "EXPIRING_SOON" }), lease({ id: "l3", monthly_rent: 9000, status: "EXPIRED" })],
            [tenant(), tenant({ id: "t2", status: "FORMER" })],
            [agent(), agent({ id: "g2", status: "INACTIVE" })],
            TODAY
        );
        expect(rows).toHaveLength(1);
        const r = rows[0];
        expect(r.displayName).toBe("Horizonte");
        expect(r.inForce.map(l => l.id)).toEqual(["l1", "l2"]);
        expect(r.rentManaged).toBe(4000);
        expect(r.feePct).toBe(10);
        expect(r.monthlyFee).toBe(400);
        expect(r.activeTenants).toBe(1);
        expect(r.activeAgents).toBe(1);
        expect(r.cnpj).toBe("21.951.040/0001-99");
        expect(r.creci).toBe("CRECI-J MG 5358");
        expect(r.place).toBe("Nova Lima/MG");
        expect(r.whatsapp).toContain("5531999990001");
        expect(r.haystack).toContain("beatriz souza");
        expect(r.haystack).toContain("horizonte");
    });
    it("leaves the fee cost at zero when the fee is unknown", () => {
        const r = agencyRows([agency({ management_fee: null })], [lease()], [], [], TODAY)[0];
        expect(r.feePct).toBeNull();
        expect(r.monthlyFee).toBe(0);
    });
});

describe("agencyHubTotals", () => {
    it("counts each lease once and separates the unknown fees", () => {
        const rows = agencyRows(
            [agency(), agency({ id: "a2", name: "Salles", trade_name: null, management_fee: null, status: "SUSPENDED", service_agreement_url: null, service_agreement_filename: null, agreement_end_date: null, main_phone: "", email: null })],
            [lease(), lease({ id: "l2", agency_id: "a2", monthly_rent: 3000 }), lease({ id: "l3", agency_id: "a2", status: "EXPIRED" })],
            [tenant(), tenant({ id: "t2", agency_id: "a2" })],
            [agent()],
            TODAY
        );
        const t = agencyHubTotals(rows);
        expect(t).toMatchObject({ total: 2, active: 1, inactive: 1, leasesInForce: 2, leasesTotal: 3, rentManaged: 4500, monthlyFees: 150, feeUnknownLeases: 1, tenantsServed: 2, agentsLinked: 1, withAgreement: 1, agreementsExpiring: 0, agreementsExpired: 0, withoutContact: 0, idle: 0 });
    });
});

describe("agencyAttention", () => {
    it("lists the problems worst first", () => {
        const rows = agencyRows(
            [
                agency({ id: "a2", name: "Suspensa Ltda", status: "SUSPENDED" }),
                agency({ id: "a3", name: "Vencida Ltda", agreement_end_date: "2026-08-01" }),
                agency({ id: "a4", name: "Sem taxa Ltda", management_fee: null, service_agreement_url: null, service_agreement_filename: null, agreement_end_date: null }),
                agency({ id: "a5", name: "Parada Ltda", main_phone: "", email: null, agreement_end_date: "2026-10-10" }),
            ],
            [lease({ agency_id: "a2" }), lease({ id: "l3", agency_id: "a3" }), lease({ id: "l4", agency_id: "a4" })],
            [],
            [],
            TODAY
        );
        const items = agencyAttention(rows);
        expect(items.map(i => i.kind)).toEqual(["suspended_with_leases", "agreement_expired", "agreement_expiring", "no_fee_with_leases", "no_agreement_with_leases", "no_contact", "idle"]);
        expect(items[2].text).toContain("15 dias");
    });
});

describe("inAgencyView", () => {
    it("treats verified as active", () => {
        expect(inAgencyView("VERIFIED", "ativas")).toBe(true);
        expect(inAgencyView("DRAFT", "ativas")).toBe(false);
        expect(inAgencyView("SUSPENDED", "inativas")).toBe(true);
        expect(inAgencyView("DRAFT", "todas")).toBe(true);
    });
});
