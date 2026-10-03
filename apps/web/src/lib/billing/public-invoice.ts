/**
 * What the tenant's page shows of an invoice (app/[lang]/pagar/[token]). The page is reached by a link
 * in an e-mail, so it shows the least that identifies the invoice to the person who got it — a first
 * name, a masked CPF, the place — and everything needed to pay. Pure; the loader lives in
 * public-invoice-server.ts.
 */
import type { InvoiceStatus } from "@/lib/invoice-views";
import type { ChargeStatus } from "@/lib/billing/inter-payload";

/** Two UUIDs without dashes, as `invoices.public_token` defaults to. */
export const PUBLIC_TOKEN_REGEX = /^[0-9a-f]{64}$/;

export interface PublicInvoice {
    number: number;
    status: InvoiceStatus;
    amount: number;
    /** `YYYY-MM-DD` */
    due_date: string;
    /** `YYYY-MM-DD` (first day) */
    reference_month: string;
    /** "Ana" */
    payer_first_name: string;
    /** "***.456.789-**" */
    payer_cpf_masked: string | null;
    /** "SANTO ANTONIO · Kitnet 35C" */
    place: string;
    items: Array<{ description: string; amount: number }>;
    /** the owner, as the tenant knows them */
    sender_name: string;
    fine_pct: number | null;
    interest_pct_month: number | null;
    days_payable_after_due: number | null;
    charge: {
        status: ChargeStatus;
        due_date: string | null;
        digitable_line: string | null;
        pix_copy_paste: string | null;
        has_pdf: boolean;
    } | null;
    paid: { on: string; via: string | null } | null;
}

export type PublicInvoiceState = "pay" | "preparing" | "expired" | "paid" | "cancelled" | "late_pay";

/**
 * What the tenant is told. Late but still payable (a live boleto past the due date) says so and still
 * pays; expired says to ask the owner for a new one.
 */
export function publicInvoiceState(invoice: Pick<PublicInvoice, "status" | "due_date" | "charge">, today: string): PublicInvoiceState {
    if (invoice.status === "PAID") return "paid";
    if (invoice.status === "CANCELLED") return "cancelled";
    const c = invoice.charge;
    if (!c || c.status === "REQUESTED" || c.status === "FAILED" || c.status === "CANCELLED") return "preparing";
    if (c.status === "EXPIRED") return "expired";
    if (c.status === "PAID") return "paid";
    return invoice.due_date < today ? "late_pay" : "pay";
}

export const PUBLIC_STATE_META: Record<PublicInvoiceState, { label: string; tone: "sky" | "slate" | "amber" | "emerald" | "rose" }> = {
    pay: { label: "Em aberto", tone: "sky" },
    late_pay: { label: "Vencida", tone: "rose" },
    preparing: { label: "Em preparação", tone: "slate" },
    expired: { label: "Boleto expirado", tone: "amber" },
    paid: { label: "Paga", tone: "emerald" },
    cancelled: { label: "Cancelada", tone: "slate" },
};

/** "12345678901" → "***.456.789-**": enough for the tenant to recognise themself, useless to anyone else. */
export function maskCpf(cpf: string | null | undefined): string | null {
    const digits = (cpf ?? "").replace(/\D/g, "");
    if (digits.length !== 11) return null;
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export const firstNameOf = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";
