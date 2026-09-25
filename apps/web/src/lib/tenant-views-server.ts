/**
 * Builds the two views of Inquilinos — the hub's list and one tenant's dashboard — for whoever
 * asks: the API routes (`GET /api/tenants`, `GET /api/tenants/[id]/dashboard`) and the page,
 * which preloads them on the server so the first paint already has the cards.
 *
 * Photos live in a private bucket and are signed in one storage call per view.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { notFound } from "@/lib/api-route";
import { signStorageUrls } from "@/lib/storage";
import { syncLeaseUnitNames } from "@/lib/leases-server";
import { loadIncomeRows } from "@/lib/lease-views-server";
import { IN_FORCE } from "@/lib/lease-dashboard";
import { addMonths } from "@/lib/lease-summary";
import { TENANT_PHOTO_BUCKET } from "@/lib/tenants-server";
import type { TenantWithDetails } from "@/types/tenant";
import type { LeaseStatus } from "@/types/lease";
import type { TenantDashboardView, TenantLeaseRole, TenantLeaseSummary, TenantListView } from "@/lib/tenant-views";

const TENANT_SELECT = `
    *,
    properties!tenants_property_id_fkey ( name ),
    agencies!tenants_agency_id_fkey ( name ),
    agents!tenants_agent_id_fkey ( full_name )
`;

function flattenTenant(t: Record<string, unknown>, photoUrl: string | null): TenantWithDetails {
    const property = t.properties as { name: string } | null;
    const agency = t.agencies as { name: string } | null;
    const agent = t.agents as { full_name: string } | null;
    return {
        ...(t as unknown as TenantWithDetails),
        property_name: property?.name || null,
        agency_name: agency?.name || null,
        agent_name: agent?.full_name || null,
        photo_url: photoUrl,
        properties: undefined,
        agencies: undefined,
        agents: undefined,
    } as TenantWithDetails;
}

/** Signed URLs for the tenants' photos, keyed by object path. */
async function signPhotos(supabase: AdminSupabase, rows: Array<{ photo_path?: string | null }>): Promise<Map<string, string>> {
    const paths = rows.map(r => r.photo_path).filter((p): p is string => Boolean(p));
    return paths.length > 0 ? signStorageUrls(supabase, TENANT_PHOTO_BUCKET, paths) : new Map();
}

/** The account's tenants (soft-deleted excluded) with the joined names and signed photos. */
export async function loadTenantRows(supabase: AdminSupabase, profileId: string): Promise<TenantWithDetails[]> {
    const { data, error } = await supabase
        .from("tenants")
        .select(TENANT_SELECT)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
    if (error) throw new Error(`tenants: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { photo_path?: string | null }>;
    const signed = await signPhotos(supabase, rows);
    return rows.map(t => flattenTenant(t, t.photo_path ? signed.get(t.photo_path) ?? null : null));
}

const LEASE_SELECT = `
    id, reference_name, property_id, unit_id, unit_name, primary_tenant_id, start_date, end_date, termination_date, status,
    monthly_rent, rent_due_day, security_deposit, adjustment_index, management_type,
    property:properties!property_id(name), agency:agencies!agency_id(name)
`;

/**
 * Every lease of the account as the tenant screens need it: one entry per tenant on the lease
 * (the primary one and each additional tenant with their role). Restricted to `tenantIds` when given.
 */
export async function loadTenantLeases(supabase: AdminSupabase, profileId: string, tenantIds?: string[]): Promise<TenantLeaseSummary[]> {
    const { data, error } = await supabase
        .from("leases")
        .select(LEASE_SELECT)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
    if (error) throw new Error(`tenant leases: ${error.message}`);
    const raw = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (raw.length === 0) return [];
    const leases = await syncLeaseUnitNames(supabase, profileId, raw);
    const ids = leases.map(l => String(l.id));

    const [{ data: links }, { data: docs }] = await Promise.all([
        supabase.from("lease_tenants").select("lease_id, tenant_id, role").in("lease_id", ids),
        supabase.from("lease_documents").select("lease_id").in("lease_id", ids),
    ]);
    const docCounts = new Map<string, number>();
    for (const d of docs ?? []) docCounts.set(d.lease_id, (docCounts.get(d.lease_id) ?? 0) + 1);

    const out: TenantLeaseSummary[] = [];
    const push = (l: Record<string, unknown>, tenantId: string, role: TenantLeaseRole) => {
        if (tenantIds && !tenantIds.includes(tenantId)) return;
        out.push({
            id: String(l.id),
            tenant_id: tenantId,
            role,
            reference_name: (l.reference_name as string | null) ?? null,
            property_id: String(l.property_id),
            property_name: (l.property as { name: string } | null)?.name ?? null,
            unit_id: (l.unit_id as string | null) ?? null,
            unit_name: (l.unit_name as string | null) ?? null,
            start_date: String(l.start_date),
            end_date: (l.end_date as string | null) ?? null,
            termination_date: (l.termination_date as string | null) ?? null,
            status: l.status as LeaseStatus,
            monthly_rent: Number(l.monthly_rent) || 0,
            rent_due_day: Number(l.rent_due_day) || 1,
            security_deposit: l.security_deposit == null ? null : Number(l.security_deposit),
            adjustment_index: (l.adjustment_index as string | null) ?? null,
            management_type: String(l.management_type),
            agency_name: (l.agency as { name: string } | null)?.name ?? null,
            document_count: docCounts.get(String(l.id)) ?? 0,
        });
    };
    for (const l of leases) {
        push(l, String(l.primary_tenant_id), "PRIMARY");
        for (const link of links ?? []) {
            if (link.lease_id === l.id) push(l, String(link.tenant_id), link.role === "OCCUPANT" ? "OCCUPANT" : "CO_TENANT");
        }
    }
    return out;
}

export async function loadTenantList(supabase: AdminSupabase, profileId: string): Promise<TenantListView> {
    const [tenants, leases] = await Promise.all([loadTenantRows(supabase, profileId), loadTenantLeases(supabase, profileId)]);
    return { tenants, leases };
}

/** One tenant with everything their dashboard shows; the 404 of a tenant that is not the account's. */
export async function loadTenantDashboard(supabase: AdminSupabase, tenantId: string, profileId: string): Promise<TenantDashboardView> {
    const { data } = await supabase
        .from("tenants")
        .select(TENANT_SELECT)
        .eq("id", tenantId)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .maybeSingle();
    if (!data) throw notFound("Inquilino não encontrado.");
    const row = data as unknown as Record<string, unknown> & { photo_path?: string | null };
    const [signed, leases] = await Promise.all([signPhotos(supabase, [row]), loadTenantLeases(supabase, profileId, [tenantId])]);
    const tenant = flattenTenant(row, row.photo_path ? signed.get(row.photo_path) ?? null : null);

    // The ledger months of the contract in force, else of the latest one — what the tenant paid.
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const incomeLease = leases.find(l => IN_FORCE.has(l.status)) ?? leases[0] ?? null;
    let income: TenantDashboardView["income"] = [];
    if (incomeLease) {
        const from = incomeLease.start_date.slice(0, 7);
        const last = ((incomeLease.termination_date ?? incomeLease.end_date) ?? today).slice(0, 7);
        const to = addMonths(`${last > today.slice(0, 7) ? today.slice(0, 7) : last}-01`, 1).slice(0, 7);
        income = await loadIncomeRows(supabase, incomeLease.property_id, from, to);
    }
    return { tenant, leases, income, incomeLeaseId: incomeLease?.id ?? null };
}
