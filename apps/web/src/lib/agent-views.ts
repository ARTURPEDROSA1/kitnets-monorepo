/**
 * The two shapes the Corretores pages render — the hub's list and one corretor's dashboard — as the
 * server builds them (lib/agent-views-server.ts) and the client consumes them. Types only.
 */
import type { AgentWithAgency } from "@/types/agent";
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";

/** A lease the corretor runs (`leases.agent_id`). */
export interface AgentLeaseSummary {
    id: string;
    agent_id: string;
    reference_name: string | null;
    property_id: string;
    property_name: string | null;
    unit_name: string | null;
    start_date: string;
    end_date: string | null;
    termination_date: string | null;
    status: LeaseStatus;
    monthly_rent: number;
    primary_tenant_id: string;
    primary_tenant_name: string | null;
    agency_name: string | null;
}

/** A tenant the corretor looks after (`tenants.agent_id`). */
export interface AgentTenantSummary {
    id: string;
    agent_id: string;
    full_name: string;
    status: TenantStatus;
    property_id: string;
    property_name: string | null;
    main_phone: string | null;
}

export interface AgentListView {
    agents: AgentWithAgency[];
    leases: AgentLeaseSummary[];
    tenants: AgentTenantSummary[];
}

export interface AgentDashboardView {
    agent: AgentWithAgency;
    /** newest first */
    leases: AgentLeaseSummary[];
    tenants: AgentTenantSummary[];
}
