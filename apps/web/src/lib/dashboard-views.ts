/**
 * What the dashboard shows, as one bundle: the modules' own list views side by side, the portfolio's
 * income snapshot, the taxes register, the gateways (founder pilot) and the map pins. Built by
 * lib/dashboard-views-server.ts (`loadDashboard`), read by lib/dashboard-hub.ts (pure) and the client.
 * Types only: safe for client components.
 */
import type { AgencyListView } from "@/lib/agency-views";
import type { AgentListView } from "@/lib/agent-views";
import type { Condominium } from "@/lib/condominium";
import type { OwnerPropertySummary } from "@/lib/energy-properties-server";
import type { MapPin } from "@/lib/geocode";
import type { InvestmentCardSummary } from "@/lib/new-investment-metrics";
import type { NewInvestment } from "@/lib/new-investments";
import type { PropertyEntry } from "@/lib/property-entries-server";
import type { PropertyTax } from "@/lib/property-taxes";
import type { TenantListView } from "@/lib/tenant-views";
import type { WaterPropertySummary } from "@/lib/water-properties-server";
import type { LeaseWithDetails } from "@/types/lease";

/** One property's latest confirmed ledger month plus its all-time agency fee (the "economia potencial com autogestão"). */
export interface DashboardIncomeSnapshot {
    propertyId: string;
    /** YYYY-MM */
    month: string;
    revenue: number;
    grossRent: number;
    netRent: number;
    received: number;
    /** the agency's cut in that month (rent and, when agreed, condominium) */
    feeAmount: number;
    /** agency fee + energy cost + other expenses + condominium + landlord IPTU of the month */
    opex: number;
    noi: number;
    /** confirmed months, all time */
    confirmedMonths: number;
    /** agency fee kept before crediting, all time */
    totalFee: number;
    /** the same over the last 12 confirmed months */
    fee12m: number;
}

export interface DashboardGateway {
    id: string;
    label: string | null;
    serialNumber: string;
    status: string | null;
    lastSeenAt: string | null;
    online: boolean;
    propertyId: string | null;
}

export type DashboardLoader = "properties" | "income" | "leases" | "tenants" | "agents" | "agencies" | "energy" | "water" | "condominiums" | "projects" | "taxes" | "gateways" | "map";

export interface DashboardView {
    profile: { fullName: string | null; email: string | null };
    properties: PropertyEntry[];
    income: DashboardIncomeSnapshot[];
    leases: LeaseWithDetails[] | null;
    tenants: TenantListView | null;
    agents: AgentListView | null;
    agencies: AgencyListView | null;
    energy: OwnerPropertySummary[] | null;
    water: WaterPropertySummary[] | null;
    condominiums: Condominium[] | null;
    projects: { investments: NewInvestment[]; summaries: Record<string, InvestmentCardSummary> } | null;
    taxes: PropertyTax[] | null;
    /** null = this account does not see the gateway pilot */
    gateways: DashboardGateway[] | null;
    map: {
        pins: MapPin[];
        /** addresses still to geocode (the client asks POST /api/geocode once) */
        pending: number;
    };
    /** the loaders that failed: their figures show as unavailable, not as zero */
    failed: DashboardLoader[];
}
