/**
 * Loads an invoice by its public token for the tenant's page, and the boleto's PDF for its download.
 * The token is the only key (lib/billing/invoice-token-server.ts). A live boleto that has not been
 * checked at the bank for a while is read back first, and so is an open card session, so the tenant
 * never pays an invoice the page should have known was settled.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { isCrawler } from "@/lib/crawler-guard";
import { signStorageUrl } from "@/lib/storage";
import { INVOICE_DOCUMENTS_BUCKET, isLiveBoleto, loadCharges, refreshCharge, type ChargeRow } from "./charges-server";
import { cardOfferFor, isLiveCard, refreshCardOfInvoice } from "./card-server";
import { rowByToken } from "./invoice-token-server";
import { firstNameOf, maskCpf, type PublicInvoice } from "./public-invoice";

/** A boleto the bank has not been asked about for this long is asked about again. */
const STALE_AFTER_MS = 15 * 60_000;

async function senderNameOf(supabase: AdminSupabase, ownerId: string): Promise<string> {
    const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("business_name, trade_name, full_name").eq("id", ownerId).maybeSingle(),
        supabase.from("billing_settings").select("sender_name").eq("owner_id", ownerId).maybeSingle(),
    ]);
    return [settings?.sender_name, profile?.trade_name, profile?.business_name, profile?.full_name].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || "Proprietário";
}

export interface LoadPublicOptions {
    now?: number;
    /** `YYYY-MM-DD`: the day the card offer is computed for */
    today: string;
    /** the tenant just came back from Stripe Checkout: read the card session back regardless of age */
    afterCheckout?: boolean;
}

/** The invoice behind a token, as the tenant's page shows it; null for a token that leads nowhere. */
export async function loadPublicInvoice(supabase: AdminSupabase, token: string, opts: LoadPublicOptions): Promise<PublicInvoice | null> {
    const now = opts.now ?? Date.now();
    let row = await rowByToken(supabase, token);
    if (!row) return null;

    const [items, charges, senderName] = await Promise.all([
        supabase.from("invoice_items").select("description, amount, position").eq("invoice_id", row.id).eq("owner_id", row.owner_id).order("position", { ascending: true }),
        loadCharges(supabase, row.owner_id, row.id),
        senderNameOf(supabase, row.owner_id),
    ]);
    if (items.error) throw new Error(`invoice_items: ${items.error.message}`);

    let charge: ChargeRow | null = charges.find(c => c.kind === "BOLEPIX") ?? null;
    if (charge && isLiveBoleto(charge) && (!charge.last_checked_at || now - new Date(charge.last_checked_at).getTime() > STALE_AFTER_MS)) {
        try {
            charge = await refreshCharge(supabase, row.owner_id, charge, { actor: "SYSTEM" });
        } catch (err) {
            // the page shows what it knows; the bank's own systems refuse a boleto already paid
            console.error("[Pagar] refresh at the bank failed:", (err as Error).message);
        }
    }
    let card: ChargeRow | null = charges.find(c => c.kind === "CARD_CHECKOUT") ?? null;
    if (card && isLiveCard(card)) card = (await refreshCardOfInvoice(supabase, row.owner_id, row.id, { force: opts.afterCheckout, now })) ?? card;

    const settled = (charge?.status === "PAID" || card?.status === "PAID") && row.status !== "PAID";
    if (settled) row = (await rowByToken(supabase, token)) ?? row;
    const { offer } = await cardOfferFor(supabase, row, opts.today);

    return {
        number: row.number,
        status: row.status,
        amount: row.amount,
        due_date: row.due_date,
        reference_month: row.reference_month,
        payer_first_name: firstNameOf(row.payer_name),
        payer_cpf_masked: maskCpf(row.payer_cpf),
        place: [row.property_name, row.unit_name].filter(Boolean).join(" · ") || "Imóvel",
        items: ((items.data ?? []) as Array<{ description: string; amount: number | string }>).map(i => ({ description: i.description, amount: Number(i.amount) || 0 })),
        sender_name: senderName,
        fine_pct: row.fine_pct,
        interest_pct_month: row.interest_pct_month,
        days_payable_after_due: row.days_payable_after_due,
        charge: charge ? { status: charge.status, due_date: charge.due_date, digitable_line: charge.digitable_line, pix_copy_paste: charge.pix_copy_paste, has_pdf: Boolean(charge.pdf_path) } : null,
        card: offer.available ? { available: true, gross: offer.gross, surcharge: offer.surcharge, net: offer.net, late_extra: offer.late.extra, days_late: offer.late.daysLate, processing: card?.status === "OPEN" && opts.afterCheckout === true } : { available: false },
        paid: row.paid_on ? { on: row.paid_on, via: row.paid_via } : null,
    };
}

/** A short-lived URL of the boleto's PDF behind a token; null without a PDF (or a token). */
export async function publicBoletoPdfUrl(supabase: AdminSupabase, token: string): Promise<string | null> {
    const row = await rowByToken(supabase, token);
    if (!row) return null;
    const charge = (await loadCharges(supabase, row.owner_id, row.id)).find(c => c.kind === "BOLEPIX" && c.pdf_path);
    return charge?.pdf_path ? signStorageUrl(supabase, INVOICE_DOCUMENTS_BUCKET, charge.pdf_path, 5 * 60) : null;
}

/**
 * The page was opened: the owner sees the invoice as "visualizada". Not counted for a crawler or a
 * link scanner, nor for the owner looking at their own invoice while signed in; at most once per half
 * hour (the database decides). Never throws: the page renders whatever happens here.
 */
export async function recordPublicView(supabase: AdminSupabase, token: string, viewer: { userAgent: string | null; clerkUserId: string | null }): Promise<void> {
    try {
        if (isCrawler(viewer.userAgent)) return;
        if (viewer.clerkUserId) {
            const [row, { data: profile }] = await Promise.all([rowByToken(supabase, token), supabase.from("profiles").select("id").eq("clerk_id", viewer.clerkUserId).maybeSingle()]);
            if (!row || profile?.id === row.owner_id) return;
        }
        const { data, error } = await supabase.rpc("invoice_record_view", { p_token: token });
        if (error) throw new Error(error.message);
        const counted = (Array.isArray(data) ? data[0] : data) as { invoice_id: string; owner_id: string; first_view: boolean } | null | undefined;
        if (counted?.first_view) {
            await supabase.from("invoice_events").insert({ invoice_id: counted.invoice_id, owner_id: counted.owner_id, type: "VIEWED", actor: "TENANT", detail: {} });
        }
    } catch (err) {
        console.error("[Pagar] view not recorded:", (err as Error).message);
    }
}
