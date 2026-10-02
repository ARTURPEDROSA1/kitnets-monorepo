/**
 * The shapes the Fatura pages render — the hub's list and one invoice's panel — as the server builds
 * them (lib/invoice-views-server.ts) and the client consumes them. Types only, so the client components
 * never pull the server loader into the browser bundle.
 */
import type { LeaseManagementType, LeaseStatus } from "@/types/lease";
import type { CollectionComponent, InvoiceItemKind } from "@/lib/invoice-collection";
import type { PayerAddress } from "@/lib/invoice-payer";
import type { ConnectionsView } from "@/lib/billing/connections";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
export type InvoiceOrigin = "AUTO" | "MANUAL";
export type InvoicePaidVia = "BOLETO" | "PIX" | "CARD" | "MANUAL";

export interface InvoiceItemView {
    id: string;
    kind: InvoiceItemKind;
    description: string;
    amount: number;
    position: number;
}

export interface InvoiceView {
    id: string;
    /** counts within the account: "Fatura nº 12" */
    number: number;
    lease_id: string;
    property_id: string;
    unit_id: string | null;
    unit_name: string | null;
    tenant_id: string;
    /** first day of the due date's month */
    reference_month: string;
    due_date: string;
    amount: number;
    status: InvoiceStatus;
    origin: InvoiceOrigin;
    /** what keeps it from being issued and e-mailed (lib/invoice-payer.ts) */
    blockers: string[];
    payer_name: string | null;
    payer_email: string | null;
    issued_at: string | null;
    paid_on: string | null;
    paid_amount: number | null;
    late_fee_amount: number;
    surcharge_amount: number;
    paid_via: InvoicePaidVia | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    notes: string | null;
    created_at: string;
    property_name: string | null;
    tenant_name: string | null;
    lease_reference: string | null;
    items: InvoiceItemView[];
}

/** A lease in force with who collects each of its components: one block of "Cobranças recorrentes". */
export interface RecurringLease {
    lease_id: string;
    /** the reference name, else the place */
    title: string;
    /** "SANTO ANTONIO · Kitnet 35C" */
    place: string;
    property_id: string;
    tenant_name: string | null;
    tenant_email: string | null;
    management_type: LeaseManagementType;
    /** the agency's or the corretor's name, when the lease has one */
    manager_name: string | null;
    status: LeaseStatus;
    start_date: string;
    termination_date: string | null;
    /** the invoice's due day (the lease's own billing day, else the rent's) */
    due_day: number;
    paused: boolean;
    components: CollectionComponent[];
}

/** The owner's billing decisions; null = not decided yet (nothing is assumed in its place). */
export interface BillingSettingsView {
    days_in_advance: number | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
}

export interface InvoiceListView {
    invoices: InvoiceView[];
    recurring: RecurringLease[];
    settings: BillingSettingsView;
    /** the owner's connections to the payment providers (status only, never a secret) */
    connections: ConnectionsView;
}

export interface InvoiceEventView {
    id: string;
    type: string;
    actor: string;
    detail: Record<string, unknown>;
    created_at: string;
}

export interface InvoiceDetailView {
    invoice: InvoiceView & {
        payer_cpf: string | null;
        payer_address: PayerAddress | null;
        fine_pct: number | null;
        interest_pct_month: number | null;
        days_payable_after_due: number | null;
    };
    events: InvoiceEventView[];
}

/** What generating a month's invoices did, lease by lease that got none. */
export interface GenerateResult {
    month: string;
    created: number;
    /** leases that already had a live invoice for the month */
    existing: number;
    skipped: Array<{ lease_id: string; title: string; reason: string }>;
}
