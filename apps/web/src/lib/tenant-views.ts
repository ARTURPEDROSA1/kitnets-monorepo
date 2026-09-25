/**
 * The two shapes the Inquilinos pages render — the hub's list and one tenant's dashboard — as the
 * server builds them (lib/tenant-views-server.ts) and the client consumes them. Types only, so the
 * client components never pull the server loader into the browser bundle.
 */
import type { LeaseStatus } from "@/types/lease";
import type { TenantWithDetails } from "@/types/tenant";
import type { PropertyIncomeRow } from "@/lib/property-income";

export type TenantLeaseRole = "PRIMARY" | "CO_TENANT" | "OCCUPANT";

/** One of a tenant's contracts, as the tenant screens need it (one entry per tenant on the lease). */
export interface TenantLeaseSummary {
    id: string;
    tenant_id: string;
    role: TenantLeaseRole;
    reference_name: string | null;
    property_id: string;
    property_name: string | null;
    unit_id: string | null;
    unit_name: string | null;
    start_date: string;
    end_date: string | null;
    termination_date: string | null;
    status: LeaseStatus;
    monthly_rent: number;
    rent_due_day: number;
    security_deposit: number | null;
    adjustment_index: string | null;
    management_type: string;
    agency_name: string | null;
    document_count: number;
}

export interface TenantListView {
    tenants: TenantWithDetails[];
    /** every lease of the account, one entry per tenant on it */
    leases: TenantLeaseSummary[];
}

export interface TenantDashboardView {
    tenant: TenantWithDetails;
    /** this tenant's contracts, newest first */
    leases: TenantLeaseSummary[];
    /** the property's income ledger over the months of `incomeLeaseId` (every unit; the client cuts them) */
    income: PropertyIncomeRow[];
    /** the lease the ledger months belong to: the one in force, else the latest */
    incomeLeaseId: string | null;
}
