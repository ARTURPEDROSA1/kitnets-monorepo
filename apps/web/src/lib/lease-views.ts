/**
 * The two shapes the Contratos pages render — the hub's list and one contract's dashboard — as the
 * server builds them (lib/lease-views-server.ts) and the client consumes them. Types only, so the
 * client components never pull the server loader (Supabase, `next/cache`) into the browser bundle.
 */
import type { LeaseWithDetails } from "@/types/lease";
import type { IndexPoint } from "@/lib/lease-summary";
import type { PropertyIncomeRow } from "@/lib/property-income";

export interface LeaseListView {
    leases: LeaseWithDetails[];
    /** monthly series of every index the leases use, by calculator code (`ipca`, `igpm`…); null = unavailable */
    series: Record<string, IndexPoint[] | null>;
}

export interface LeaseTenantContact {
    id: string;
    full_name: string;
    /** E.164 (`+5511999999999`) or null */
    main_phone: string | null;
    email: string | null;
}

export interface LeaseDashboardView {
    /** with its additional tenants, charges and documents (signed URLs) */
    lease: LeaseWithDetails;
    tenant: LeaseTenantContact | null;
    /** the property's income ledger rows over the lease's months (every unit; lib/lease-dashboard.ts cuts them) */
    income: PropertyIncomeRow[];
    /** the lease's index series; null when it has none or the series could not be read */
    series: IndexPoint[] | null;
}
