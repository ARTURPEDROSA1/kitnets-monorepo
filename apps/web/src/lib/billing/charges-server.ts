/**
 * Issuing an invoice at Banco Inter and keeping its charge in step with the bank.
 *
 *   issue      the invoice becomes a "boleto com Pix" at the bank (one live charge per invoice); the
 *              boleto's digitable line, the Pix code and the PDF are fetched as soon as the bank has
 *              them (it works asynchronously for a moment)
 *   refresh    the charge is read back from the bank: a paid charge settles the invoice through
 *              invoice_mark_paid (the only way to PAID), an expired or cancelled one is recorded
 *   cancel     the charge is cancelled at the bank before the invoice is cancelled here
 *   callback   the bank's webhook names a charge; the charge is then read back — the payload is a
 *              hint, never the truth
 *
 * Every function is scoped to the account (`profileId`). The bank's own errors come through as
 * HttpError 502 with the bank's reason in words; the charge keeps the reason in `last_error`.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { HttpError, badRequest, notFound } from "@/lib/api-route";
import { env } from "@/lib/env";
import { signStorageUrl } from "@/lib/storage";
import type { PayerAddress } from "@/lib/invoice-payer";
import { ensureInterWebhook, ownerOfWebhookKey, sandboxAllowed, withInterSession } from "./connections-server";
import { sendInvoiceEmail, sendReceipt } from "./deliveries-server";
import { InterError, cancelInterCharge, createInterCharge, getInterCharge, getInterChargePdf, payInterChargeSandbox } from "./inter-client";
import { ISSUE_BLOCKER_LABELS, buildChargePayload, issueBlockers, termsToAdopt, parseChargeState, parseCallbackEntry, seuNumeroFor, type ChargeInvoice, type ChargeStatus, type InterChargeState } from "./inter-payload";

export const INVOICE_DOCUMENTS_BUCKET = "invoice-documents";
const TABLE = "invoice_charges";
export const CHARGE_COLUMNS = "id, invoice_id, owner_id, provider, kind, status, seu_numero, provider_ref, provider_status, amount, net_amount, surcharge_amount, due_date, days_payable_after_due, nosso_numero, barcode, digitable_line, pix_txid, pix_copy_paste, pdf_path, payment_intent_id, checkout_url, expires_at, paid_at, paid_amount, paid_via, attempts, last_error, last_checked_at, created_at";
const COLUMNS = CHARGE_COLUMNS;

export interface ChargeRow {
    id: string;
    invoice_id: string;
    owner_id: string;
    provider: "INTER" | "STRIPE";
    kind: "BOLEPIX" | "CARD_CHECKOUT";
    status: ChargeStatus;
    seu_numero: string | null;
    provider_ref: string | null;
    provider_status: string | null;
    amount: number;
    /** the card: what the owner receives (the invoice plus any late charges) */
    net_amount: number | null;
    /** the card: the fee passed on to the tenant */
    surcharge_amount: number | null;
    due_date: string | null;
    days_payable_after_due: number | null;
    nosso_numero: string | null;
    barcode: string | null;
    digitable_line: string | null;
    pix_txid: string | null;
    pix_copy_paste: string | null;
    pdf_path: string | null;
    /** the card: Stripe's payment intent */
    payment_intent_id: string | null;
    /** the card: where the tenant types it (while the session is open) */
    checkout_url: string | null;
    /** the card: when the session stops taking the payment */
    expires_at: string | null;
    paid_at: string | null;
    paid_amount: number | null;
    paid_via: "BOLETO" | "PIX" | "CARD" | null;
    attempts: number;
    last_error: string | null;
    last_checked_at: string | null;
    created_at: string;
}

const LIVE: ReadonlySet<ChargeStatus> = new Set<ChargeStatus>(["REQUESTED", "OPEN"]);
export const isLiveCharge = (c: Pick<ChargeRow, "status">) => LIVE.has(c.status);

export const normalizeCharge = (r: Record<string, unknown>): ChargeRow => ({
    ...(r as unknown as ChargeRow),
    amount: Number(r.amount) || 0,
    net_amount: r.net_amount == null ? null : Number(r.net_amount),
    surcharge_amount: r.surcharge_amount == null ? null : Number(r.surcharge_amount),
    paid_amount: r.paid_amount == null ? null : Number(r.paid_amount),
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
    attempts: Number(r.attempts) || 0,
});
const normalize = normalizeCharge;

/** The boleto still waiting at the bank (a card session is another matter: lib/billing/card-server.ts). */
export const isLiveBoleto = (c: Pick<ChargeRow, "status" | "kind">) => c.kind === "BOLEPIX" && LIVE.has(c.status);

/** The charges of one invoice, newest first. */
export async function loadCharges(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<ChargeRow[]> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).eq("invoice_id", invoiceId).order("created_at", { ascending: false });
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** The account's charges still waiting at the bank (REQUESTED or OPEN), oldest first. */
export async function loadLiveCharges(supabase: AdminSupabase, profileId: string): Promise<ChargeRow[]> {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).in("status", [...LIVE]).order("created_at", { ascending: true }).limit(500);
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(normalize);
}

/** The latest boleto of each invoice, keyed by invoice id. */
export async function loadLatestCharges(supabase: AdminSupabase, profileId: string): Promise<Map<string, ChargeRow>> {
    const out = new Map<string, ChargeRow>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", profileId).eq("kind", "BOLEPIX").order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw new Error(`invoice_charges: ${error.message}`);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
            const row = normalize(r);
            if (!out.has(row.invoice_id)) out.set(row.invoice_id, row);
        }
        if (!data || data.length < 1000) return out;
    }
}

interface InvoiceRow {
    id: string;
    number: number;
    status: string;
    amount: number;
    due_date: string;
    reference_month: string;
    property_id: string;
    unit_id: string | null;
    unit_name: string | null;
    payer_name: string | null;
    payer_cpf: string | null;
    payer_email: string | null;
    payer_address: PayerAddress | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    property_name: string | null;
    items: Array<{ description: string; amount: number }>;
}

async function loadInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<InvoiceRow> {
    const { data, error } = await supabase.from("invoices")
        .select("id, number, status, amount, due_date, reference_month, property_id, unit_id, unit_name, payer_name, payer_cpf, payer_email, payer_address, fine_pct, interest_pct_month, days_payable_after_due, property:properties!property_id(name), invoice_items(description, amount, position)")
        .eq("id", invoiceId).eq("owner_id", profileId).maybeSingle();
    if (error) throw new Error(`invoice: ${error.message}`);
    if (!data) throw notFound("Fatura não encontrada.");
    const r = data as unknown as Record<string, unknown>;
    const items = ((r.invoice_items ?? []) as Array<{ description: string; amount: number | string; position: number }>)
        .sort((a, b) => a.position - b.position).map(i => ({ description: i.description, amount: Number(i.amount) || 0 }));
    return {
        ...(r as unknown as InvoiceRow),
        amount: Number(r.amount) || 0,
        due_date: String(r.due_date).slice(0, 10),
        reference_month: String(r.reference_month).slice(0, 10),
        fine_pct: r.fine_pct == null ? null : Number(r.fine_pct),
        interest_pct_month: r.interest_pct_month == null ? null : Number(r.interest_pct_month),
        days_payable_after_due: r.days_payable_after_due == null ? null : Number(r.days_payable_after_due),
        property_name: ((r.property as { name?: string } | null)?.name) ?? null,
        items,
    };
}

async function event(supabase: AdminSupabase, profileId: string, invoiceId: string, type: string, actor: "SYSTEM" | "OWNER" | "INTER", detail: Record<string, unknown>, dedupeKey: string | null = null): Promise<boolean> {
    const { error } = await supabase.from("invoice_events").insert({ invoice_id: invoiceId, owner_id: profileId, type, actor, detail, dedupe_key: dedupeKey });
    if (error && error.code === "23505") return false;   // the same event again
    if (error) console.error("[Invoices] event failed:", error.message);
    return true;
}

const bankFailure = (err: unknown): never => {
    if (err instanceof InterError) throw new HttpError(502, { error: err.message });
    throw err;
};

/** The bank's PDF of the boleto, kept in the private bucket. */
async function storePdf(supabase: AdminSupabase, profileId: string, charge: ChargeRow, pdf: Buffer): Promise<string> {
    const path = `${profileId}/${charge.invoice_id}/${charge.id}.pdf`;
    const { error } = await supabase.storage.from(INVOICE_DOCUMENTS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`invoice-documents: ${error.message}`);
    return path;
}

/**
 * Brings a charge in line with what the bank says of it. A paid charge settles its invoice; an
 * open one that has no PDF yet gets it. Returns the charge as it now stands.
 */
export async function refreshCharge(supabase: AdminSupabase, profileId: string, charge: ChargeRow, opts: { actor?: "OWNER" | "SYSTEM" | "INTER" } = {}): Promise<ChargeRow> {
    if (!charge.provider_ref || charge.provider !== "INTER") return charge;
    const actor = opts.actor ?? "SYSTEM";
    let state: InterChargeState;
    try {
        state = await withInterSession(supabase, profileId, session => getInterCharge(session, charge.provider_ref as string).then(parseChargeState));
    } catch (err) {
        if (err instanceof InterError) {
            await supabase.from(TABLE).update({ last_error: err.message, last_checked_at: new Date().toISOString() }).eq("id", charge.id).eq("owner_id", profileId);
        }
        throw err;
    }

    const patch: Record<string, unknown> = {
        provider_status: state.situacao || charge.provider_status,
        status: state.status,
        nosso_numero: state.nossoNumero ?? charge.nosso_numero,
        barcode: state.barcode ?? charge.barcode,
        digitable_line: state.digitableLine ?? charge.digitable_line,
        pix_txid: state.pixTxid ?? charge.pix_txid,
        pix_copy_paste: state.pixCopyPaste ?? charge.pix_copy_paste,
        last_checked_at: new Date().toISOString(),
        last_error: null,
    };
    if (state.status === "PAID") {
        patch.paid_at = charge.paid_at ?? new Date().toISOString();
        patch.paid_amount = state.receivedAmount ?? charge.amount;
        patch.paid_via = state.receivedVia ?? "BOLETO";
    }
    const { data, error } = await supabase.from(TABLE).update(patch).eq("id", charge.id).eq("owner_id", profileId).select(COLUMNS).single();
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    let next = normalize(data as Record<string, unknown>);

    if (next.status !== charge.status) {
        const type = next.status === "PAID" ? "CHARGE_PAID" : next.status === "EXPIRED" ? "CHARGE_EXPIRED" : next.status === "CANCELLED" ? "CHARGE_CANCELLED" : next.status === "FAILED" ? "ISSUE_FAILED" : next.status === "OPEN" ? "CHARGE_OPEN" : null;
        if (type) await event(supabase, profileId, charge.invoice_id, type, actor, { situacao: state.situacao, codigoSolicitacao: charge.provider_ref, via: state.receivedVia, amount: state.receivedAmount });
    }

    if (next.status === "PAID") {
        const invoice = await loadInvoice(supabase, profileId, charge.invoice_id);
        if (invoice.status === "DRAFT" || invoice.status === "ISSUED") {
            const paid = next.paid_amount ?? next.amount;
            const { data: result, error: payError } = await supabase.rpc("invoice_mark_paid", {
                p_owner: profileId, p_invoice: charge.invoice_id, p_paid_on: state.stateDate ?? new Date().toISOString().slice(0, 10),
                p_amount: paid, p_via: next.paid_via ?? "BOLETO", p_late_fee: Math.max(0, Math.round((paid - invoice.amount) * 100) / 100), p_surcharge: 0,
                p_ref: charge.provider_ref, p_actor: "INTER",
            });
            if (payError) throw new Error(`invoice_mark_paid: ${payError.message}`);
            if (result === "DUPLICATE") console.warn("[Invoices] duplicate payment on", charge.invoice_id);
            if (result === "PAID") await sendReceipt(supabase, profileId, charge.invoice_id);
        }
    } else if (next.status === "OPEN" && !next.pdf_path) {
        try {
            const pdf = await withInterSession(supabase, profileId, session => getInterChargePdf(session, charge.provider_ref as string));
            const pdf_path = await storePdf(supabase, profileId, next, pdf);
            await supabase.from(TABLE).update({ pdf_path }).eq("id", next.id).eq("owner_id", profileId);
            next = { ...next, pdf_path };
        } catch (err) {
            // the boleto works without its PDF; the next refresh tries again
            console.error("[Invoices] boleto PDF failed:", (err as Error).message);
        }
    }
    if (next.status === "OPEN" && charge.status !== "OPEN") {
        // the tenant hears of the invoice the moment the bank makes it payable (one e-mail per boleto)
        try {
            await sendInvoiceEmail(supabase, profileId, charge.invoice_id, "ISSUE", { sequence: Math.max(0, next.attempts - 1) });
        } catch (err) {
            console.error("[Invoices] e-mail after issuing failed:", (err as Error).message);
        }
    }
    return next;
}

/** Refreshes an invoice's live charge, if it has one. */
export async function refreshInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string, actor: "OWNER" | "SYSTEM" | "INTER" = "OWNER"): Promise<ChargeRow | null> {
    const live = (await loadCharges(supabase, profileId, invoiceId)).find(isLiveBoleto);
    if (!live) return null;
    try {
        return await refreshCharge(supabase, profileId, live, { actor });
    } catch (err) {
        return bankFailure(err);
    }
}

/**
 * Issues the invoice at the bank. With `dueDate` the invoice's due date is moved first (an invoice
 * whose date passed cannot be issued otherwise). Throws 400 with the blockers, 409 when a charge is
 * already live, 502 with the bank's reason.
 */
export async function issueInvoice(supabase: AdminSupabase, profileId: string, invoiceId: string, today: string, opts: { dueDate?: string | null } = {}): Promise<ChargeRow> {
    let invoice = await loadInvoice(supabase, profileId, invoiceId);
    if (invoice.status === "PAID") throw new HttpError(409, { error: "Esta fatura já foi paga." });
    if (invoice.status === "CANCELLED") throw new HttpError(409, { error: "Esta fatura foi cancelada." });

    // created before the owner decided multa, juros and prazo: it takes them now, on its way to the bank
    if (invoice.fine_pct === null || invoice.interest_pct_month === null || invoice.days_payable_after_due === null) {
        const { data: settings } = await supabase.from("billing_settings").select("fine_pct, interest_pct_month, days_payable_after_due").eq("owner_id", profileId).maybeSingle();
        const num = (v: unknown) => (v == null ? null : Number(v));
        const adopted = termsToAdopt(invoice, settings ? { fine_pct: num(settings.fine_pct), interest_pct_month: num(settings.interest_pct_month), days_payable_after_due: num(settings.days_payable_after_due) } : null);
        if (Object.keys(adopted).length > 0) {
            const { error } = await supabase.from("invoices").update(adopted).eq("id", invoiceId).eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]);
            if (error) throw new Error(`invoice terms: ${error.message}`);
            await event(supabase, profileId, invoiceId, "TERMS_SET", "SYSTEM", adopted);
            invoice = { ...invoice, ...adopted };
        }
    }

    const existing = await loadCharges(supabase, profileId, invoiceId);
    if (existing.some(isLiveBoleto)) throw new HttpError(409, { error: "Esta fatura já tem um boleto ativo. Atualize o status ou cancele-o antes de emitir outro." });

    const dueDate = opts.dueDate ?? invoice.due_date;
    if (opts.dueDate && opts.dueDate < today) throw badRequest({ due_date: "A nova data de vencimento não pode ser passada." });
    const blockers = issueBlockers({ ...invoice, due_date: dueDate }, today);
    if (blockers.length > 0) throw badRequest({ _form: `A fatura não pode ser emitida: ${blockers.map(b => ISSUE_BLOCKER_LABELS[b]).join("; ")}.` });

    if (opts.dueDate && opts.dueDate !== invoice.due_date) {
        const { error } = await supabase.from("invoices").update({ due_date: opts.dueDate }).eq("id", invoiceId).eq("owner_id", profileId);
        if (error) throw new Error(`invoice due date: ${error.message}`);
        await event(supabase, profileId, invoiceId, "DUE_DATE_MOVED", "OWNER", { from: invoice.due_date, to: opts.dueDate });
    }

    const attempt = existing.filter(c => c.kind === "BOLEPIX").length + 1;
    const seuNumero = seuNumeroFor(invoice.number, attempt);
    const { data: inserted, error: insertError } = await supabase.from(TABLE).insert({
        invoice_id: invoiceId, owner_id: profileId, provider: "INTER", kind: "BOLEPIX", status: "REQUESTED",
        seu_numero: seuNumero, amount: invoice.amount, due_date: dueDate, days_payable_after_due: invoice.days_payable_after_due, attempts: attempt,
    }).select(COLUMNS).single();
    if (insertError) {
        if (insertError.code === "23505") throw new HttpError(409, { error: "Esta fatura já tem um boleto ativo." });
        throw new Error(`invoice_charges: ${insertError.message}`);
    }
    const charge = normalize(inserted as Record<string, unknown>);

    const payload = buildChargePayload({ ...invoice, due_date: dueDate } as ChargeInvoice, seuNumero, dueDate);
    let codigo: string;
    try {
        codigo = await withInterSession(supabase, profileId, async session => {
            await ensureInterWebhook(supabase, profileId, session, env.NEXT_PUBLIC_BASE_URL);
            return createInterCharge(session, payload as unknown as Record<string, unknown>);
        });
    } catch (err) {
        const message = err instanceof InterError ? err.message : err instanceof HttpError ? String(err.body.error ?? err.message) : "Falha ao falar com o banco.";
        await supabase.from(TABLE).update({ status: "FAILED", last_error: message, last_checked_at: new Date().toISOString() }).eq("id", charge.id).eq("owner_id", profileId);
        await event(supabase, profileId, invoiceId, "ISSUE_FAILED", "OWNER", { seuNumero, error: message });
        if (err instanceof InterError) throw new HttpError(502, { error: err.message });
        throw err;
    }

    const { error: refError } = await supabase.from(TABLE).update({ provider_ref: codigo, provider_status: "EM_PROCESSAMENTO" }).eq("id", charge.id).eq("owner_id", profileId);
    if (refError) throw new Error(`invoice_charges: ${refError.message}`);
    const { error: invError } = await supabase.from("invoices").update({ status: "ISSUED", issued_at: new Date().toISOString() }).eq("id", invoiceId).eq("owner_id", profileId).in("status", ["DRAFT", "ISSUED"]);
    if (invError) throw new Error(`invoice: ${invError.message}`);
    await event(supabase, profileId, invoiceId, "ISSUED", "OWNER", { seuNumero, codigoSolicitacao: codigo, dueDate, amount: invoice.amount });

    // the bank makes the boleto asynchronously: usually it is there already
    try {
        return await refreshCharge(supabase, profileId, { ...charge, provider_ref: codigo, provider_status: "EM_PROCESSAMENTO" }, { actor: "SYSTEM" });
    } catch (err) {
        console.error("[Invoices] first refresh after issuing failed:", (err as Error).message);
        return { ...charge, provider_ref: codigo, provider_status: "EM_PROCESSAMENTO" };
    }
}

/** Cancels the invoice's live charge at the bank (nothing to do when there is none). The charge's reason is what the owner typed. */
export async function cancelChargeAtBank(supabase: AdminSupabase, profileId: string, invoiceId: string, reason: string | null): Promise<void> {
    const live = (await loadCharges(supabase, profileId, invoiceId)).find(isLiveBoleto);
    if (!live) return;
    if (live.provider_ref) {
        try {
            await withInterSession(supabase, profileId, session => cancelInterCharge(session, live.provider_ref as string, reason || "Cancelada pelo proprietario"));
        } catch (err) {
            // already gone at the bank: fine, that is what we wanted
            if (!(err instanceof InterError && err.code === "NOT_FOUND")) bankFailure(err);
        }
    }
    const { error } = await supabase.from(TABLE).update({ status: "CANCELLED", provider_status: "CANCELADO", last_checked_at: new Date().toISOString() }).eq("id", live.id).eq("owner_id", profileId);
    if (error) throw new Error(`invoice_charges: ${error.message}`);
    await event(supabase, profileId, invoiceId, "CHARGE_CANCELLED", "OWNER", { codigoSolicitacao: live.provider_ref, reason });
}

/** A short-lived URL of the boleto's PDF, or null when the bank has not given it yet. */
export async function boletoPdfUrl(supabase: AdminSupabase, profileId: string, invoiceId: string): Promise<string | null> {
    const charge = (await loadCharges(supabase, profileId, invoiceId)).find(c => c.pdf_path);
    return charge?.pdf_path ? signStorageUrl(supabase, INVOICE_DOCUMENTS_BUCKET, charge.pdf_path, 15 * 60) : null;
}

/**
 * The bank's webhook: for each entry, the charge it names is read back from the bank. Nothing in the
 * payload is trusted beyond "look at this charge". Returns how many charges were refreshed.
 */
export async function handleInterCallback(supabase: AdminSupabase, key: string, body: unknown): Promise<{ owner: boolean; refreshed: number; ignored: number }> {
    const ownerId = await ownerOfWebhookKey(supabase, key);
    if (!ownerId) return { owner: false, refreshed: 0, ignored: 0 };
    const entries = (Array.isArray(body) ? body : [body]).map(parseCallbackEntry).filter((e): e is NonNullable<typeof e> => e !== null).slice(0, 50);
    let refreshed = 0, ignored = 0;
    for (const entry of entries) {
        const { data } = await supabase.from(TABLE).select(COLUMNS).eq("owner_id", ownerId).eq("provider", "INTER").eq("provider_ref", entry.codigoSolicitacao).maybeSingle();
        if (!data) { ignored++; continue; }
        const charge = normalize(data as Record<string, unknown>);
        const fresh = await event(supabase, ownerId, charge.invoice_id, "WEBHOOK", "INTER", { situacao: entry.situacao, at: entry.at }, `inter:${entry.codigoSolicitacao}:${entry.situacao}:${entry.at ?? ""}`);
        if (!fresh) { ignored++; continue; }
        try {
            await refreshCharge(supabase, ownerId, charge, { actor: "INTER" });
            refreshed++;
        } catch (err) {
            console.error("[Inter webhook] refresh failed:", (err as Error).message);
            ignored++;
        }
    }
    return { owner: true, refreshed, ignored };
}

/** Sandbox only: pays the invoice's live charge as the tenant would, then reads it back. */
export async function paySandboxCharge(supabase: AdminSupabase, profileId: string, invoiceId: string, via: "BOLETO" | "PIX"): Promise<ChargeRow> {
    if (!sandboxAllowed()) throw new HttpError(403, { error: "Só no ambiente de testes." });
    const live = (await loadCharges(supabase, profileId, invoiceId)).find(isLiveBoleto);
    if (!live?.provider_ref) throw notFound("Esta fatura não tem um boleto ativo.");
    try {
        await withInterSession(supabase, profileId, session => payInterChargeSandbox(session, live.provider_ref as string, via));
        return await refreshCharge(supabase, profileId, live, { actor: "SYSTEM" });
    } catch (err) {
        return bankFailure(err);
    }
}
