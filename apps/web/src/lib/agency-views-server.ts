/**
 * Builds the two views of Imobiliárias — the hub's list and one agency's dashboard — for the API
 * routes (`GET /api/agencies`, `GET /api/agencies/[id]/dashboard`) and the page, which preloads
 * them on the server so the first paint already has the cards.
 *
 * Agencies reach an account through `agency_members`; the leases, tenants and corretores that
 * name an agency are the account's own rows.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { forbidden, notFound } from "@/lib/api-route";
import { syncLeaseUnitNames } from "@/lib/leases-server";
import { withSignedAgreement } from "@/lib/agency-agreement";
import type { AgencyWithRole } from "@/types/agency";
import type { AgentStatus } from "@/types/agent";
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";
import type { AgencyAgentSummary, AgencyDashboardView, AgencyLeaseSummary, AgencyListView, AgencyTenantSummary } from "@/lib/agency-views";

type MembershipRow = { role?: string | null; agencies?: Record<string, unknown> | null };

/** The agencies the account is a member of (soft-deleted excluded), with the role and a signed agreement URL. */
export async function loadAgencyRows(supabase: AdminSupabase, profileId: string): Promise<AgencyWithRole[]> {
    const { data, error } = await supabase
        .from("agency_members")
        .select("role, agencies!inner(*)")
        .eq("user_id", profileId)
        .is("agencies.deleted_at", null);
    if (error) throw new Error(`agencies: ${error.message}`);
    const rows = await Promise.all(
        ((data ?? []) as unknown as MembershipRow[])
            .filter(m => m.agencies)
            .map(m => withSignedAgreement(supabase, { ...(m.agencies as Record<string, unknown>), role: m.role || "VIEWER" } as unknown as AgencyWithRole))
    );
    return rows.sort((a, b) => (a.trade_name || a.name).localeCompare(b.trade_name || b.name, "pt-BR"));
}

/** The account's leases, tenants and corretores that name one of `agencyIds`. */
export async function loadAgencyLinks(
    supabase: AdminSupabase,
    profileId: string,
    agencyIds: string[]
): Promise<{ leases: AgencyLeaseSummary[]; tenants: AgencyTenantSummary[]; agents: AgencyAgentSummary[] }> {
    if (agencyIds.length === 0) return { leases: [], tenants: [], agents: [] };
    const [leasesRes, tenantsRes, agentsRes] = await Promise.all([
        supabase
            .from("leases")
            .select("id, agency_id, agent_id, reference_name, property_id, unit_id, unit_name, start_date, end_date, termination_date, status, monthly_rent, primary_tenant_id, property:properties!property_id(name), tenant:tenants!primary_tenant_id(full_name), agent:agents!agent_id(full_name)")
            .eq("user_id", profileId)
            .is("deleted_at", null)
            .in("agency_id", agencyIds)
            .order("start_date", { ascending: false }),
        supabase
            .from("tenants")
            .select("id, agency_id, full_name, status, property_id, main_phone, properties!tenants_property_id_fkey ( name )")
            .eq("user_id", profileId)
            .is("deleted_at", null)
            .in("agency_id", agencyIds)
            .order("full_name", { ascending: true }),
        supabase
            .from("agents")
            .select("id, agency_id, full_name, status, creci_number, creci_state, main_phone, main_phone_whatsapp, email, photo_url")
            .eq("user_id", profileId)
            .is("deleted_at", null)
            .in("agency_id", agencyIds)
            .order("full_name", { ascending: true }),
    ]);
    if (leasesRes.error) throw new Error(`agency leases: ${leasesRes.error.message}`);
    if (tenantsRes.error) throw new Error(`agency tenants: ${tenantsRes.error.message}`);
    if (agentsRes.error) throw new Error(`agency agents: ${agentsRes.error.message}`);

    const rows = await syncLeaseUnitNames(supabase, profileId, (leasesRes.data ?? []) as unknown as Record<string, unknown>[]);
    const leases: AgencyLeaseSummary[] = rows.map(l => ({
        id: String(l.id),
        agency_id: String(l.agency_id),
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
        agent_id: (l.agent_id as string | null) ?? null,
        agent_name: (l.agent as { full_name: string } | null)?.full_name ?? null,
    }));
    const tenants: AgencyTenantSummary[] = ((tenantsRes.data ?? []) as unknown as Record<string, unknown>[]).map(t => ({
        id: String(t.id),
        agency_id: String(t.agency_id),
        full_name: String(t.full_name),
        status: t.status as TenantStatus,
        property_id: String(t.property_id),
        property_name: (t.properties as { name: string } | null)?.name ?? null,
        main_phone: (t.main_phone as string | null) ?? null,
    }));
    const agents: AgencyAgentSummary[] = ((agentsRes.data ?? []) as unknown as Record<string, unknown>[]).map(g => ({
        id: String(g.id),
        agency_id: String(g.agency_id),
        full_name: String(g.full_name),
        status: g.status as AgentStatus,
        creci_number: String(g.creci_number ?? ""),
        creci_state: String(g.creci_state ?? ""),
        main_phone: (g.main_phone as string | null) ?? null,
        main_phone_whatsapp: Boolean(g.main_phone_whatsapp),
        email: (g.email as string | null) ?? null,
        photo_url: (g.photo_url as string | null) ?? null,
    }));
    return { leases, tenants, agents };
}

export async function loadAgencyList(supabase: AdminSupabase, profileId: string): Promise<AgencyListView> {
    const agencies = await loadAgencyRows(supabase, profileId);
    const links = await loadAgencyLinks(supabase, profileId, agencies.map(a => a.id));
    return { agencies, ...links };
}

/** One agency with what the dashboard shows; 404 when unknown, 403 when the account is not a member. */
export async function loadAgencyDashboard(supabase: AdminSupabase, agencyId: string, profileId: string): Promise<AgencyDashboardView> {
    const [agencyRes, memberRes] = await Promise.all([
        supabase.from("agencies").select("*").eq("id", agencyId).is("deleted_at", null).maybeSingle(),
        supabase.from("agency_members").select("role").eq("agency_id", agencyId).eq("user_id", profileId).maybeSingle(),
    ]);
    if (!agencyRes.data) throw notFound("Imobiliária não encontrada.");
    if (!memberRes.data) throw forbidden("Sem permissão para ver esta imobiliária.");
    const agency = await withSignedAgreement(supabase, { ...(agencyRes.data as Record<string, unknown>), role: memberRes.data.role || "VIEWER" } as unknown as AgencyWithRole);
    const links = await loadAgencyLinks(supabase, profileId, [agencyId]);
    return { agency, ...links };
}
