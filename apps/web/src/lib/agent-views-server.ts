/**
 * Builds the two views of Corretores — the hub's list and one corretor's dashboard — for the API
 * routes (`GET /api/agents`, `GET /api/agents/[id]/dashboard`) and the page, which preloads them
 * on the server so the first paint already has the cards.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { forbidden, notFound } from "@/lib/api-route";
import { syncLeaseUnitNames } from "@/lib/leases-server";
import type { AgentWithAgency } from "@/types/agent";
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";
import type { AgentDashboardView, AgentLeaseSummary, AgentListView, AgentTenantSummary } from "@/lib/agent-views";

const AGENT_SELECT = `*, agencies!agents_agency_id_fkey ( name )`;

function flattenAgent(a: Record<string, unknown>): AgentWithAgency {
    const agency = a.agencies as { name: string } | null;
    return { ...(a as unknown as AgentWithAgency), agency_name: agency?.name || null, agencies: undefined } as AgentWithAgency;
}

/** The account's corretores (soft-deleted excluded) with the agency name. */
export async function loadAgentRows(supabase: AdminSupabase, profileId: string): Promise<AgentWithAgency[]> {
    const { data, error } = await supabase
        .from("agents")
        .select(AGENT_SELECT)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
    if (error) throw new Error(`agents: ${error.message}`);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(flattenAgent);
}

/** The leases and tenants that name a corretor, restricted to `agentIds` when given. */
export async function loadAgentLinks(supabase: AdminSupabase, profileId: string, agentIds?: string[]): Promise<{ leases: AgentLeaseSummary[]; tenants: AgentTenantSummary[] }> {
    let leaseQuery = supabase
        .from("leases")
        .select("id, agent_id, reference_name, property_id, unit_id, unit_name, start_date, end_date, termination_date, status, monthly_rent, primary_tenant_id, property:properties!property_id(name), tenant:tenants!primary_tenant_id(full_name), agency:agencies!agency_id(name)")
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .not("agent_id", "is", null)
        .order("start_date", { ascending: false });
    let tenantQuery = supabase
        .from("tenants")
        .select("id, agent_id, full_name, status, property_id, main_phone, properties!tenants_property_id_fkey ( name )")
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .not("agent_id", "is", null)
        .order("full_name", { ascending: true });
    if (agentIds) {
        leaseQuery = leaseQuery.in("agent_id", agentIds);
        tenantQuery = tenantQuery.in("agent_id", agentIds);
    }
    const [leasesRes, tenantsRes] = await Promise.all([leaseQuery, tenantQuery]);
    if (leasesRes.error) throw new Error(`agent leases: ${leasesRes.error.message}`);
    if (tenantsRes.error) throw new Error(`agent tenants: ${tenantsRes.error.message}`);

    const rows = await syncLeaseUnitNames(supabase, profileId, (leasesRes.data ?? []) as unknown as Record<string, unknown>[]);
    const leases: AgentLeaseSummary[] = rows.map(l => ({
        id: String(l.id),
        agent_id: String(l.agent_id),
        reference_name: (l.reference_name as string | null) ?? null,
        property_id: String(l.property_id),
        property_name: (l.property as { name: string } | null)?.name ?? null,
        unit_name: (l.unit_name as string | null) ?? null,
        start_date: String(l.start_date),
        end_date: (l.end_date as string | null) ?? null,
        termination_date: (l.termination_date as string | null) ?? null,
        status: l.status as LeaseStatus,
        monthly_rent: Number(l.monthly_rent) || 0,
        primary_tenant_id: String(l.primary_tenant_id),
        primary_tenant_name: (l.tenant as { full_name: string } | null)?.full_name ?? null,
        agency_name: (l.agency as { name: string } | null)?.name ?? null,
    }));
    const tenants: AgentTenantSummary[] = ((tenantsRes.data ?? []) as unknown as Record<string, unknown>[]).map(t => ({
        id: String(t.id),
        agent_id: String(t.agent_id),
        full_name: String(t.full_name),
        status: t.status as TenantStatus,
        property_id: String(t.property_id),
        property_name: (t.properties as { name: string } | null)?.name ?? null,
        main_phone: (t.main_phone as string | null) ?? null,
    }));
    return { leases, tenants };
}

export async function loadAgentList(supabase: AdminSupabase, profileId: string): Promise<AgentListView> {
    const [agents, links] = await Promise.all([loadAgentRows(supabase, profileId), loadAgentLinks(supabase, profileId)]);
    return { agents, ...links };
}

/** One corretor with what the dashboard shows; 404 when not the account's. */
export async function loadAgentDashboard(supabase: AdminSupabase, agentId: string, profileId: string): Promise<AgentDashboardView> {
    const { data } = await supabase.from("agents").select(AGENT_SELECT).eq("id", agentId).is("deleted_at", null).maybeSingle();
    if (!data) throw notFound("Corretor não encontrado.");
    const row = data as unknown as Record<string, unknown>;
    if (row.user_id !== profileId) throw forbidden("Sem permissão para ver este corretor.");
    const links = await loadAgentLinks(supabase, profileId, [agentId]);
    return { agent: flattenAgent(row), ...links };
}
