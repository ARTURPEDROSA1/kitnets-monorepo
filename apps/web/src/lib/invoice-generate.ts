/**
 * Plans one lease's invoice for a month: what the owner collects (lib/invoice-collection.ts), when it
 * falls due (lib/invoice-schedule.ts), who pays and what is missing to issue it (lib/invoice-payer.ts),
 * and the owner's terms as they are today. Pure: the server only loads the rows and stores the plan.
 */
import type { LeaseStatus } from "@/types/lease";
import { billableItems, type BillableItem, type CollectionComponent } from "@/lib/invoice-collection";
import { chargeable, dueDateIn, leaseDueDay, referenceMonthOf, type NoInvoiceReason } from "@/lib/invoice-schedule";
import { resolvePayer, type InvoiceBlocker, type PayerAddress, type PayerProperty, type PayerTenant } from "@/lib/invoice-payer";
import type { BillingSettingsView, InvoiceOrigin } from "@/lib/invoice-views";

export interface PlanLease {
    id: string;
    property_id: string;
    unit_id: string | null;
    unit_name: string | null;
    primary_tenant_id: string;
    status: LeaseStatus;
    start_date: string;
    termination_date?: string | null;
    rent_due_day: number;
    billing_due_day?: number | null;
    billing_email?: string | null;
    billing_paused?: boolean | null;
}

export type PlanSkip = NoInvoiceReason | "PAUSED" | "NOTHING_TO_BILL" | "NO_TENANT";

export const SKIP_LABELS: Record<PlanSkip, string> = {
    NOT_IN_FORCE: "contrato fora de vigência",
    BEFORE_START: "vencimento anterior ao início do contrato",
    AFTER_TERMINATION: "vencimento posterior à rescisão",
    PAUSED: "cobrança pausada",
    NOTHING_TO_BILL: "nada é cobrado pelo proprietário neste contrato",
    NO_TENANT: "inquilino não encontrado",
};

/** What `invoice_create` stores (migration 20261002120000). */
export interface InvoiceHead {
    lease_id: string;
    property_id: string;
    unit_id: string | null;
    unit_name: string | null;
    tenant_id: string;
    reference_month: string;
    due_date: string;
    origin: InvoiceOrigin;
    blockers: InvoiceBlocker[];
    payer_name: string;
    payer_cpf: string;
    payer_email: string | null;
    payer_address: PayerAddress | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
}

export interface InvoicePlan { head: InvoiceHead; items: BillableItem[] }

export interface PlanInput {
    lease: PlanLease;
    components: readonly CollectionComponent[];
    tenant: PayerTenant | null;
    property: PayerProperty | null;
    settings: BillingSettingsView;
    /** `YYYY-MM`: the month the invoice falls due in */
    month: string;
    origin: InvoiceOrigin;
}

export function planInvoice({ lease, components, tenant, property, settings, month, origin }: PlanInput): { plan: InvoicePlan } | { skip: PlanSkip } {
    if (lease.billing_paused) return { skip: "PAUSED" };
    const items = billableItems(components);
    if (items.length === 0) return { skip: "NOTHING_TO_BILL" };

    const dueDate = dueDateIn(month, leaseDueDay(lease));
    const reason = chargeable(lease, dueDate);
    if (reason) return { skip: reason };
    if (!tenant) return { skip: "NO_TENANT" };

    const payer = resolvePayer(tenant, property, lease.unit_name, lease.billing_email);
    return {
        plan: {
            head: {
                lease_id: lease.id,
                property_id: lease.property_id,
                unit_id: lease.unit_id,
                unit_name: lease.unit_name,
                tenant_id: lease.primary_tenant_id,
                reference_month: referenceMonthOf(dueDate),
                due_date: dueDate,
                origin,
                blockers: payer.blockers,
                payer_name: payer.name,
                payer_cpf: payer.cpf,
                payer_email: payer.email,
                payer_address: payer.address,
                // the owner's terms as decided today; undecided stays empty, never a made-up rate
                fine_pct: settings.fine_pct,
                interest_pct_month: settings.interest_pct_month,
                days_payable_after_due: settings.days_payable_after_due,
            },
            items,
        },
    };
}
