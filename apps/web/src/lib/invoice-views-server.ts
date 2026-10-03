/**
 * Builds the two views of Fatura — the hub's list and one invoice's panel — for the API routes
 * (`GET /api/faturas`, `GET /api/faturas/[id]`) and the page, which preloads them on the server so the
 * first paint already has the table.
 *
 * The hub also needs every lease in force with who collects each of its components ("Cobranças
 * recorrentes"): that is what the next invoices are made of.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { notFound } from "@/lib/api-route";
import { loadLeaseRows } from "@/lib/lease-views-server";
import { IN_FORCE, placeOf, titleOf } from "@/lib/lease-dashboard";
import { leaseComponents } from "@/lib/invoice-collection";
import { leaseDueDay } from "@/lib/invoice-schedule";
import type { PayerAddress } from "@/lib/invoice-payer";
import { NO_CONNECTIONS } from "@/lib/billing/connections";
import { loadConnections } from "@/lib/billing/connections-server";
import { loadCharges, loadLatestCharges, type ChargeRow } from "@/lib/billing/charges-server";
import { loadDeliveries, loadLatestDeliveries, publicInvoiceUrl, type DeliveryRow } from "@/lib/billing/deliveries-server";
import { emailAvailable } from "@/lib/billing/email-provider";
import type { LeaseWithDetails } from "@/types/lease";
import type { BillingSettingsView, InvoiceChargeView, InvoiceDeliveryView, InvoiceDetailView, InvoiceEventView, InvoiceItemView, InvoiceListView, InvoiceView, RecurringLease } from "@/lib/invoice-views";

const INVOICE_COLUMNS =
    "id, number, lease_id, property_id, unit_id, unit_name, tenant_id, reference_month, due_date, amount, status, origin, blockers, payer_name, payer_email, issued_at, paid_on, paid_amount, late_fee_amount, surcharge_amount, paid_via, cancelled_at, cancel_reason, notes, created_at, first_viewed_at, last_viewed_at, view_count";
const INVOICE_SELECT = `${INVOICE_COLUMNS}, property:properties!property_id(name), tenant:tenants!tenant_id(full_name), lease:leases!lease_id(reference_name)`;
const PAGE = 1000;

const num = (v: unknown) => Number(v) || 0;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/** What the screens get of a boleto: never the bank's reference. */
export const toChargeView = (c: ChargeRow | null | undefined): InvoiceChargeView | null => c ? ({
    id: c.id, kind: c.kind, status: c.status, amount: c.amount, surcharge_amount: c.surcharge_amount, expires_at: c.expires_at, provider_status: c.provider_status, due_date: c.due_date, digitable_line: c.digitable_line, barcode: c.barcode,
    pix_copy_paste: c.pix_copy_paste, has_pdf: Boolean(c.pdf_path), paid_via: c.paid_via, paid_amount: c.paid_amount, last_checked_at: c.last_checked_at, last_error: c.last_error, created_at: c.created_at,
}) : null;

/** What the screens get of an e-mail: never the provider's id. */
export const toDeliveryView = (d: DeliveryRow | null | undefined): InvoiceDeliveryView | null => d ? ({
    id: d.id, kind: d.kind, status: d.status, recipient: d.recipient, attempts: d.attempts, sent_at: d.sent_at, delivered_at: d.delivered_at, last_error: d.last_error, created_at: d.created_at,
}) : null;

function toInvoiceView(row: Record<string, unknown>, items: InvoiceItemView[], charge: ChargeRow | null = null, delivery: DeliveryRow | null = null, card: ChargeRow | null = null): InvoiceView {
    const joined = (key: string, field: string) => ((row[key] as Record<string, unknown> | null)?.[field] as string | null | undefined) ?? null;
    return {
        id: String(row.id),
        number: num(row.number),
        lease_id: String(row.lease_id),
        property_id: String(row.property_id),
        unit_id: (row.unit_id as string | null) ?? null,
        unit_name: (row.unit_name as string | null) ?? null,
        tenant_id: String(row.tenant_id),
        reference_month: String(row.reference_month).slice(0, 10),
        due_date: String(row.due_date).slice(0, 10),
        amount: num(row.amount),
        status: row.status as InvoiceView["status"],
        origin: row.origin as InvoiceView["origin"],
        blockers: Array.isArray(row.blockers) ? (row.blockers as string[]) : [],
        payer_name: (row.payer_name as string | null) ?? null,
        payer_email: (row.payer_email as string | null) ?? null,
        issued_at: (row.issued_at as string | null) ?? null,
        paid_on: row.paid_on ? String(row.paid_on).slice(0, 10) : null,
        paid_amount: numOrNull(row.paid_amount),
        late_fee_amount: num(row.late_fee_amount),
        surcharge_amount: num(row.surcharge_amount),
        paid_via: (row.paid_via as InvoiceView["paid_via"]) ?? null,
        cancelled_at: (row.cancelled_at as string | null) ?? null,
        cancel_reason: (row.cancel_reason as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        created_at: String(row.created_at),
        first_viewed_at: (row.first_viewed_at as string | null) ?? null,
        last_viewed_at: (row.last_viewed_at as string | null) ?? null,
        view_count: num(row.view_count),
        property_name: joined("property", "name"),
        tenant_name: joined("tenant", "full_name"),
        lease_reference: joined("lease", "reference_name"),
        items,
        charge: toChargeView(charge),
        delivery: toDeliveryView(delivery),
        card: toChargeView(card),
    };
}

const toItemView = (row: Record<string, unknown>): InvoiceItemView => ({
    id: String(row.id),
    kind: row.kind as InvoiceItemView["kind"],
    description: String(row.description),
    amount: num(row.amount),
    position: num(row.position),
});

/** Every row of a query, a page at a time (the API caps a single response). */
async function allRows(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, what: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await fetchPage(from, from + PAGE - 1);
        if (error) throw new Error(`${what}: ${error.message}`);
        out.push(...((data ?? []) as Record<string, unknown>[]));
        if (!data || data.length < PAGE) return out;
    }
}

/** The account's invoices, newest due date first, each with its items. */
export async function loadInvoiceRows(supabase: AdminSupabase, profileId: string): Promise<InvoiceView[]> {
    const [invoices, items, charges, deliveries] = await Promise.all([
        allRows((from, to) => supabase.from("invoices").select(INVOICE_SELECT).eq("owner_id", profileId).order("due_date", { ascending: false }).order("number", { ascending: false }).range(from, to), "invoices"),
        allRows((from, to) => supabase.from("invoice_items").select("id, invoice_id, kind, description, amount, position").eq("owner_id", profileId).order("position", { ascending: true }).order("id", { ascending: true }).range(from, to), "invoice_items"),
        loadLatestCharges(supabase, profileId),
        loadLatestDeliveries(supabase, profileId),
    ]);
    const byInvoice = new Map<string, InvoiceItemView[]>();
    for (const item of items) byInvoice.set(String(item.invoice_id), [...(byInvoice.get(String(item.invoice_id)) ?? []), toItemView(item)]);
    return invoices.map(row => toInvoiceView(row, byInvoice.get(String(row.id)) ?? [], charges.get(String(row.id)) ?? null, deliveries.get(String(row.id)) ?? null));
}

export const EMPTY_BILLING_SETTINGS: BillingSettingsView = {
    days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null,
    sender_name: null, reply_to_email: null, automation_enabled: false, automation_from_month: null, card_fee_pct: null, card_fee_fixed: null,
    reminder_days_before: null, overdue_notice_days: null, send_receipts: true, copy_to_email: null,
};

export const BILLING_SETTINGS_COLUMNS = "days_in_advance, fine_pct, interest_pct_month, days_payable_after_due, sender_name, reply_to_email, automation_enabled, automation_from_month, card_fee_pct, card_fee_fixed, reminder_days_before, overdue_notice_days, send_receipts, copy_to_email";

export function toBillingSettingsView(data: Record<string, unknown>): BillingSettingsView {
    return {
        days_in_advance: numOrNull(data.days_in_advance),
        fine_pct: numOrNull(data.fine_pct),
        interest_pct_month: numOrNull(data.interest_pct_month),
        days_payable_after_due: numOrNull(data.days_payable_after_due),
        sender_name: (data.sender_name as string | null) ?? null,
        reply_to_email: (data.reply_to_email as string | null) ?? null,
        automation_enabled: data.automation_enabled === true,
        automation_from_month: data.automation_from_month ? String(data.automation_from_month).slice(0, 7) : null,
        card_fee_pct: numOrNull(data.card_fee_pct),
        card_fee_fixed: numOrNull(data.card_fee_fixed),
        reminder_days_before: numOrNull(data.reminder_days_before),
        overdue_notice_days: numOrNull(data.overdue_notice_days),
        send_receipts: data.send_receipts !== false,
        copy_to_email: (data.copy_to_email as string | null | undefined) ?? null,
    };
}

/** The owner's billing decisions; every one null until the owner makes it. */
export async function loadBillingSettings(supabase: AdminSupabase, profileId: string): Promise<BillingSettingsView> {
    const { data, error } = await supabase
        .from("billing_settings")
        .select(BILLING_SETTINGS_COLUMNS)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (error) throw new Error(`billing_settings: ${error.message}`);
    if (!data) return EMPTY_BILLING_SETTINGS;
    return toBillingSettingsView(data as Record<string, unknown>);
}

/** A lease of the list as "Cobranças recorrentes" shows it. */
export function toRecurringLease(lease: LeaseWithDetails, tenantEmail: string | null): RecurringLease {
    return {
        lease_id: lease.id,
        title: titleOf(lease),
        place: placeOf(lease),
        property_id: lease.property_id,
        tenant_name: lease.primary_tenant_name,
        tenant_email: tenantEmail,
        management_type: lease.management_type,
        manager_name: lease.management_type === "AGENCY" ? lease.agency_name : lease.management_type === "AGENT" ? lease.agent_name : null,
        status: lease.status,
        start_date: lease.start_date.slice(0, 10),
        termination_date: lease.termination_date ? lease.termination_date.slice(0, 10) : null,
        due_day: leaseDueDay(lease),
        paused: lease.billing_paused === true,
        components: leaseComponents(lease),
    };
}

/** The leases in force, each with who collects its rent and charges; the owner's own collections first. */
export async function loadRecurringLeases(supabase: AdminSupabase, profileId: string, leases?: LeaseWithDetails[]): Promise<RecurringLease[]> {
    const inForce = (leases ?? await loadLeaseRows(supabase, profileId)).filter(l => IN_FORCE.has(l.status));
    const tenantIds = [...new Set(inForce.map(l => l.primary_tenant_id))];
    const emails = new Map<string, string | null>();
    if (tenantIds.length > 0) {
        const { data, error } = await supabase.from("tenants").select("id, email").eq("user_id", profileId).in("id", tenantIds);
        if (error) throw new Error(`tenants: ${error.message}`);
        for (const t of data ?? []) emails.set(String(t.id), (t.email as string | null) ?? null);
    }
    return inForce
        .map(l => toRecurringLease(l, l.billing_email ?? emails.get(l.primary_tenant_id) ?? null))
        .sort((a, b) => Number(b.components.some(c => c.billable)) - Number(a.components.some(c => c.billable)) || a.title.localeCompare(b.title, "pt-BR"));
}

export async function loadInvoiceList(supabase: AdminSupabase, profileId: string): Promise<InvoiceListView> {
    const [invoices, recurring, settings, connections] = await Promise.all([
        loadInvoiceRows(supabase, profileId),
        loadRecurringLeases(supabase, profileId),
        loadBillingSettings(supabase, profileId),
        // the invoices are worth showing even when the connections cannot be read
        loadConnections(supabase, profileId).catch(err => { console.error("[Faturas] connections failed:", (err as Error).message); return NO_CONNECTIONS; }),
    ]);
    return { invoices, recurring, settings, connections, emailAvailable: emailAvailable() };
}

/** One invoice with its items, payer and timeline. 404 when it is not the account's. */
export async function loadInvoiceDetail(supabase: AdminSupabase, invoiceId: string, profileId: string): Promise<InvoiceDetailView> {
    const { data: row, error } = await supabase
        .from("invoices")
        .select(`${INVOICE_SELECT}, payer_cpf, payer_address, fine_pct, interest_pct_month, days_payable_after_due, public_token`)
        .eq("id", invoiceId)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (error) throw new Error(`invoice: ${error.message}`);
    if (!row) throw notFound("Fatura não encontrada.");

    const [itemsRes, eventsRes, charges, deliveries] = await Promise.all([
        supabase.from("invoice_items").select("id, invoice_id, kind, description, amount, position").eq("invoice_id", invoiceId).eq("owner_id", profileId).order("position", { ascending: true }),
        supabase.from("invoice_events").select("id, type, actor, detail, created_at").eq("invoice_id", invoiceId).eq("owner_id", profileId).order("created_at", { ascending: true }),
        loadCharges(supabase, profileId, invoiceId),
        loadDeliveries(supabase, profileId, invoiceId),
    ]);
    if (itemsRes.error) throw new Error(`invoice_items: ${itemsRes.error.message}`);
    if (eventsRes.error) throw new Error(`invoice_events: ${eventsRes.error.message}`);

    const record = row as unknown as Record<string, unknown>;
    return {
        invoice: {
            ...toInvoiceView(record, ((itemsRes.data ?? []) as Record<string, unknown>[]).map(toItemView), charges.find(c => c.kind === "BOLEPIX") ?? null, deliveries[0] ?? null, charges.find(c => c.kind === "CARD_CHECKOUT") ?? null),
            payer_cpf: (record.payer_cpf as string | null) ?? null,
            payer_address: (record.payer_address as PayerAddress | null) ?? null,
            fine_pct: numOrNull(record.fine_pct),
            interest_pct_month: numOrNull(record.interest_pct_month),
            days_payable_after_due: numOrNull(record.days_payable_after_due),
            public_url: publicInvoiceUrl(String(record.public_token)),
        },
        events: ((eventsRes.data ?? []) as Record<string, unknown>[]).map((e): InvoiceEventView => ({
            id: String(e.id),
            type: String(e.type),
            actor: String(e.actor),
            detail: (e.detail as Record<string, unknown> | null) ?? {},
            created_at: String(e.created_at),
        })),
        deliveries: deliveries.map(d => toDeliveryView(d) as InvoiceDeliveryView),
    };
}
