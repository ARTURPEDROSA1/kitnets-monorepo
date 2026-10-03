/**
 * Sending an invoice's e-mails to its tenant, and never twice.
 *
 * A delivery row is created first (unique per invoice, kind and sequence), claimed in the database
 * before the provider is called (one sender at a time; a claim older than ten minutes can be taken
 * over), and sent with its own id as the provider's idempotency key. What the provider answered is
 * kept on the row: SENT with the message id, or FAILED with the reason, which the daily run retries.
 *
 * Kinds: ISSUE (the invoice, one per boleto), RESEND (the owner sends it again, numbered), REMINDER
 * (sequence 0 = a few days before the due date, 1 = the overdue notice), RECEIPT (paid).
 *
 * Every function is scoped to the account (`profileId`).
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { notFound } from "@/lib/api-route";
import { cardFeeDecided } from "@/lib/card-gross-up";
import { lateCharges, stillPayable } from "@/lib/invoice-late-fees";
import { todayBRT } from "@/lib/lease-dashboard";
import { EmailError, emailAvailable, sendEmail, type EmailAttachment } from "./email-provider";
import { buildInvoiceEmail, buildReceiptEmail, senderAddress, type EmailContent } from "./invoice-email";
import { usableStripeAccount } from "./stripe-connection-server";

// the same bucket charges-server.ts writes the boleto PDFs to (not imported: that module imports this one)
const INVOICE_DOCUMENTS_BUCKET = "invoice-documents";
const TABLE = "invoice_deliveries";
const COLUMNS = "id, invoice_id, owner_id, kind, sequence, recipient, status, provider_id, attempts, last_error, locked_at, sent_at, created_at";

export type DeliveryKind = "ISSUE" | "REMINDER" | "RECEIPT" | "RESEND";
export type DeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "BOUNCED";

/** REMINDER sequences */
export const REMINDER_BEFORE = 0;
export const REMINDER_OVERDUE = 1;

export interface DeliveryRow {
    id: string;
    invoice_id: string;
    owner_id: string;
    kind: DeliveryKind;
    sequence: number;
    recipient: string;
    status: DeliveryStatus;
    provider_id: string | null;
    attempts: number;
    last_error: string | null;
    locked_at: string | null;
    sent_at: string | null;
    created_at: string;
}

/** The invoice's page for the tenant: the link in every e-mail. */
export const publicInvoiceUrl = (token: string, baseUrl: string = env.NEXT_PUBLIC_BASE_URL): string => `${baseUrl.replace(/\/+$/, "")}/pt/pagar/${token}`;

const normalize = (r: Record<string, unknown>): DeliveryRow => ({ ...(r as unknown as DeliveryRow), sequence: Number(r.sequence) || 0, attempts: Number(r.attempts) || 0 });

export async function loadDeliveries(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<DeliveryRow[]> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).eq("invoice_id", invoiceId).order("created_at", { ascending: false });
    if (error) throw new Error(`invoice_deliveries: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** The latest delivery of each invoice, keyed by invoice id. */
export async function loadLatestDeliveries(supabase: AdminSupabase, profileId: string): Promise<Map<string, DeliveryRow>> {
    const out = new Map<string, DeliveryRow>();
    for (const [id, rows] of await loadDeliveriesByInvoice(supabase, profileId)) out.set(id, rows[0]);
    return out;
}

/** Every delivery of the account, keyed by invoice id, newest first (the daily run decides reminders from them). */
export async function loadDeliveriesByInvoice(supabase: AdminSupabase, profileId: string): Promise<Map<string, DeliveryRow[]>> {
    const out = new Map<string, DeliveryRow[]>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw new Error(`invoice_deliveries: ${error.message}`);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
            const row = normalize(r);
            out.set(row.invoice_id, [...(out.get(row.invoice_id) ?? []), row]);
        }
        if (!data || data.length < 1000) return out;
    }
}

/** A claim this old belongs to a run that died (the database function lets it be taken over). */
export const STALE_CLAIM_MS = 10 * 60_000;
/** After this many tries the daily run leaves a delivery to the owner ("Reenviar" still works). */
export const MAX_AUTO_ATTEMPTS = 10;

/**
 * Deliveries the daily run should send: pending, failed (with tries left) or stuck in a dead run's
 * claim — of invoices still open, or receipts of invoices paid. Oldest first.
 */
export async function loadDeliveriesToSend(supabase: AdminSupabase, profileId: string, now: number = Date.now(), limit = 100): Promise<DeliveryRow[]> {
    const { data, error } = await supabase.from(TABLE).select(`${COLUMNS}, invoice:invoices!invoice_id(status)`).eq("owner_id", profileId)
        .in("status", ["PENDING", "FAILED", "SENDING"]).order("created_at", { ascending: true }).limit(limit);
    if (error) throw new Error(`invoice_deliveries: ${error.message}`);
    return ((data ?? []) as Array<Record<string, unknown> & { invoice?: { status?: string } | null }>)
        .filter(r => (r.kind === "RECEIPT" ? r.invoice?.status === "PAID" : r.invoice?.status === "DRAFT" || r.invoice?.status === "ISSUED"))
        .map(normalize)
        .filter(d => d.status === "PENDING" || (d.status === "FAILED" && d.attempts < MAX_AUTO_ATTEMPTS) || (d.status === "SENDING" && (!d.locked_at || now - new Date(d.locked_at).getTime() > STALE_CLAIM_MS)));
}

interface InvoiceForEmail {
    id: string;
    number: number;
    status: string;
    amount: number;
    due_date: string;
    reference_month: string;
    public_token: string;
    payer_name: string | null;
    payer_email: string | null;
    tenant_id: string;
    unit_name: string | null;
    property_name: string | null;
    tenant_name: string | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    paid_on: string | null;
    paid_amount: number | null;
    paid_via: "BOLETO" | "PIX" | "CARD" | "MANUAL" | null;
    late_fee_amount: number;
    surcharge_amount: number;
    items: Array<{ description: string; amount: number }>;
    charge: { status: string; digitable_line: string | null; pix_copy_paste: string | null; pdf_path: string | null } | null;
}

async function loadInvoiceForEmail(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<InvoiceForEmail> {
    const { data, error } = await supabase.from("invoices")
        .select("id, number, status, amount, due_date, reference_month, public_token, payer_name, payer_email, tenant_id, unit_name, fine_pct, interest_pct_month, days_payable_after_due, paid_on, paid_amount, paid_via, late_fee_amount, surcharge_amount, property:properties!property_id(name), tenant:tenants!tenant_id(full_name, email), invoice_items(description, amount, position), invoice_charges(status, kind, digitable_line, pix_copy_paste, pdf_path, created_at)")
        .eq("id", invoiceId).eq("owner_id", profileId).maybeSingle();
    if (error) throw new Error(`invoice: ${error.message}`);
    if (!data) throw notFound("Fatura não encontrada.");
    const r = data as unknown as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    const tenant = (r.tenant as { full_name?: string; email?: string | null } | null) ?? null;
    const charges = ((r.invoice_charges ?? []) as Array<{ status: string; kind: string; digitable_line: string | null; pix_copy_paste: string | null; pdf_path: string | null; created_at: string }>)
        .filter(c => c.kind === "BOLEPIX").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const live = charges.find(c => c.status === "OPEN" || c.status === "REQUESTED") ?? null;
    return {
        id: String(r.id), number: Number(r.number) || 0, status: String(r.status), amount: Number(r.amount) || 0,
        due_date: String(r.due_date).slice(0, 10), reference_month: String(r.reference_month).slice(0, 10), public_token: String(r.public_token),
        payer_name: (r.payer_name as string | null) ?? null,
        // the tenant's e-mail as it is now beats the one snapshotted when the invoice was created
        payer_email: tenant?.email?.trim() || (r.payer_email as string | null) || null,
        tenant_id: String(r.tenant_id), unit_name: (r.unit_name as string | null) ?? null,
        property_name: ((r.property as { name?: string } | null)?.name) ?? null, tenant_name: tenant?.full_name ?? null,
        fine_pct: num(r.fine_pct), interest_pct_month: num(r.interest_pct_month), days_payable_after_due: num(r.days_payable_after_due),
        paid_on: r.paid_on ? String(r.paid_on).slice(0, 10) : null, paid_amount: num(r.paid_amount), paid_via: (r.paid_via as InvoiceForEmail["paid_via"]) ?? null,
        late_fee_amount: Number(r.late_fee_amount) || 0, surcharge_amount: Number(r.surcharge_amount) || 0,
        items: ((r.invoice_items ?? []) as Array<{ description: string; amount: number | string; position: number }>).sort((a, b) => a.position - b.position).map(i => ({ description: i.description, amount: Number(i.amount) || 0 })),
        charge: live,
    };
}

interface OwnerSettings {
    sender_name: string | null;
    reply_to_email: string | null;
    card_fee_pct: number | null;
    card_fee_fixed: number | null;
    send_receipts: boolean;
}

async function ownerSettings(supabase: AdminSupabase, profileId: string): Promise<OwnerSettings> {
    const { data } = await supabase.from("billing_settings").select("sender_name, reply_to_email, card_fee_pct, card_fee_fixed, send_receipts").eq("owner_id", profileId).maybeSingle();
    return {
        sender_name: (data?.sender_name as string | null | undefined) ?? null,
        reply_to_email: (data?.reply_to_email as string | null | undefined) ?? null,
        card_fee_pct: data?.card_fee_pct == null ? null : Number(data.card_fee_pct),
        card_fee_fixed: data?.card_fee_fixed == null ? null : Number(data.card_fee_fixed),
        send_receipts: data?.send_receipts !== false,
    };
}

async function senderFor(supabase: AdminSupabase, profileId: string, settings: OwnerSettings): Promise<{ from: string; replyTo: string | null; name: string }> {
    const { data: profile } = await supabase.from("profiles").select("business_name, trade_name, full_name, email").eq("id", profileId).maybeSingle();
    const name = [settings.sender_name, profile?.trade_name, profile?.business_name, profile?.full_name].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || "Proprietário";
    const replyTo = [settings.reply_to_email, profile?.email].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || null;
    return { from: senderAddress(name, env.BILLING_EMAIL_FROM ?? "Kitnets <faturas@kitnets.com>"), replyTo, name };
}

async function event(supabase: AdminSupabase, profileId: string, invoiceId: string, type: string, detail: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from("invoice_events").insert({ invoice_id: invoiceId, owner_id: profileId, type, actor: "SYSTEM", detail });
    if (error) console.error("[Invoices] event failed:", error.message);
}

export interface QueueOptions {
    /** ISSUE: which boleto of the invoice (0 = the first; a reissue after expiry gets its own e-mail). REMINDER: 0 = before the due date, 1 = overdue. */
    sequence?: number;
}

/**
 * Creates the delivery row for an invoice's e-mail (an ISSUE is one per boleto; a RESEND is numbered;
 * a REMINDER is one per sequence; a RECEIPT is one). Nothing is sent here. Returns the row, existing or new.
 */
export async function queueDelivery(supabase: AdminSupabase, profileId: string, invoiceId: string, kind: DeliveryKind, opts: QueueOptions = {}): Promise<DeliveryRow> {
    const invoice = await loadInvoiceForEmail(supabase, profileId, invoiceId);
    const existing = await loadDeliveries(supabase, profileId, invoiceId);
    const sequence = kind === "RESEND" ? existing.filter(d => d.kind === "RESEND").length + 1 : Math.max(0, opts.sequence ?? 0);
    const same = existing.find(d => d.kind === kind && d.sequence === sequence);
    if (same) return same;
    const { data, error } = await supabase.from(TABLE)
        .insert({ invoice_id: invoiceId, owner_id: profileId, kind, sequence, recipient: invoice.payer_email ?? "", status: "PENDING" })
        .select(COLUMNS).single();
    if (error) {
        if (error.code === "23505") return (await loadDeliveries(supabase, profileId, invoiceId)).find(d => d.kind === kind && d.sequence === sequence) as DeliveryRow;
        throw new Error(`invoice_deliveries: ${error.message}`);
    }
    return normalize(data as Record<string, unknown>);
}

/** What the e-mail is made of, by kind; or the reason the invoice is not in a state for it. */
async function compose(supabase: AdminSupabase, profileId: string, invoice: InvoiceForEmail, delivery: DeliveryRow, senderName: string, settings: OwnerSettings, attachments: EmailAttachment[]): Promise<{ content: EmailContent } | { refuse: string }> {
    const place = [invoice.property_name, invoice.unit_name].filter(Boolean).join(" · ") || "Imóvel";
    const common = { number: invoice.number, place, tenantName: invoice.payer_name ?? invoice.tenant_name ?? "", items: invoice.items, amount: invoice.amount, referenceMonth: invoice.reference_month, pageUrl: publicInvoiceUrl(invoice.public_token), senderName };

    if (delivery.kind === "RECEIPT") {
        if (invoice.status !== "PAID" || !invoice.paid_on) return { refuse: "a fatura ainda não consta como paga" };
        return { content: buildReceiptEmail({ ...common, paidOn: invoice.paid_on, paidAmount: invoice.paid_amount ?? invoice.amount, paidVia: invoice.paid_via, lateFee: invoice.late_fee_amount, surcharge: invoice.surcharge_amount }) };
    }
    if (invoice.status !== "ISSUED" && invoice.status !== "DRAFT") return { refuse: "a fatura não está mais em aberto" };
    const cardAvailable = cardFeeDecided(settings.card_fee_pct, settings.card_fee_fixed) && (await usableStripeAccount(supabase, profileId)) !== null;
    const codes = invoice.charge && (invoice.charge.digitable_line || invoice.charge.pix_copy_paste);
    if (!codes && !cardAvailable) return { refuse: "a fatura ainda não tem boleto e PIX emitidos pelo banco" };

    const kind = delivery.kind === "REMINDER" ? (delivery.sequence === REMINDER_OVERDUE ? "OVERDUE" : "REMINDER") : delivery.kind === "RESEND" ? "RESEND" : "ISSUE";
    const today = todayBRT();
    const late = kind === "OVERDUE" ? lateCharges(invoice.amount, invoice, today) : null;
    let payableUntil: string | null = null;
    if (kind === "OVERDUE" && invoice.days_payable_after_due !== null && stillPayable(invoice, today)) {
        const d = new Date(`${invoice.due_date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + invoice.days_payable_after_due);
        payableUntil = d.toISOString().slice(0, 10);
    }
    return {
        content: buildInvoiceEmail({
            ...common, dueDate: invoice.due_date, kind,
            digitableLine: invoice.charge?.digitable_line ?? null, pixCopyPaste: invoice.charge?.pix_copy_paste ?? null,
            pdfAttached: attachments.length > 0, cardAvailable,
            overdue: late ? { daysLate: late.daysLate, extra: late.extra, total: late.total, payableUntil } : undefined,
        }),
    };
}

/**
 * Sends one delivery: claims it, builds the message from the invoice as it is now, calls the
 * provider, records the outcome. Returns the row as it now stands (null when it was not ours to send:
 * already sent, or being sent by another run).
 */
export async function sendDelivery(supabase: AdminSupabase, profileId: string, deliveryId: string): Promise<DeliveryRow | null> {
    const { data: claimed, error: claimError } = await supabase.rpc("invoice_delivery_claim", { p_owner: profileId, p_delivery: deliveryId });
    if (claimError) throw new Error(`invoice_delivery_claim: ${claimError.message}`);
    const rows = (Array.isArray(claimed) ? claimed : claimed ? [claimed] : []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    const delivery = normalize(rows[0]);

    const fail = async (message: string): Promise<DeliveryRow> => {
        const { data, error } = await supabase.from(TABLE).update({ status: "FAILED", last_error: message.slice(0, 500), locked_at: null }).eq("id", delivery.id).eq("owner_id", profileId).select(COLUMNS).single();
        if (error) throw new Error(`invoice_deliveries: ${error.message}`);
        await event(supabase, profileId, delivery.invoice_id, "EMAIL_FAILED", { kind: delivery.kind, sequence: delivery.sequence, error: message.slice(0, 300) });
        return normalize(data as Record<string, unknown>);
    };

    const invoice = await loadInvoiceForEmail(supabase, profileId, delivery.invoice_id);
    const to = invoice.payer_email;
    if (!to) return fail("o inquilino não tem e-mail cadastrado");
    if (!emailAvailable()) return fail("envio de e-mail não configurado neste servidor");

    const settings = await ownerSettings(supabase, profileId);
    const sender = await senderFor(supabase, profileId, settings);
    const attachments: EmailAttachment[] = [];
    if (delivery.kind !== "RECEIPT" && invoice.charge?.pdf_path) {
        const { data: file } = await supabase.storage.from(INVOICE_DOCUMENTS_BUCKET).download(invoice.charge.pdf_path);
        if (file) attachments.push({ filename: `fatura-${invoice.number}-boleto.pdf`, content: Buffer.from(await file.arrayBuffer()), contentType: "application/pdf" });
    }
    const composed = await compose(supabase, profileId, invoice, delivery, sender.name, settings, attachments);
    if ("refuse" in composed) return fail(composed.refuse);

    try {
        const providerId = await sendEmail({ from: sender.from, to, replyTo: sender.replyTo, subject: composed.content.subject, text: composed.content.text, html: composed.content.html, attachments, idempotencyKey: delivery.id });
        const { data, error } = await supabase.from(TABLE)
            .update({ status: "SENT", provider_id: providerId, recipient: to, sent_at: new Date().toISOString(), locked_at: null, last_error: null })
            .eq("id", delivery.id).eq("owner_id", profileId).select(COLUMNS).single();
        if (error) throw new Error(`invoice_deliveries: ${error.message}`);
        await event(supabase, profileId, delivery.invoice_id, "EMAIL_SENT", { kind: delivery.kind, sequence: delivery.sequence, to, provider_id: providerId });
        return normalize(data as Record<string, unknown>);
    } catch (err) {
        if (err instanceof EmailError) return fail(err.message);
        throw err;
    }
}

/** Queues and sends an invoice's e-mail at once. Returns the delivery as it stands. */
export async function sendInvoiceEmail(supabase: AdminSupabase, profileId: string, invoiceId: string, kind: DeliveryKind, opts: QueueOptions = {}): Promise<DeliveryRow> {
    const queued = await queueDelivery(supabase, profileId, invoiceId, kind, opts);
    if (queued.status === "SENT") return queued;
    return (await sendDelivery(supabase, profileId, queued.id)) ?? queued;
}

/**
 * The owner asks for the e-mail again: a delivery that never got there is tried again; after one that
 * did, a numbered resend goes out. Returns the delivery as it stands (FAILED carries the reason).
 */
export async function resendInvoiceEmail(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<DeliveryRow> {
    const existing = await loadDeliveries(supabase, profileId, invoiceId);
    const unsent = existing.find(d => d.kind !== "RECEIPT" && (d.status === "PENDING" || d.status === "FAILED" || d.status === "BOUNCED"));
    if (unsent) return (await sendDelivery(supabase, profileId, unsent.id)) ?? unsent;
    return sendInvoiceEmail(supabase, profileId, invoiceId, existing.some(d => d.status === "SENT" && d.kind !== "RECEIPT") ? "RESEND" : "ISSUE");
}

/**
 * An invoice was just paid (boleto, Pix, card or by hand): the receipt goes out, unless the owner
 * switched receipts off. Never throws — the payment is recorded whatever happens to the e-mail.
 */
export async function sendReceipt(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<DeliveryRow | null> {
    try {
        const settings = await ownerSettings(supabase, profileId);
        if (!settings.send_receipts) return null;
        return await sendInvoiceEmail(supabase, profileId, invoiceId, "RECEIPT");
    } catch (err) {
        console.error("[Invoices] receipt failed:", (err as Error).message);
        return null;
    }
}
