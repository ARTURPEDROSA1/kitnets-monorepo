import type { LeaseImportResult } from "@/components/contratos/LeaseImportModal";
import type { LeaseStatus, LeaseWithDetails } from "@/types/lease";
import { attachLeaseContract } from "@/lib/lease-upload-client";

/**
 * Turns a reviewed lease import straight into a lease, for the places that import without opening
 * the Contratos form (the unit cards on the Imóveis page). Browser-side: goes through the API routes.
 */

export interface ImportedLeaseOutcome {
    ok: boolean;
    leaseId?: string;
    /** The account already had this lease (same unit, tenant and start date): nothing was created */
    alreadyExisted?: boolean;
    /** The agreement file could not be attached (type or size the lease documents do not take, or upload failure) */
    fileSkipped?: boolean;
    warning?: string | null;
    /** What stopped the lease from being created, ready to show */
    errors?: string[];
}

/** The lease payload POST /api/leases expects, from what the import read and settled. */
export function leasePayloadFromImport(
    result: LeaseImportResult,
    opts: { unitId: string | null; referenceName: string; today: string; /** forces the status (an old contract imported as history is EXPIRED whatever its dates say) */ status?: LeaseStatus }
): Record<string, unknown> {
    const { lease, charges } = result.data;
    return {
        reference_name: opts.referenceName,
        property_id: result.propertyId,
        unit_id: opts.unitId,
        primary_tenant_id: result.primaryTenantId,
        // an agency runs the lease when there is one; a corretor alone is an autonomous broker; else the owner
        management_type: result.agencyId ? "AGENCY" : result.agentId ? "AGENT" : "SELF_MANAGED",
        agency_id: result.agencyId || null,
        agent_id: result.agentId || null,
        start_date: lease.start_date,
        end_date: lease.end_date,
        monthly_rent: lease.monthly_rent,
        rent_due_day: lease.rent_due_day,
        security_deposit: lease.security_deposit,
        deposit_months: lease.deposit_months,
        adjustment_index: lease.adjustment_index,
        adjustment_frequency: lease.adjustment_frequency ?? 12,
        next_adjustment_date: null,
        status: opts.status ?? (lease.end_date && lease.end_date < opts.today ? "EXPIRED" : "ACTIVE"),
        notes: lease.notes,
        additional_tenants: result.additionalTenants,
        charges: charges.map((c) => ({
            charge_type: c.charge_type,
            label: c.label,
            responsibility: c.responsibility,
            amount: c.amount,
            adjustment_index: c.adjustment_index,
            adjustment_notes: c.adjustment_notes,
        })),
    };
}

export async function createLeaseFromImport(
    result: LeaseImportResult,
    opts: { unitId: string | null; referenceName: string; status?: LeaseStatus }
): Promise<ImportedLeaseOutcome> {
    if (!result.propertyId) return { ok: false, errors: ["Selecione o imóvel do contrato."] };
    if (!result.primaryTenantId) return { ok: false, errors: ["O contrato precisa de um inquilino: cadastre ou selecione o inquilino principal."] };

    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // Brasília
    const payload = leasePayloadFromImport(result, { ...opts, today });

    // The same agreement imported twice must not become two leases
    try {
        const res = await fetch("/api/leases");
        const json = await res.json().catch(() => ({}));
        const existing = ((json.leases as LeaseWithDetails[] | undefined) || []).find(
            (l) =>
                l.property_id === result.propertyId &&
                (l.unit_id ?? null) === opts.unitId &&
                l.primary_tenant_id === result.primaryTenantId &&
                l.start_date === payload.start_date
        );
        if (existing) {
            const attached = (existing.document_count ?? 0) > 0 || (await attachLeaseContract(existing.id, result.file, result.storagePath));
            return { ok: true, leaseId: existing.id, alreadyExisted: true, fileSkipped: !attached };
        }
    } catch {
        // The list is only a guard against duplicates: carry on and let the create call speak
    }

    const res = await fetch("/api/leases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.lease?.id) {
        const fieldErrors = json.errors && typeof json.errors === "object" ? (Object.values(json.errors) as string[]) : [];
        return { ok: false, errors: fieldErrors.length > 0 ? fieldErrors : [typeof json.error === "string" ? json.error : "Não foi possível criar o contrato."] };
    }

    const attached = await attachLeaseContract(json.lease.id as string, result.file, result.storagePath);
    return { ok: true, leaseId: json.lease.id as string, warning: (json.warning as string | null) ?? null, fileSkipped: !attached };
}
