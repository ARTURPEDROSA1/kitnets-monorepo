/**
 * Keeps each tenant's status in line with their contracts (the rule: lib/tenant-status.ts), called by the
 * lease routes after a contract is created, edited or closed, and by the notice cron. Never throws: the
 * lease change is already done, and a status left behind is put right by the next change.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import type { LeaseStatus } from "@/types/lease";
import type { TenantStatus } from "@/types/tenant";
import { tenantStatusPatch, type TenantLeaseFacts } from "@/lib/tenant-status";

const unique = (ids: Array<string | null | undefined>): string[] => [...new Set(ids.filter((id): id is string => !!id))];

/** The tenants on these leases: the primary one and every additional tenant. */
export async function leaseTenantIds(supabase: AdminSupabase, leaseIds: string[]): Promise<string[]> {
    if (leaseIds.length === 0) return [];
    try {
        const [{ data: leases, error: e1 }, { data: links, error: e2 }] = await Promise.all([
            supabase.from("leases").select("primary_tenant_id").in("id", leaseIds),
            supabase.from("lease_tenants").select("tenant_id").in("lease_id", leaseIds),
        ]);
        if (e1 || e2) throw new Error((e1 ?? e2)!.message);
        return unique([...(leases ?? []).map((l) => l.primary_tenant_id as string), ...(links ?? []).map((l) => l.tenant_id as string)]);
    } catch (err) {
        console.error("[Tenant status] loading the lease tenants failed:", (err as Error).message);
        return [];
    }
}

/** Updates the status (and move-out day) of the tenants whose contracts say otherwise; → how many changed. */
export async function syncTenantStatus(
    supabase: AdminSupabase,
    tenantIds: Array<string | null | undefined>,
    opts: { today: string; termOf?: string | null }
): Promise<number> {
    const ids = unique(tenantIds);
    if (ids.length === 0) return 0;
    try {
        const [{ data: tenants, error: e1 }, { data: links, error: e2 }] = await Promise.all([
            supabase.from("tenants").select("id, status, move_out_date").in("id", ids).is("deleted_at", null),
            supabase.from("lease_tenants").select("lease_id, tenant_id").in("tenant_id", ids),
        ]);
        if (e1 || e2) throw new Error((e1 ?? e2)!.message);
        if (!tenants || tenants.length === 0) return 0;

        const linkedLeaseIds = unique((links ?? []).map((l) => l.lease_id as string));
        const columns = "id, primary_tenant_id, status, start_date, end_date, termination_date";
        const [{ data: asPrimary, error: e3 }, { data: asLinked, error: e4 }] = await Promise.all([
            supabase.from("leases").select(columns).in("primary_tenant_id", ids).is("deleted_at", null),
            linkedLeaseIds.length > 0
                ? supabase.from("leases").select(columns).in("id", linkedLeaseIds).is("deleted_at", null)
                : Promise.resolve({ data: [] as never[], error: null }),
        ]);
        if (e3 || e4) throw new Error((e3 ?? e4)!.message);

        const leasesOf = new Map<string, Map<string, TenantLeaseFacts>>();
        const add = (tenantId: string, l: Record<string, unknown>) => {
            if (!leasesOf.has(tenantId)) leasesOf.set(tenantId, new Map());
            leasesOf.get(tenantId)!.set(String(l.id), {
                status: l.status as LeaseStatus,
                start_date: (l.start_date as string | null) ?? null,
                end_date: (l.end_date as string | null) ?? null,
                termination_date: (l.termination_date as string | null) ?? null,
            });
        };
        const byId = new Map<string, Record<string, unknown>>();
        for (const l of [...(asPrimary ?? []), ...(asLinked ?? [])] as Array<Record<string, unknown>>) byId.set(String(l.id), l);
        for (const l of byId.values()) if (l.primary_tenant_id) add(String(l.primary_tenant_id), l);
        for (const link of links ?? []) {
            const l = byId.get(link.lease_id as string);
            if (l) add(link.tenant_id as string, l);
        }

        let changed = 0;
        for (const t of tenants) {
            const patch = tenantStatusPatch(
                { status: t.status as TenantStatus, move_out_date: (t.move_out_date as string | null) ?? null },
                [...(leasesOf.get(t.id as string)?.values() ?? [])],
                opts
            );
            if (!patch) continue;
            const { error } = await supabase.from("tenants").update(patch).eq("id", t.id);
            if (error) throw new Error(error.message);
            changed++;
        }
        return changed;
    } catch (err) {
        console.error("[Tenant status] sync failed:", (err as Error).message);
        return 0;
    }
}
