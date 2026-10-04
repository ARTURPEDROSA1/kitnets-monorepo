/**
 * The two shapes the Contratos pages render — the hub's list and one contract's dashboard — as the
 * server builds them (lib/lease-views-server.ts) and the client consumes them. Types only, so the
 * client components never pull the server loader (Supabase, `next/cache`) into the browser bundle.
 */
import type { AdjustedChargeType, AdjustmentRow, StoredAdjustment, WaitingReason } from "@/lib/lease-adjustments";
import type { LeaseWithDetails } from "@/types/lease";
import type { IndexPoint } from "@/lib/lease-summary";
import type { PropertyIncomeRow } from "@/lib/property-income";

export interface LeaseListView {
    /** with their charges (the hub's cards name the condominium or the energy and add up the tenant's total) */
    leases: LeaseWithDetails[];
    /** monthly series of every index the leases use, by calculator code (`ipca`, `igpm`…); null = unavailable */
    series: Record<string, IndexPoint[] | null>;
    /** `properties.id` → single (house/apartment) or multi (kitnets), from the profile's cadastro */
    propertyKinds: Record<string, "single" | "multi">;
}

export interface LeaseTenantContact {
    id: string;
    full_name: string;
    /** E.164 (`+5511999999999`) or null */
    main_phone: string | null;
    email: string | null;
}

/** The history of a lease's adjustments, as the contract's dashboard shows it (lib/lease-adjustments.ts). */
export interface LeaseAdjustmentsView {
    /** false while the history cannot be read (a deploy ahead of its migration) */
    available: boolean;
    /** oldest first */
    rows: StoredAdjustment[];
    /** the contract's original amounts, before any adjustment; `condo` is the followed charge — the condominium, or the energy of a contract without one (`chargeType`) */
    initial: { rent: number; condo: number | null; chargeType?: AdjustedChargeType | null };
    /** an adjustment date already behind today that could not be calculated yet */
    waiting: { date: string; reason: WaitingReason } | null;
    /** adjustments calculated but not written because the write failed, and why */
    pending?: AdjustmentRow[];
    error?: string | null;
}

export interface LeaseDashboardView {
    /** with its additional tenants, charges and documents (signed URLs) */
    lease: LeaseWithDetails;
    tenant: LeaseTenantContact | null;
    /** the property's income ledger rows over the lease's months (every unit; lib/lease-dashboard.ts cuts them) */
    income: PropertyIncomeRow[];
    /** the lease's index series; null when it has none or the series could not be read */
    series: IndexPoint[] | null;
    /** series of the indexes the charges name for themselves when not the lease's, by calculator code */
    chargeSeries?: Record<string, IndexPoint[] | null>;
    adjustments?: LeaseAdjustmentsView;
    /**
     * `single` (a house or apartment rented whole: the contract's card names the energy bill) or
     * `multi` (a property rented unit by unit: it names the condominium); null when the property is
     * not registered in the profile.
     */
    propertyKind: "single" | "multi" | null;
}
