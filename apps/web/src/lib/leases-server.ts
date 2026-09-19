import type { AdminSupabase } from "@/lib/api-auth";
import { badRequest, notFound } from "@/lib/api-route";
import type { LeaseInput } from "@/lib/schemas/lease";
import { findPropertyUnit } from "@/lib/property-units-server";

/**
 * Shared server-side pieces for the leases (contratos) routes.
 */

export const LEASE_SELECT_WITH_NAMES = `
    *,
    property:properties!property_id(name),
    primary_tenant:tenants!primary_tenant_id(full_name),
    agency:agencies!agency_id(name),
    agent:agents!agent_id(full_name)
`;

/** Flattens the joined names the list and detail views expect. */
export function flattenLease(l: Record<string, unknown>): Record<string, unknown> {
    return {
        ...l,
        property_name: (l.property as Record<string, unknown> | null)?.name || null,
        primary_tenant_name: (l.primary_tenant as Record<string, unknown> | null)?.full_name || null,
        agency_name: (l.agency as Record<string, unknown> | null)?.name || null,
        agent_name: (l.agent as Record<string, unknown> | null)?.full_name || null,
        property: undefined,
        primary_tenant: undefined,
        agency: undefined,
        agent: undefined,
    };
}

/** The lease row if it exists, is not deleted and belongs to the account; 404 otherwise. */
export async function loadOwnedLease(
    supabase: AdminSupabase,
    leaseId: string,
    profileId: string,
    columns: string = "id"
): Promise<Record<string, unknown>> {
    const { data } = await supabase
        .from("leases")
        .select(columns as "*")
        .eq("id", leaseId)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .maybeSingle();
    if (!data) throw notFound("Contrato não encontrado.");
    return data as Record<string, unknown>;
}

/**
 * Property and tenant must belong to the account; agency and agent must be reachable by it;
 * a unit must be one of the property's. Resolves the unit's current name, stored with the lease.
 */
export async function assertLeaseRelations(supabase: AdminSupabase, profileId: string, lease: LeaseInput["lease"]): Promise<{ unit_name: string | null }> {
    const { data: property } = await supabase
        .from("properties")
        .select("id")
        .eq("id", lease.property_id)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (!property) throw badRequest({ property_id: "Imóvel não encontrado ou não pertence à sua conta." });

    let unitName: string | null = null;
    if (lease.unit_id) {
        const unit = await findPropertyUnit(supabase, profileId, lease.property_id, lease.unit_id);
        if (!unit) throw badRequest({ property_id: "Unidade não encontrada neste imóvel." });
        unitName = unit.name;
    }

    const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", lease.primary_tenant_id)
        .eq("user_id", profileId)
        .is("deleted_at", null)
        .maybeSingle();
    if (!tenant) throw badRequest({ primary_tenant_id: "Inquilino não encontrado ou não pertence à sua conta." });

    if (lease.agency_id) {
        const { data: member } = await supabase
            .from("agency_members")
            .select("id")
            .eq("agency_id", lease.agency_id)
            .eq("user_id", profileId)
            .maybeSingle();
        if (!member) {
            const { data: agency } = await supabase
                .from("agencies")
                .select("id")
                .eq("id", lease.agency_id)
                .is("deleted_at", null)
                .maybeSingle();
            if (!agency) throw badRequest({ agency_id: "Imobiliária não encontrada." });
        }
    }

    if (lease.agent_id) {
        const { data: agent } = await supabase
            .from("agents")
            .select("id")
            .eq("id", lease.agent_id)
            .eq("user_id", profileId)
            .is("deleted_at", null)
            .maybeSingle();
        if (!agent) throw badRequest({ agent_id: "Corretor não encontrado." });
    }

    return { unit_name: unitName };
}

/**
 * A non-blocking warning when what is being rented already has another active lease.
 * Units of the same property do not clash with each other; a whole-property lease clashes with all.
 */
export async function activeLeaseWarning(
    supabase: AdminSupabase,
    profileId: string,
    lease: LeaseInput["lease"],
    excludeLeaseId?: string
): Promise<string | null> {
    if (lease.status !== "ACTIVE") return null;
    let q = supabase
        .from("leases")
        .select("id, reference_name, unit_id")
        .eq("property_id", lease.property_id)
        .eq("user_id", profileId)
        .eq("status", "ACTIVE")
        .is("deleted_at", null);
    if (excludeLeaseId) q = q.neq("id", excludeLeaseId);
    const { data } = await q;
    const clash = (data || []).find((other) => !lease.unit_id || !other.unit_id || other.unit_id === lease.unit_id);
    if (!clash) return null;
    const name = (clash.reference_name as string | null) || "Sem referência";
    const what = lease.unit_id && clash.unit_id ? "Esta unidade" : "Este imóvel";
    return excludeLeaseId
        ? `${what} já possui outro contrato ativo: "${name}".`
        : `${what} já possui um contrato ativo: "${name}". Salvando mesmo assim.`;
}

/**
 * Writes the lease's additional tenants and charges. With `replace`, existing
 * rows are removed first (update). Additional tenants are restricted to the
 * account's own tenants: an id that is not theirs is dropped.
 */
export async function writeLeaseChildren(
    supabase: AdminSupabase,
    profileId: string,
    leaseId: string,
    input: Pick<LeaseInput, "additional_tenants" | "charges">,
    opts: { replace?: boolean; tag: string }
): Promise<void> {
    if (opts.replace) {
        await supabase.from("lease_tenants").delete().eq("lease_id", leaseId);
        await supabase.from("lease_charges").delete().eq("lease_id", leaseId);
    }

    if (input.additional_tenants.length > 0) {
        const ids = [...new Set(input.additional_tenants.map((t) => t.tenant_id))];
        const { data: owned } = await supabase
            .from("tenants")
            .select("id")
            .in("id", ids)
            .eq("user_id", profileId)
            .is("deleted_at", null);
        const ownedIds = new Set((owned || []).map((t) => t.id as string));
        const rows = input.additional_tenants
            .filter((t) => ownedIds.has(t.tenant_id))
            .map((t) => ({ lease_id: leaseId, tenant_id: t.tenant_id, role: t.role }));
        if (rows.length > 0) {
            const { error } = await supabase.from("lease_tenants").insert(rows);
            if (error) console.error(`[${opts.tag}] Tenants insert error:`, error);
        }
    }

    if (input.charges.length > 0) {
        const { error } = await supabase
            .from("lease_charges")
            .insert(input.charges.map((c) => ({ lease_id: leaseId, ...c })));
        if (error) console.error(`[${opts.tag}] Charges insert error:`, error);
    }
}

export const LEASE_DOCUMENTS_BUCKET = "lease-documents";
