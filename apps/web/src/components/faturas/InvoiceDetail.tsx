"use client";

/**
 * One invoice: what it charges, who pays, the terms it states, how it stands and what happened to it.
 * The page preloads it; after a payment or a cancellation the parent hands the fresh one back.
 */
import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, FileText, Loader2, Receipt } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatCPF } from "@/lib/validators";
import { Money, Sensitive } from "@/components/privacy";
import { INVOICE_STATUS_META, PAID_VIA_LABELS, brl, invoiceDisplay, isOpen } from "@/lib/invoice-hub";
import { blockersText } from "@/lib/invoice-payer";
import { daysBetween, monthLabel } from "@/lib/invoice-schedule";
import type { InvoiceDetailView, InvoiceEventView } from "@/lib/invoice-views";

interface Props {
    invoiceId: string;
    lang: string;
    today: string;
    /** preloaded by the page, or handed back after an action */
    initial: InvoiceDetailView | null;
    notice: string | null;
    onBack: () => void;
    onPay: (detail: InvoiceDetailView) => void;
    onCancel: (detail: InvoiceDetailView) => void;
}

const EVENT_LABELS: Record<string, string> = {
    CREATED: "Fatura criada",
    PAID: "Pagamento registrado",
    CANCELLED: "Fatura cancelada",
    DUPLICATE_PAYMENT: "Pagamento recebido em duplicidade",
};
const ACTOR_LABELS: Record<string, string> = { OWNER: "por você", SYSTEM: "automático", TENANT: "pelo inquilino", INTER: "Banco Inter", STRIPE: "Stripe" };

const stamp = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function eventText(e: InvoiceEventView): string | null {
    const amount = typeof e.detail.amount === "number" ? e.detail.amount : null;
    if (e.type === "CANCELLED") return typeof e.detail.reason === "string" ? e.detail.reason : null;
    if (e.type === "PAID" || e.type === "DUPLICATE_PAYMENT") {
        const via = typeof e.detail.via === "string" ? PAID_VIA_LABELS[e.detail.via] ?? e.detail.via : null;
        return [amount !== null ? brl(amount) : null, via, typeof e.detail.paid_on === "string" ? `em ${formatDateBR(e.detail.paid_on)}` : null].filter(Boolean).join(" · ") || null;
    }
    return amount !== null ? brl(amount) : null;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
        </div>
    );
}

const undecided = <span className="text-muted-foreground">a decidir</span>;

export default function InvoiceDetail({ invoiceId, lang, today, initial, notice, onBack, onPay, onCancel }: Props) {
    const preloaded = initial && initial.invoice.id === invoiceId ? initial : null;
    const [fetched, setFetched] = useState<InvoiceDetailView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const detail = preloaded ?? (fetched && fetched.invoice.id === invoiceId ? fetched : null);

    useEffect(() => {
        if (preloaded) return;
        let alive = true;
        fetch(`/api/faturas/${invoiceId}`)
            .then(async res => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.error || "Erro ao carregar a fatura");
                if (alive) setFetched(json as InvoiceDetailView);
            })
            .catch(err => { if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar"); });
        return () => { alive = false; };
    }, [invoiceId, preloaded]);

    const back = (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ArrowLeft className="mr-1 h-4 w-4" /> Faturas
        </Button>
    );

    if (error && !detail) {
        return <div className="space-y-3">{back}<p className="text-sm text-rose-600">{error}</p></div>;
    }
    if (!detail) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando fatura…
            </div>
        );
    }

    const { invoice, events } = detail;
    const display = invoiceDisplay(invoice, today);
    const meta = INVOICE_STATUS_META[display];
    const open = isOpen(invoice.status);
    const place = [invoice.property_name, invoice.unit_name].filter(Boolean).join(" · ") || "Imóvel";
    const gap = daysBetween(today, invoice.due_date);
    const missing = open ? blockersText(invoice.blockers) : "";
    const address = invoice.payer_address;
    const addressLine = address
        ? [[address.street, address.number].filter(Boolean).join(", "), address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join("/"), address.cep ? `CEP ${address.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null].filter(Boolean).join(" · ")
        : null;
    const contratosHref = `${lang === "pt" ? "" : `/${lang}`}/contratos?id=${invoice.lease_id}`;

    return (
        <div className="space-y-5">
            <div className="space-y-3">
                {back}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
                            <Receipt className="h-6 w-6 text-emerald-600" /> Fatura nº {invoice.number}
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {place} · {invoice.tenant_name ? <Sensitive>{invoice.tenant_name}</Sensitive> : "sem inquilino"} · referência {monthLabel(invoice.reference_month)}
                        </p>
                    </div>
                    {open && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => onPay(detail)}>
                                <CheckCircle2 className="mr-1 h-4 w-4" /> Registrar pagamento
                            </Button>
                            <Button variant="outline" onClick={() => onCancel(detail)}>
                                <Ban className="mr-1 h-4 w-4" /> Cancelar
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {notice && (
                <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>
            )}
            {missing && (
                <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Falta para emitir o boleto e enviar o e-mail: {missing}. Complete o cadastro do inquilino; a fatura pode ser baixada manualmente mesmo assim.</span>
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="border-b border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground">Cobrança</header>
                    <div className="p-4">
                        <table className="w-full text-sm">
                            <tbody>
                                {invoice.items.map(item => (
                                    <tr key={item.id} className="border-b border-border/40">
                                        <td className="py-1.5 pr-2 text-foreground">{item.description}</td>
                                        <td className="py-1.5 text-right tabular-nums text-foreground"><Money>{brl(item.amount)}</Money></td>
                                    </tr>
                                ))}
                                <tr>
                                    <td className="pt-2 pr-2 font-semibold text-foreground">Total</td>
                                    <td className="pt-2 text-right text-lg font-bold tabular-nums text-foreground"><Money>{brl(invoice.amount)}</Money></td>
                                </tr>
                            </tbody>
                        </table>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                            <Field label="Vencimento">
                                {formatDateBR(invoice.due_date)}
                                {open && <span className={cn("ml-1.5 text-xs", gap < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{gap < 0 ? `vencida há ${plural(-gap, "dia", "dias")}` : gap === 0 ? "vence hoje" : `em ${plural(gap, "dia", "dias")}`}</span>}
                            </Field>
                            <Field label="Referência">{monthLabel(invoice.reference_month)}</Field>
                            <Field label="Multa por atraso">{invoice.fine_pct !== null ? pct(invoice.fine_pct) : undecided}</Field>
                            <Field label="Juros de mora">{invoice.interest_pct_month !== null ? `${pct(invoice.interest_pct_month)} ao mês` : undecided}</Field>
                            <Field label="Pagamento após o vencimento">{invoice.days_payable_after_due !== null ? plural(invoice.days_payable_after_due, "dia", "dias") : undecided}</Field>
                            <Field label="Origem">{invoice.origin === "AUTO" ? "Gerada automaticamente" : "Gerada por você"}</Field>
                            {invoice.status === "PAID" && (
                                <Field label="Pagamento" className="col-span-2">
                                    <Money>{brl(invoice.paid_amount ?? invoice.amount)}</Money> em {formatDateBR(invoice.paid_on)} · {invoice.paid_via ? PAID_VIA_LABELS[invoice.paid_via] ?? invoice.paid_via : "—"}
                                    {invoice.late_fee_amount > 0 && <span className="text-muted-foreground"> · <Money>{brl(invoice.late_fee_amount)}</Money> de multa e juros</span>}
                                </Field>
                            )}
                            {invoice.status === "CANCELLED" && (
                                <Field label="Cancelamento" className="col-span-2">
                                    {invoice.cancelled_at ? stamp(invoice.cancelled_at) : "—"}{invoice.cancel_reason ? ` · ${invoice.cancel_reason}` : ""}
                                </Field>
                            )}
                            {invoice.notes && <Field label="Observação" className="col-span-2"><span className="whitespace-pre-wrap text-muted-foreground">{invoice.notes}</span></Field>}
                        </dl>
                    </div>
                </section>

                <div className="space-y-5">
                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                            <span className="text-sm font-semibold text-foreground">Pagador</span>
                            <a href={contratosHref} className="inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
                                <FileText className="h-3.5 w-3.5" /> Abrir o contrato
                            </a>
                        </header>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                            <Field label="Nome"><Sensitive>{invoice.payer_name || invoice.tenant_name || "—"}</Sensitive></Field>
                            <Field label="CPF">{invoice.payer_cpf ? <Sensitive>{formatCPF(invoice.payer_cpf)}</Sensitive> : "—"}</Field>
                            <Field label="E-mail" className="col-span-2">{invoice.payer_email ? <Sensitive>{invoice.payer_email}</Sensitive> : <span className="text-amber-700 dark:text-amber-400">não informado</span>}</Field>
                            <Field label="Endereço" className="col-span-2">{addressLine ? <Sensitive>{addressLine}</Sensitive> : <span className="text-amber-700 dark:text-amber-400">incompleto</span>}</Field>
                        </dl>
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card">
                        <header className="border-b border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground">Histórico</header>
                        <ol className="divide-y divide-border/50">
                            {events.map(e => {
                                const text = eventText(e);
                                return (
                                    <li key={e.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.type === "PAID" ? "bg-emerald-500" : e.type === "CANCELLED" ? "bg-amber-500" : e.type === "DUPLICATE_PAYMENT" ? "bg-rose-500" : "bg-slate-400")} />
                                        <span className="min-w-0 flex-1">
                                            <span className="font-medium text-foreground">{EVENT_LABELS[e.type] ?? e.type}</span>
                                            {text && <span className="text-muted-foreground"> — {e.type === "CANCELLED" ? text : <Money>{text}</Money>}</span>}
                                            <span className="block text-[11px] text-muted-foreground">{stamp(e.created_at)} · {ACTOR_LABELS[e.actor] ?? e.actor}</span>
                                        </span>
                                    </li>
                                );
                            })}
                            {events.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Sem registros.</li>}
                        </ol>
                    </section>
                </div>
            </div>
        </div>
    );
}
