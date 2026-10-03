/**
 * Loads an invoice by its public token for the tenant's page, and the boleto's PDF for its download.
 * The token is the only key: nothing here takes an owner or an invoice id from the request. A live
 * boleto that has not been checked at the bank for a while is read back first, so the tenant never
 * pays a boleto the page should have known was settled.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { signStorageUrl } from "@/lib/storage";
import { INVOICE_DOCUMENTS_BUCKET, isLiveCharge, loadCharges, refreshCharge, type ChargeRow } from "./charges-server";
import { PUBLIC_TOKEN_REGEX, firstNameOf, maskCpf, type PublicInvoice } from "./public-invoice";

/** A boleto the bank has not been asked about for this long is asked about again. */
const STALE_AFTER_MS = 15 * 60_000;

interface TokenRow {
    id: string;
    owner_id: string;
    number: number;
    status: PublicInvoice["status"];
    amount: number;
    due_date: string;
    reference_month: string;
    payer_name: string | null;
    payer_cpf: string | null;
    unit_name: string | null;
    paid_on: string | null;
    paid_via: string | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    property_name: string | null;
}

async function rowByToken(supabase: AdminSupabase, token: string): Promise<TokenRow | null> {
    if (!PUBLIC_TOKEN_REGEX.test(token)) return null;
    const { data, error } = await supabase.from("invoices")
        .select("id, owner_id, number, status, amount, due_date, reference_month, payer_name, payer_cpf, unit_name, paid_on, paid_via, fine_pct, interest_pct_month, days_payable_after_due, property:properties!property_id(name)")
        .eq("public_token", token).maybeSingle();
    if (error) throw new Error(`invoice by token: ${error.message}`);
    if (!data) return null;
    const r = data as unknown as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
        id: String(r.id), owner_id: String(r.owner_id), number: Number(r.number) || 0, status: r.status as PublicInvoice["status"], amount: Number(r.amount) || 0,
        due_date: String(r.due_date).slice(0, 10), reference_month: String(r.reference_month).slice(0, 10),
        payer_name: (r.payer_name as string | null) ?? null, payer_cpf: (r.payer_cpf as string | null) ?? null, unit_name: (r.unit_name as string | null) ?? null,
        paid_on: r.paid_on ? String(r.paid_on).slice(0, 10) : null, paid_via: (r.paid_via as string | null) ?? null,
        fine_pct: num(r.fine_pct), interest_pct_month: num(r.interest_pct_month), days_payable_after_due: num(r.days_payable_after_due),
        property_name: ((r.property as { name?: string } | null)?.name) ?? null,
    };
}

async function senderNameOf(supabase: AdminSupabase, ownerId: string): Promise<string> {
    const [{ data: profile }, { data: settings }] = await Promise.all([
        supabase.from("profiles").select("business_name, trade_name, full_name").eq("id", ownerId).maybeSingle(),
        supabase.from("billing_settings").select("sender_name").eq("owner_id", ownerId).maybeSingle(),
    ]);
    return [settings?.sender_name, profile?.trade_name, profile?.business_name, profile?.full_name].map(v => (typeof v === "string" ? v.trim() : "")).find(Boolean) || "Proprietário";
}

/** The invoice behind a token, as the tenant's page shows it; null for a token that leads nowhere. */
export async function loadPublicInvoice(supabase: AdminSupabase, token: string, now: number = Date.now()): Promise<PublicInvoice | null> {
    const row = await rowByToken(supabase, token);
    if (!row) return null;

    const [items, charges, senderName] = await Promise.all([
        supabase.from("invoice_items").select("description, amount, position").eq("invoice_id", row.id).eq("owner_id", row.owner_id).order("position", { ascending: true }),
        loadCharges(supabase, row.owner_id, row.id),
        senderNameOf(supabase, row.owner_id),
    ]);
    if (items.error) throw new Error(`invoice_items: ${items.error.message}`);

    let charge: ChargeRow | null = charges.find(c => c.kind === "BOLEPIX") ?? null;
    if (charge && isLiveCharge(charge) && (!charge.last_checked_at || now - new Date(charge.last_checked_at).getTime() > STALE_AFTER_MS)) {
        try {
            charge = await refreshCharge(supabase, row.owner_id, charge, { actor: "SYSTEM" });
        } catch (err) {
            // the page shows what it knows; the bank's own systems refuse a boleto already paid
            console.error("[Pagar] refresh at the bank failed:", (err as Error).message);
        }
    }
    const fresh = charge && charge.status === "PAID" && row.status !== "PAID" ? await rowByToken(supabase, token) : null;
    const head = fresh ?? row;

    return {
        number: head.number,
        status: head.status,
        amount: head.amount,
        due_date: head.due_date,
        reference_month: head.reference_month,
        payer_first_name: firstNameOf(head.payer_name),
        payer_cpf_masked: maskCpf(head.payer_cpf),
        place: [head.property_name, head.unit_name].filter(Boolean).join(" · ") || "Imóvel",
        items: ((items.data ?? []) as Array<{ description: string; amount: number | string }>).map(i => ({ description: i.description, amount: Number(i.amount) || 0 })),
        sender_name: senderName,
        fine_pct: head.fine_pct,
        interest_pct_month: head.interest_pct_month,
        days_payable_after_due: head.days_payable_after_due,
        charge: charge ? { status: charge.status, due_date: charge.due_date, digitable_line: charge.digitable_line, pix_copy_paste: charge.pix_copy_paste, has_pdf: Boolean(charge.pdf_path) } : null,
        paid: head.paid_on ? { on: head.paid_on, via: head.paid_via } : null,
    };
}

/** A short-lived URL of the boleto's PDF behind a token; null without a PDF (or a token). */
export async function publicBoletoPdfUrl(supabase: AdminSupabase, token: string): Promise<string | null> {
    const row = await rowByToken(supabase, token);
    if (!row) return null;
    const charge = (await loadCharges(supabase, row.owner_id, row.id)).find(c => c.kind === "BOLEPIX" && c.pdf_path);
    return charge?.pdf_path ? signStorageUrl(supabase, INVOICE_DOCUMENTS_BUCKET, charge.pdf_path, 5 * 60) : null;
}
