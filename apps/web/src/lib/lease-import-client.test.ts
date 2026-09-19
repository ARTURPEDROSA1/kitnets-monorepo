import { describe, expect, it } from "vitest";
import { leaseInputSchema } from "@/lib/schemas/lease";
import type { LeaseImportResult } from "@/components/contratos/LeaseImportModal";
import { leasePayloadFromImport } from "./lease-import-client";

const result = {
    file: new File(["x"], "contrato.pdf", { type: "application/pdf" }),
    propertyId: "prop-1",
    agencyId: "agency-1",
    primaryTenantId: "tenant-1",
    additionalTenants: [{ tenant_id: "tenant-2", role: "CO_TENANT" }],
    data: {
        lease: {
            start_date: "2026-09-16", end_date: "2029-03-16", monthly_rent: 1250.5, rent_due_day: 10,
            security_deposit: 2501, deposit_months: 2, adjustment_index: "IPCA", adjustment_frequency: null, notes: "Pintura nova",
        },
        charges: [{ charge_type: "CONDOMINIUM", label: "Condomínio", responsibility: "TENANT", amount: 250, adjustment_index: "IGP_M", adjustment_notes: null }],
        tenants: [], property: null, agency: null,
    },
} as unknown as LeaseImportResult;

describe("leasePayloadFromImport", () => {
    it("builds a payload the lease schema accepts, bound to the unit", () => {
        const payload = leasePayloadFromImport(result, { unitId: "unit-35c", referenceName: "SANTO ANTONIO · Kitnet 35C - Ana - 2026", today: "2026-09-18" });
        const parsed = leaseInputSchema.parse(payload);
        expect(parsed.lease).toMatchObject({
            property_id: "prop-1", unit_id: "unit-35c", primary_tenant_id: "tenant-1",
            management_type: "AGENCY", agency_id: "agency-1", status: "ACTIVE",
            monthly_rent: 1250.5, rent_due_day: 10, adjustment_frequency: 12,
        });
        expect(parsed.additional_tenants).toEqual([{ tenant_id: "tenant-2", role: "CO_TENANT" }]);
        expect(parsed.charges[0]).toMatchObject({ charge_type: "CONDOMINIUM", amount: 250, adjustment_index: "IGP_M" });
    });

    it("is self-managed without an agency and expired once the term is over", () => {
        const payload = leasePayloadFromImport({ ...result, agencyId: "" }, { unitId: null, referenceName: "x", today: "2029-03-17" });
        expect(payload).toMatchObject({ management_type: "SELF_MANAGED", agency_id: null, unit_id: null, status: "EXPIRED" });
    });

    it("leaves what the agreement does not say for the schema to refuse", () => {
        const incomplete = { ...result, data: { ...result.data, lease: { ...result.data.lease, monthly_rent: null, rent_due_day: null } } } as unknown as LeaseImportResult;
        const parsed = leaseInputSchema.safeParse(leasePayloadFromImport(incomplete, { unitId: "u", referenceName: "x", today: "2026-09-18" }));
        expect(parsed.success).toBe(false);
    });
});
