/**
 * The two shapes the Imobiliárias pages render — the hub's list and one agency's dashboard — as the
 * server builds them (lib/agency-views-server.ts) and the client consumes them. Types only.
 */
import type { AgencyWithRole } from "@/types/agency";
import type { AgentStatus } from "@/types/agent";
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";

/** A lease the agency administers (`leases.agency_id`). */
export interface AgencyLeaseSummary {
    id: string;
    agency_id: string;
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
    agent_id: string | null;
    agent_name: string | null;
}

/** A tenant the agency looks after (`tenants.agency_id`). */
export interface AgencyTenantSummary {
    id: string;
    agency_id: string;
    full_name: string;
    status: TenantStatus;
    property_id: string;
    property_name: string | null;
    main_phone: string | null;
}

/** A corretor who works for the agency (`agents.agency_id`). */
export interface AgencyAgentSummary {
    id: string;
    agency_id: string;
    full_name: string;
    status: AgentStatus;
    creci_number: string;
    creci_state: string;
    main_phone: string | null;
    main_phone_whatsapp: boolean;
    email: string | null;
    photo_url: string | null;
}

export interface AgencyListView {
    agencies: AgencyWithRole[];
    leases: AgencyLeaseSummary[];
    tenants: AgencyTenantSummary[];
    agents: AgencyAgentSummary[];
}

export interface AgencyDashboardView {
    agency: AgencyWithRole;
    /** newest first */
    leases: AgencyLeaseSummary[];
    tenants: AgencyTenantSummary[];
    agents: AgencyAgentSummary[];
}
