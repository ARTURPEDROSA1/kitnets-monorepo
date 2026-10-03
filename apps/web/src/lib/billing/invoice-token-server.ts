/**
 * The invoice behind a public token (`invoices.public_token`), for the tenant's page and the card
 * payment. The token is the only key: nothing here takes an owner or an invoice id from the request.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import type { InvoiceStatus } from "@/lib/invoice-views";
import { PUBLIC_TOKEN_REGEX } from "./public-invoice";

export interface TokenRow {
    id: string;
    owner_id: string;
    number: number;
    status: InvoiceStatus;
    amount: number;
    due_date: string;
    reference_month: string;
    payer_name: string | null;
    payer_cpf: string | null;
    payer_email: string | null;
    unit_name: string | null;
    paid_on: string | null;
    paid_via: string | null;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    property_name: string | null;
}

export async function rowByToken(supabase: AdminSupabase, token: string): Promise<TokenRow | null> {
    if (!PUBLIC_TOKEN_REGEX.test(token)) return null;
    const { data, error } = await supabase.from("invoices")
        .select("id, owner_id, number, status, amount, due_date, reference_month, payer_name, payer_cpf, payer_email, unit_name, paid_on, paid_via, fine_pct, interest_pct_month, days_payable_after_due, property:properties!property_id(name)")
        .eq("public_token", token).maybeSingle();
    if (error) throw new Error(`invoice by token: ${error.message}`);
    if (!data) return null;
    const r = data as unknown as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
        id: String(r.id), owner_id: String(r.owner_id), number: Number(r.number) || 0, status: r.status as InvoiceStatus, amount: Number(r.amount) || 0,
        due_date: String(r.due_date).slice(0, 10), reference_month: String(r.reference_month).slice(0, 10),
        payer_name: (r.payer_name as string | null) ?? null, payer_cpf: (r.payer_cpf as string | null) ?? null, payer_email: (r.payer_email as string | null) ?? null,
        unit_name: (r.unit_name as string | null) ?? null,
        paid_on: r.paid_on ? String(r.paid_on).slice(0, 10) : null, paid_via: (r.paid_via as string | null) ?? null,
        fine_pct: num(r.fine_pct), interest_pct_month: num(r.interest_pct_month), days_payable_after_due: num(r.days_payable_after_due),
        property_name: ((r.property as { name?: string } | null)?.name) ?? null,
    };
}
