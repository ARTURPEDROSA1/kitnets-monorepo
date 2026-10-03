/**
 * Server-side writes of the Fatura routes: generating a month's invoices, cancelling one, recording a
 * payment, and saying who collects a lease's components. Every write is scoped to the account
 * (`profileId`); the invoice itself is created, settled and cancelled by database functions, so a month is
 * never invoiced twice, an invoice is never paid twice, and the income ledger follows every one of those
 * steps (migrations 20261002120000 and 20261002200000).
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, badRequest, notFound } from "@/lib/api-route";
import { loadLeaseRows } from "@/lib/lease-views-server";
import { IN_FORCE, titleOf } from "@/lib/lease-dashboard";
import { RENT_KEY, leaseComponents, type Collector } from "@/lib/invoice-collection";
import { SKIP_LABELS, planInvoice, type PlanSkip } from "@/lib/invoice-generate";
import type { PayerProperty, PayerTenant } from "@/lib/invoice-payer";
import { loadBillingSettings } from "@/lib/invoice-views-server";
import type { GenerateResult, InvoiceOrigin } from "@/lib/invoice-views";
import type { BillingSettingsInput } from "@/lib/schemas/invoice";
import { cancelChargeAtBank } from "@/lib/billing/charges-server";
import { closeCardSessions } from "@/lib/billing/card-server";
import { sendReceipt } from "@/lib/billing/deliveries-server";
import { termsToAdopt } from "@/lib/billing/inter-payload";

const TENANT_COLUMNS = "id, full_name, cpf, email, postal_code, street, street_number, address_complement, neighborhood, city, state, use_property_address";

/** Reasons worth telling the owner about when a whole month is generated: a lease the owner collects on that still got no invoice. */
const REPORTED: ReadonlySet<PlanSkip> = new Set<PlanSkip>(["PAUSED", "BEFORE_START", "AFTER_TERMINATION", "NO_TENANT"]);

/**
 * Creates the invoices that fall due in `month` — for every lease in force, or for one. A lease that
 * already has a live invoice for the month is left alone, so running it again only fills what is missing.
 */
export async function generateInvoices(
    supabase: AdminSupabase,
    profileId: string,
    month: string,
    opts: {
        leaseId?: string | null;
        origin: InvoiceOrigin;
        /** only invoices falling due within `[dueFrom, dueTo]` (the daily run's window); the others are left for later, silently */
        dueFrom?: string;
        dueTo?: string;
    }
): Promise<GenerateResult> {
    const all = await loadLeaseRows(supabase, profileId);
    const leases = opts.leaseId ? all.filter(l => l.id === opts.leaseId) : all.filter(l => IN_FORCE.has(l.status));
    if (opts.leaseId && leases.length === 0) throw notFound("Contrato não encontrado.");

    const tenantIds = [...new Set(leases.map(l => l.primary_tenant_id))];
    const propertyIds = [...new Set(leases.map(l => l.property_id))];
    const [settings, tenantsRes, propertiesRes] = await Promise.all([
        loadBillingSettings(supabase, profileId),
        tenantIds.length > 0
            ? supabase.from("tenants").select(TENANT_COLUMNS).eq("user_id", profileId).in("id", tenantIds)
            : Promise.resolve({ data: [], error: null }),
        propertyIds.length > 0
            ? supabase.from("properties").select("id, address, city, state, zip").eq("owner_id", profileId).in("id", propertyIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (tenantsRes.error) throw new Error(`tenants: ${tenantsRes.error.message}`);
    if (propertiesRes.error) throw new Error(`properties: ${propertiesRes.error.message}`);
    const tenants = new Map(((tenantsRes.data ?? []) as unknown as Array<PayerTenant & { id: string }>).map(t => [t.id, t]));
    const properties = new Map(((propertiesRes.data ?? []) as unknown as Array<PayerProperty & { id: string }>).map(p => [p.id, p]));

    const result: GenerateResult = { month, created: 0, existing: 0, skipped: [] };
    for (const lease of leases) {
        const planned = planInvoice({
            lease,
            components: leaseComponents(lease),
            tenant: tenants.get(lease.primary_tenant_id) ?? null,
            property: properties.get(lease.property_id) ?? null,
            settings,
            month,
            origin: opts.origin,
        });
        if ("skip" in planned) {
            if (opts.leaseId || REPORTED.has(planned.skip)) result.skipped.push({ lease_id: lease.id, title: titleOf(lease), reason: SKIP_LABELS[planned.skip] });
            continue;
        }
        const due = planned.plan.head.due_date;
        if ((opts.dueFrom && due < opts.dueFrom) || (opts.dueTo && due > opts.dueTo)) continue;
        const { data, error } = await supabase.rpc("invoice_create", { p_owner: profileId, p_invoice: planned.plan.head, p_items: planned.plan.items });
        if (error) {
            console.error("[Invoices] invoice_create failed for lease", lease.id, error.message);
            result.skipped.push({ lease_id: lease.id, title: titleOf(lease), reason: "erro ao gravar a fatura" });
            continue;
        }
        if (data) result.created += 1;
        else result.existing += 1;
    }
    return result;
}

/** The invoice's status, or a 404 when it is not the account's. */
async function ownedInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<{ id: string; status: string; amount: number; due_date: string }> {
    const { data, error } = await supabase.from("invoices").select("id, status, amount, due_date").eq("id", invoiceId).eq("owner_id", profileId).maybeSingle();
    if (error) throw new Error(`invoice: ${error.message}`);
    if (!data) throw notFound("Fatura não encontrada.");
    return { id: String(data.id), status: String(data.status), amount: Number(data.amount) || 0, due_date: String(data.due_date).slice(0, 10) };
}

const settled = (status: string) =>
    new HttpError(409, { error: status === "PAID" ? "Esta fatura já foi paga." : "Esta fatura foi cancelada." });

/** Cancels an open invoice; the lease's month is free to be invoiced again. */
export async function cancelInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string, reason: string | null): Promise<void> {
    const invoice = await ownedInvoice(supabase, profileId, invoiceId);
    if (invoice.status !== "DRAFT" && invoice.status !== "ISSUED") throw settled(invoice.status);

    // the bank first: a boleto that stays alive after the invoice is gone could still be paid; the card session likewise
    await cancelChargeAtBank(supabase, profileId, invoiceId, reason);
    await closeCardSessions(supabase, profileId, invoiceId);
    // the database cancels it, records the event and takes it out of the income ledger in one go
    const { data, error } = await supabase.rpc("invoice_cancel", { p_owner: profileId, p_invoice: invoiceId, p_reason: reason, p_actor: "OWNER" });
    if (error) throw new Error(`invoice_cancel: ${error.message}`);
    // paid (or cancelled) between the read and the write
    if (data !== "CANCELLED") throw settled(String(data));
}

/**
 * The owner records a payment received outside the module (a transfer, cash). What came in above the
 * invoice's amount is the late fee; a payment below the amount is refused — the invoice would read
 * as settled while money is still owed.
 */
export async function payInvoiceManually(
    supabase: AdminSupabase,
    profileId: string,
    invoiceId: string,
    input: { paid_on: string; paid_amount: number | null; notes: string | null },
    today: string
): Promise<void> {
    const invoice = await ownedInvoice(supabase, profileId, invoiceId);
    if (invoice.status !== "DRAFT" && invoice.status !== "ISSUED") throw settled(invoice.status);
    if (input.paid_on > today) throw badRequest({ paid_on: "A data do pagamento não pode ser futura." });

    const paid = input.paid_amount ?? invoice.amount;
    if (paid < invoice.amount) throw badRequest({ paid_amount: "O valor recebido é menor que o da fatura. Cancele a fatura e gere outra com o valor certo, ou registre o valor integral." });
    const lateFee = Math.round((paid - invoice.amount) * 100) / 100;

    const { data, error } = await supabase.rpc("invoice_mark_paid", {
        p_owner: profileId, p_invoice: invoiceId, p_paid_on: input.paid_on, p_amount: paid, p_via: "MANUAL",
        p_late_fee: lateFee, p_surcharge: 0, p_ref: null, p_actor: "OWNER",
    });
    if (error) throw new Error(`invoice_mark_paid: ${error.message}`);
    if (data !== "PAID") throw settled((await ownedInvoice(supabase, profileId, invoiceId)).status);
    // the boleto, if any, must not stay payable; then the receipt
    await cancelChargeAtBank(supabase, profileId, invoiceId, "Pago por fora").catch(err => console.error("[Invoices] cancelling the boleto after a manual payment failed:", (err as Error).message));
    await closeCardSessions(supabase, profileId, invoiceId);
    await sendReceipt(supabase, profileId, invoiceId);

    if (input.notes) {
        const { error: notesError } = await supabase.from("invoices").update({ notes: input.notes }).eq("id", invoiceId).eq("owner_id", profileId);
        if (notesError) console.error("[Invoices] payment notes failed:", notesError.message);
    }
}

/**
 * Who collects one component of a lease (`rent`, or a charge's id); null clears the answer, and the
 * component follows the lease's management again. And/or pauses the lease's invoicing.
 */
export async function updateCollection(
    supabase: AdminSupabase,
    profileId: string,
    input: { lease_id: string; component: string | null; collected_by?: Collector | null; paused?: boolean }
): Promise<void> {
    const { data: lease, error } = await supabase.from("leases").select("id").eq("id", input.lease_id).eq("user_id", profileId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`lease: ${error.message}`);
    if (!lease) throw notFound("Contrato não encontrado.");

    const patch: Record<string, unknown> = {};
    if (input.paused !== undefined) patch.billing_paused = input.paused;
    if (input.component === RENT_KEY && input.collected_by !== undefined) patch.rent_collected_by = input.collected_by;
    if (Object.keys(patch).length > 0) {
        const { error: leaseError } = await supabase.from("leases").update(patch).eq("id", input.lease_id).eq("user_id", profileId);
        if (leaseError) throw new Error(`lease update: ${leaseError.message}`);
    }

    if (input.component && input.component !== RENT_KEY && input.collected_by !== undefined) {
        // only a charge the tenant pays has a collector
        const { data: charge, error: chargeError } = await supabase
            .from("lease_charges")
            .update({ collected_by: input.collected_by })
            .eq("id", input.component)
            .eq("lease_id", input.lease_id)
            .eq("responsibility", "TENANT")
            .select("id");
        if (chargeError) throw new Error(`charge update: ${chargeError.message}`);
        // the contract was saved meanwhile: its charges were rewritten and this id is gone
        if (!charge || charge.length === 0) throw new HttpError(409, { error: "Este encargo mudou no contrato. Recarregue a página e tente de novo." });
    }
}

export async function saveBillingSettings(supabase: AdminSupabase, profileId: string, input: BillingSettingsInput): Promise<void> {
    const row = { owner_id: profileId, ...input, automation_from_month: input.automation_from_month ? `${input.automation_from_month}-01` : null };
    const { error } = await supabase.from("billing_settings").upsert(row, { onConflict: "owner_id" });
    if (error) {
        // the table refuses the automation without every decision (the schema checks the same; this is the backstop)
        if (error.code === "23514" && error.message.includes("automation_needs_decisions")) throw badRequest({ automation_enabled: "Decida antecedência, multa, juros, prazo e o mês inicial antes de ligar a emissão automática." });
        throw new Error(`billing_settings: ${error.message}`);
    }
    await adoptTermsOnOpenInvoices(supabase, profileId, input);
}

/**
 * Open invoices that state no late terms yet (created before the owner decided them) take the terms
 * just saved — only the ones they lack; an invoice with a boleto already has its own. Best effort: the
 * issue step does the same for whatever is missed here (lib/billing/charges-server.ts).
 */
async function adoptTermsOnOpenInvoices(supabase: AdminSupabase, profileId: string, settings: Pick<BillingSettingsInput, "fine_pct" | "interest_pct_month" | "days_payable_after_due">): Promise<void> {
    try {
        const { data, error } = await supabase.from("invoices").select("id, fine_pct, interest_pct_month, days_payable_after_due")
            .eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]).or("fine_pct.is.null,interest_pct_month.is.null,days_payable_after_due.is.null").limit(500);
        if (error) throw new Error(error.message);
        const num = (v: unknown) => (v == null ? null : Number(v));
        for (const row of (data ?? []) as Array<Record<string, unknown>>) {
            const adopted = termsToAdopt({ fine_pct: num(row.fine_pct), interest_pct_month: num(row.interest_pct_month), days_payable_after_due: num(row.days_payable_after_due) }, settings);
            if (Object.keys(adopted).length === 0) continue;
            const { error: updateError } = await supabase.from("invoices").update(adopted).eq("id", String(row.id)).eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]);
            if (updateError) throw new Error(updateError.message);
            await supabase.from("invoice_events").insert({ invoice_id: String(row.id), owner_id: profileId, type: "TERMS_SET", actor: "OWNER", detail: adopted });
        }
    } catch (err) {
        console.error("[Invoices] adopting the terms on open invoices failed:", (err as Error).message);
    }
}
