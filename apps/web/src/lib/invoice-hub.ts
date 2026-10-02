/**
 * The maths behind the Fatura hub: what an invoice's state reads as, the views, one row per invoice,
 * the totals of the KPI strip and the attention list. Pure functions; the components only render.
 *
 * Only four states are stored (DRAFT, ISSUED, PAID, CANCELLED). "Em atraso" is read from the due date
 * every time, so it is never stale; an invoice that cannot be issued yet says what is missing.
 */
import { brl } from "@/lib/lease-dashboard";
import { normalizeText } from "@/lib/lease-extract";
import { billableTotal } from "@/lib/invoice-collection";
import { blockersText } from "@/lib/invoice-payer";
import { daysBetween, dueDateIn, monthLabel, chargeable } from "@/lib/invoice-schedule";
import type { BillingSettingsView, InvoiceStatus, InvoiceView, RecurringLease } from "@/lib/invoice-views";
import { connectionAttention, type ConnectionsView } from "@/lib/billing/connections";

export { brl };

// ── Status ───────────────────────────────────────────────────────────

export type InvoiceDisplay = "a_emitir" | "emitida" | "em_atraso" | "paga" | "cancelada";

export interface InvoiceStatusMeta { label: string; pill: string }

export const INVOICE_STATUS_META: Record<InvoiceDisplay, InvoiceStatusMeta> = {
    a_emitir: { label: "A emitir", pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    emitida: { label: "Emitida", pill: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
    em_atraso: { label: "Em atraso", pill: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300" },
    paga: { label: "Paga", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    cancelada: { label: "Cancelada", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
};

/** Still waiting for the money. */
export const isOpen = (status: InvoiceStatus) => status === "DRAFT" || status === "ISSUED";

export function invoiceDisplay(invoice: Pick<InvoiceView, "status" | "due_date">, today: string): InvoiceDisplay {
    if (invoice.status === "PAID") return "paga";
    if (invoice.status === "CANCELLED") return "cancelada";
    if (invoice.due_date < today) return "em_atraso";
    return invoice.status === "ISSUED" ? "emitida" : "a_emitir";
}

export const PAID_VIA_LABELS: Record<string, string> = { BOLETO: "Boleto", PIX: "PIX", CARD: "Cartão", MANUAL: "Baixa manual" };

// ── Views ────────────────────────────────────────────────────────────

export type InvoiceViewKey = "abertas" | "atraso" | "pagas" | "todas";
export const DEFAULT_INVOICE_VIEW: InvoiceViewKey = "abertas";
export const INVOICE_VIEWS: Array<{ key: InvoiceViewKey; label: string; empty: string }> = [
    { key: "abertas", label: "Abertas", empty: "Nenhuma fatura em aberto." },
    { key: "atraso", label: "Em atraso", empty: "Nenhuma fatura em atraso." },
    { key: "pagas", label: "Pagas", empty: "Nenhuma fatura paga ainda." },
    { key: "todas", label: "Todas", empty: "Nenhuma fatura gerada ainda." },
];
export const invoiceViewFromParam = (v: string | null): InvoiceViewKey => (INVOICE_VIEWS.some(x => x.key === v) ? (v as InvoiceViewKey) : DEFAULT_INVOICE_VIEW);

export function inInvoiceView(row: Pick<InvoiceRow, "display" | "invoice">, view: InvoiceViewKey): boolean {
    switch (view) {
        case "abertas": return isOpen(row.invoice.status);
        case "atraso": return row.display === "em_atraso";
        case "pagas": return row.invoice.status === "PAID";
        default: return true;
    }
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface InvoiceRow {
    invoice: InvoiceView;
    display: InvoiceDisplay;
    /** "SANTO ANTONIO · Kitnet 35C" */
    place: string;
    /** "Aluguel + Condomínio" */
    itemsLabel: string;
    /** days past the due date while unpaid; 0 otherwise */
    daysLate: number;
    /** days until the due date while unpaid and not late; null otherwise */
    daysToDue: number | null;
    /** `YYYY-MM` */
    month: string;
    haystack: string;
}

export function invoiceRows(invoices: readonly InvoiceView[], today: string): InvoiceRow[] {
    return invoices.map(invoice => {
        const display = invoiceDisplay(invoice, today);
        const open = isOpen(invoice.status);
        const gap = daysBetween(today, invoice.due_date);
        const place = [invoice.property_name, invoice.unit_name].filter(Boolean).join(" · ") || "Imóvel";
        const itemsLabel = invoice.items.map(i => i.description).join(" + ");
        return {
            invoice,
            display,
            place,
            itemsLabel,
            daysLate: open && gap < 0 ? -gap : 0,
            daysToDue: open && gap >= 0 ? gap : null,
            month: invoice.reference_month.slice(0, 7),
            haystack: normalizeText([`fatura ${invoice.number}`, place, invoice.tenant_name, invoice.payer_name, invoice.lease_reference, itemsLabel].filter(Boolean).join(" ")),
        };
    });
}

// ── Recurring charges ────────────────────────────────────────────────

export interface RecurringRow {
    lease: RecurringLease;
    /** what the owner collects every month on this lease (0 when nothing) */
    monthly: number;
    /** rent or condominium nobody decided who collects (a lease brokered by a corretor) */
    undecided: number;
    /** `YYYY-MM-DD` of this month's due date */
    dueThisMonth: string;
    /** the lease is charged this month (in force, started, not terminated before the due date, not paused) */
    chargedThisMonth: boolean;
    /** the lease already has a live invoice for this month */
    invoicedThisMonth: boolean;
}

export function recurringRows(recurring: readonly RecurringLease[], invoices: readonly InvoiceView[], today: string): RecurringRow[] {
    const month = today.slice(0, 7);
    const invoiced = new Set(invoices.filter(i => i.status !== "CANCELLED" && i.reference_month.slice(0, 7) === month).map(i => i.lease_id));
    return recurring.map(lease => {
        const monthly = billableTotal(lease.components);
        const dueThisMonth = dueDateIn(month, lease.due_day);
        const schedule = { status: lease.status, start_date: lease.start_date, termination_date: lease.termination_date, rent_due_day: lease.due_day };
        return {
            lease,
            monthly,
            undecided: lease.components.filter(c => c.undecided).length,
            dueThisMonth,
            chargedThisMonth: monthly > 0 && !lease.paused && chargeable(schedule, dueThisMonth) === null,
            invoicedThisMonth: invoiced.has(lease.lease_id),
        };
    });
}

// ── Totals ───────────────────────────────────────────────────────────

export interface InvoiceHubTotals {
    /** open invoices falling due this month: how many and how much */
    dueThisMonth: { count: number; amount: number };
    /** paid this month (by payment date): how many and how much came in */
    receivedThisMonth: { count: number; amount: number };
    overdue: { count: number; amount: number };
    /** leases the owner collects something on, and what that adds up to every month */
    recurring: { leases: number; monthly: number };
    /** of those, charged this month and still without an invoice */
    toGenerate: number;
    /** open invoices that cannot be issued yet (payer data missing) */
    blocked: number;
}

export function invoiceHubTotals(rows: readonly InvoiceRow[], recurring: readonly RecurringRow[], today: string): InvoiceHubTotals {
    const month = today.slice(0, 7);
    const sum = (list: readonly InvoiceRow[], pick: (r: InvoiceRow) => number) => Math.round(list.reduce((s, r) => s + pick(r), 0) * 100) / 100;
    const due = rows.filter(r => isOpen(r.invoice.status) && r.month === month);
    const received = rows.filter(r => r.invoice.status === "PAID" && (r.invoice.paid_on ?? "").slice(0, 7) === month);
    const overdue = rows.filter(r => r.display === "em_atraso");
    const collecting = recurring.filter(r => r.monthly > 0);
    return {
        dueThisMonth: { count: due.length, amount: sum(due, r => r.invoice.amount) },
        receivedThisMonth: { count: received.length, amount: sum(received, r => r.invoice.paid_amount ?? r.invoice.amount) },
        overdue: { count: overdue.length, amount: sum(overdue, r => r.invoice.amount) },
        recurring: { leases: collecting.length, monthly: Math.round(collecting.reduce((s, r) => s + r.monthly, 0) * 100) / 100 },
        toGenerate: recurring.filter(r => r.chargedThisMonth && !r.invoicedThisMonth).length,
        blocked: rows.filter(r => isOpen(r.invoice.status) && r.invoice.blockers.length > 0).length,
    };
}

// ── Attention ────────────────────────────────────────────────────────

export type InvoiceAttentionKind = "overdue" | "blocked" | "to_generate" | "undecided" | "settings" | "connection";
export type AttentionTone = "rose" | "amber" | "slate";

export interface InvoiceAttentionItem {
    kind: InvoiceAttentionKind;
    tone: AttentionTone;
    /** what the sentence is about: an invoice, a lease, or the settings */
    subject: string;
    text: string;
    /** the sentence states an amount (the dollar toggle blurs it) */
    money?: boolean;
    /** where the item leads */
    target: { type: "invoice"; id: string } | { type: "recurring" } | { type: "settings" } | { type: "connections" };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** The decisions an owner has to make before an invoice can state its late terms. */
export const settingsPending = (s: BillingSettingsView): string[] => [
    s.fine_pct === null ? "multa por atraso" : null,
    s.interest_pct_month === null ? "juros de mora" : null,
    s.days_payable_after_due === null ? "prazo de pagamento após o vencimento" : null,
    s.days_in_advance === null ? "antecedência da emissão" : null,
].filter((v): v is string => v !== null);

/** Most urgent first: late money, a bank connection that stopped working, what cannot be issued, then what is still to do or to decide. */
export function invoiceAttention(rows: readonly InvoiceRow[], recurring: readonly RecurringRow[], settings: BillingSettingsView, today: string, connections?: ConnectionsView): InvoiceAttentionItem[] {
    const items: InvoiceAttentionItem[] = [];
    const collects = recurring.some(r => r.monthly > 0);
    const bank = connections ? connectionAttention(connections, today, collects) : [];
    const bankItem = (c: (typeof bank)[number]): InvoiceAttentionItem => ({ kind: "connection", tone: c.tone, subject: "Banco Inter", text: c.text, target: { type: "connections" } });

    for (const r of [...rows].filter(x => x.display === "em_atraso").sort((a, b) => b.daysLate - a.daysLate)) {
        items.push({
            kind: "overdue", tone: "rose", subject: `Fatura nº ${r.invoice.number} · ${r.place}`,
            text: `${brl(r.invoice.amount)} vencida há ${plural(r.daysLate, "dia", "dias")}`, money: true,
            target: { type: "invoice", id: r.invoice.id },
        });
    }
    // a connection that fails or a certificate about to expire stops every invoice: right after the late money
    for (const c of bank.filter(x => x.tone !== "slate")) items.push(bankItem(c));
    for (const r of rows.filter(x => isOpen(x.invoice.status) && x.invoice.blockers.length > 0)) {
        items.push({
            kind: "blocked", tone: "amber", subject: `Fatura nº ${r.invoice.number} · ${r.place}`,
            text: `não pode ser emitida: ${blockersText(r.invoice.blockers) || "dados do pagador incompletos"}`,
            target: { type: "invoice", id: r.invoice.id },
        });
    }
    for (const r of recurring.filter(x => x.chargedThisMonth && !x.invoicedThisMonth)) {
        items.push({
            kind: "to_generate", tone: "amber", subject: r.lease.title,
            text: `fatura de ${monthLabel(today)} ainda não gerada (${brl(r.monthly)}, vence dia ${Number(r.dueThisMonth.slice(8, 10))})`, money: true,
            target: { type: "recurring" },
        });
    }
    for (const r of recurring.filter(x => x.undecided > 0)) {
        items.push({
            kind: "undecided", tone: "slate", subject: r.lease.title,
            text: "contrato com corretor: informe quem cobra o aluguel e o condomínio",
            target: { type: "recurring" },
        });
    }
    for (const c of bank.filter(x => x.tone === "slate")) items.push(bankItem(c));
    const pending = settingsPending(settings);
    if (pending.length > 0 && collects) {
        items.push({
            kind: "settings", tone: "slate", subject: "Configuração",
            text: `a decidir: ${pending.join(", ")}`,
            target: { type: "settings" },
        });
    }
    return items;
}
