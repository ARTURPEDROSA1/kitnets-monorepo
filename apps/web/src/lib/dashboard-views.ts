/**
 * What the dashboard shows, as one bundle: the leases, the income ledger of the last twelve months, the
 * invoices, the bills, the project instalments and the taxes register, plus the few portfolio figures
 * the cards under the board need. Built by lib/dashboard-views-server.ts (`loadDashboard`), read by
 * lib/dashboard-hub.ts (pure) and the client. Types only: safe for client components.
 */
import type { OwnerPropertySummary } from "@/lib/energy-properties-server";
import type { InvestmentCardSummary } from "@/lib/new-investment-metrics";
import type { NewInvestment } from "@/lib/new-investments";
import type { PropertyEntry } from "@/lib/property-entries-server";
import type { PropertyIncomeRow } from "@/lib/property-income";
import type { PropertyTax } from "@/lib/property-taxes";
import type { WaterPropertySummary } from "@/lib/water-properties-server";
import type { LeaseWithDetails } from "@/types/lease";
import type { InvoiceView } from "@/lib/invoice-views";

/** How many months the board can look back, the current one included. */
export const DASHBOARD_MONTHS = 12;

export interface DashboardLedger {
    /** `YYYY-MM`: the first month of the window */
    from: string;
    /** `YYYY-MM`: the current month, the last of the window */
    to: string;
    /** every ledger row of the window, confirmed and expected, with `updated_at` (what is new since the last visit) */
    rows: PropertyIncomeRow[];
    /** the agencies' fee kept before crediting, over every confirmed month: the potential saving of self-management */
    feeAllTime: number;
    /** the same over each property's last twelve confirmed months */
    fee12m: number;
}

export type DashboardLoader = "properties" | "income" | "leases" | "tenants" | "energy" | "water" | "projects" | "taxes" | "invoices";

export interface DashboardView {
    profile: { fullName: string | null; email: string | null };
    properties: PropertyEntry[];
    leases: LeaseWithDetails[] | null;
    ledger: DashboardLedger | null;
    /** distinct people (titular, co-tenants, occupants) on contracts in force */
    housed: number | null;
    /** the account's invoices (Fatura), with the latest boleto and e-mail of each */
    invoices: InvoiceView[] | null;
    energy: OwnerPropertySummary[] | null;
    water: WaterPropertySummary[] | null;
    projects: { investments: NewInvestment[]; summaries: Record<string, InvestmentCardSummary> } | null;
    taxes: PropertyTax[] | null;
    /** the loaders that failed: their figures show as unavailable, not as zero */
    failed: DashboardLoader[];
}
