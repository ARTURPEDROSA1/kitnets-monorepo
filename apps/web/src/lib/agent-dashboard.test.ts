import { describe, expect, it } from "vitest";
import type { AgentWithAgency } from "@/types/agent";
import type { AgentLeaseSummary, AgentTenantSummary } from "@/lib/agent-views";
import { affiliationOf, agentAttention, agentHubTotals, agentRows, inAgentView } from "@/lib/agent-dashboard";

const TODAY = "2026-09-25";

function agent(over: Partial<AgentWithAgency> & { id: string }): AgentWithAgency {
    return {
        user_id: "u1", full_name: "Marcos Ribeiro", cpf: null, photo_url: null, creci_number: "12345", creci_state: "MG",
        agent_type: "IMOBILIARIA", agency_id: "a1", main_phone: "+5531988880000", main_phone_whatsapp: true, additional_phone: null,
        additional_phone_whatsapp: false, email: "marcos@mr.com", website: null, notes: null, status: "ACTIVE",
        created_at: "2025-03-10T12:00:00Z", updated_at: "2025-03-10T12:00:00Z", agency_name: "MR Imóveis",
        ...over,
    };
}
function lease(over: Partial<AgentLeaseSummary> & { id: string; agent_id: string }): AgentLeaseSummary {
    return {
        reference_name: null, property_id: "p1", property_name: "SANTO ANTONIO", unit_name: "Kitnet 35A", start_date: "2025-01-06", end_date: "2027-07-06",
        termination_date: null, status: "ACTIVE", monthly_rent: 1300, primary_tenant_id: "t1", primary_tenant_name: "Luiz", agency_name: "MR Imóveis",
        ...over,
    };
}
function tenant(over: Partial<AgentTenantSummary> & { id: string; agent_id: string }): AgentTenantSummary {
    return { full_name: "Luiz", status: "ACTIVE", property_id: "p1", property_name: "SANTO ANTONIO", main_phone: null, ...over };
}

describe("agentRows", () => {
    const rows = agentRows(
        [
            agent({ id: "g1" }),
            agent({ id: "g2", full_name: "Paula Lima", agent_type: "AUTONOMO", agency_id: null, agency_name: null, main_phone: null, main_phone_whatsapp: false, email: null, status: "ACTIVE" }),
            agent({ id: "g3", full_name: "Carlos Inativo", status: "INACTIVE" }),
            agent({ id: "g4", full_name: "Sem Agência", agency_id: null, agency_name: null }),
        ],
        [
            lease({ id: "l1", agent_id: "g1" }),
            lease({ id: "l0", agent_id: "g1", start_date: "2023-01-06", end_date: "2024-12-31", status: "EXPIRED", monthly_rent: 1100 }),
            lease({ id: "l2", agent_id: "g3", monthly_rent: 4000, property_name: "VALE DO SOL", unit_name: null }),
        ],
        [tenant({ id: "t1", agent_id: "g1" }), tenant({ id: "t2", agent_id: "g1", full_name: "Ana", status: "FORMER" }), tenant({ id: "t3", agent_id: "g3", full_name: "Danilo" })],
        TODAY
    );
    const byId = Object.fromEntries(rows.map(r => [r.agent.id, r]));

    it("collects each corretor's contracts, rent and tenants", () => {
        const r = byId.g1;
        expect(r.leases.map(l => l.id)).toEqual(["l1", "l0"]);
        expect(r.inForce.map(l => l.id)).toEqual(["l1"]);
        expect(r.rentManaged).toBe(1300);
        expect(r.activeTenants).toBe(1);
        expect(r.creci).toBe("CRECI-MG 12345");
        expect(r.affiliation).toBe("MR Imóveis");
        expect(r.since).toBe("2025-03-10");
        expect(r.monthsRegistered).toBe(18);
        expect(r.whatsapp).toBe("https://wa.me/5531988880000");
        expect(r.haystack).toContain("kitnet 35a");
    });
    it("labels an autonomous corretor and a lost agency link", () => {
        expect(byId.g2.affiliation).toBe("Corretor autônomo");
        expect(byId.g2.whatsapp).toBeNull();
        expect(byId.g2.tel).toBeNull();
        expect(affiliationOf(byId.g4.agent)).toBe("Imobiliária removida");
    });
    it("filters the views", () => {
        expect(inAgentView("ACTIVE", "ativos")).toBe(true);
        expect(inAgentView("INACTIVE", "ativos")).toBe(false);
        expect(inAgentView("INACTIVE", "inativos")).toBe(true);
        expect(inAgentView("INACTIVE", "todos")).toBe(true);
    });
    it("adds the hub up, each contract once", () => {
        expect(agentHubTotals(rows)).toEqual({
            total: 4, active: 3, inactive: 1,
            leasesInForce: 2, leasesTotal: 3, rentManaged: 5300,
            tenantsServed: 2, agencies: 1, autonomous: 1, withoutContact: 1, idle: 2,
        });
    });
    it("lists what deserves a look, most pressing first", () => {
        const items = agentAttention(rows);
        expect(items.map(i => `${i.kind}:${i.row.agent.id}`)).toEqual([
            "inactive_with_leases:g3",
            "agency_gone:g4",
            "no_phone:g2",
            "idle:g2",
            "idle:g4",
        ]);
        expect(items[0].text).toContain("1 contrato em vigor");
    });
});
