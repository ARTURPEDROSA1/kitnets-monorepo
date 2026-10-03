/**
 * The shapes the Fatura pages render — the hub's list and one invoice's panel — as the server builds
 * them (lib/invoice-views-server.ts) and the client consumes them. Types only, so the client components
 * never pull the server loader into the browser bundle.
 */
import type { LeaseManagementType, LeaseStatus } from "@/types/lease";
import type { CollectionComponent, InvoiceItemKind } from "@/lib/invoice-collection";
import type { PayerAddress } from "@/lib/invoice-payer";
import type { ConnectionsView } from "@/lib/billing/connections";
import type { ChargeStatus } from "@/lib/billing/inter-payload";

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

/** The invoice's latest boleto at the bank, as far as the screens need it (lib/billing/charges-server.ts). */
export interface InvoiceChargeView {
    id: string;
    kind: "BOLEPIX" | "CARD_CHECKOUT";
    status: ChargeStatus;
    /** what the charge asks for (the card: grossed up by the fee) */
    amount: number;
    /** the card: the fee passed on to the tenant */
    surcharge_amount: number | null;
    /** the card: when the session stops taking the payment */
    expires_at: string | null;
    /** the bank's own word (A_RECEBER, RECEBIDO, EXPIRADO…) */
    provider_status: string | null;
    due_date: string | null;
    digitable_line: string | null;
    barcode: string | null;
    pix_copy_paste: string | null;
    has_pdf: boolean;
    paid_via: "BOLETO" | "PIX" | "CARD" | null;
    paid_amount: number | null;
    last_checked_at: string | null;
    last_error: string | null;
    created_at: string;
}

/** One e-mail of an invoice to its tenant (lib/billing/deliveries-server.ts). */
export interface InvoiceDeliveryView {
    id: string;
    kind: "ISSUE" | "REMINDER" | "RECEIPT" | "RESEND";
    status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "BOUNCED";
    recipient: string;
    attempts: number;
    sent_at: string | null;
    /** the provider confirmed it reached the tenant's mailbox */
    delivered_at?: string | null;
    last_error: string | null;
    created_at: string;
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
    /** the latest boleto issued for it; null before the first issue */
    charge?: InvoiceChargeView | null;
    /** the latest e-mail to the tenant; null before any */
    delivery?: InvoiceDeliveryView | null;
    /** the latest card session (Stripe Checkout); null before any */
    card?: InvoiceChargeView | null;
    /** the invoice's public page: first and last time someone other than the owner opened it, and how often */
    first_viewed_at?: string | null;
    last_viewed_at?: string | null;
    view_count?: number;
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
    /** `YYYY-MM-DD`: the lease's next adjustment date — the rent's, and of every charge readjusted with it */
    next_adjustment?: string | null;
}

/** The owner's billing decisions; null = not decided yet (nothing is assumed in its place). */
export interface BillingSettingsView {
    days_in_advance: number | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    /** how the tenant sees the sender of the e-mails; null = the holding's name */
    sender_name: string | null;
    reply_to_email: string | null;
    /** the daily run generates, issues and e-mails on its own (only with every decision above made) */
    automation_enabled: boolean;
    /** `YYYY-MM`: the first month the run bills */
    automation_from_month: string | null;
    /** the card fee passed on to the tenant: % of the amount charged + fixed part, as the owner's processor charges; both or neither */
    card_fee_pct?: number | null;
    card_fee_fixed?: number | null;
    /** days before the due date the tenant is reminded; null = no reminder (not decided) */
    reminder_days_before?: number | null;
    /** days after the due date an unpaid invoice gets the overdue notice; null = none */
    overdue_notice_days?: number | null;
    /** a receipt is e-mailed when an invoice is paid */
    send_receipts?: boolean;
    /** where the owner gets a copy of every e-mail sent to tenants; null = no copy */
    copy_to_email?: string | null;
}

export interface InvoiceListView {
    invoices: InvoiceView[];
    recurring: RecurringLease[];
    settings: BillingSettingsView;
    /** the owner's connections to the payment providers (status only, never a secret) */
    connections: ConnectionsView;
    /** the server can e-mail tenants (RESEND_API_KEY and BILLING_EMAIL_FROM are set) */
    emailAvailable?: boolean;
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
        /** the tenant's page for this invoice (the link every e-mail carries) */
        public_url: string;
    };
    events: InvoiceEventView[];
    /** every e-mail of the invoice, newest first */
    deliveries?: InvoiceDeliveryView[];
}

/** What generating a month's invoices did, lease by lease that got none. */
export interface GenerateResult {
    month: string;
    created: number;
    /** leases that already had a live invoice for the month */
    existing: number;
    skipped: Array<{ lease_id: string; title: string; reason: string }>;
}
