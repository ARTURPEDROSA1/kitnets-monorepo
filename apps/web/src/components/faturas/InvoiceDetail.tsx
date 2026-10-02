"use client";

/**
 * One invoice: what it charges, who pays, the terms it states, how it stands and what happened to it —
 * and, once issued at the bank, how the tenant pays it (the boleto's digitable line, the Pix code, the
 * PDF). The page preloads it; every action here answers with the fresh invoice, handed up to the parent.
 */
import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Ban, Check, CheckCircle2, Copy, FileDown, FileText, FlaskConical, Landmark, Loader2, Mail, Receipt, RefreshCw, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { formatCPF } from "@/lib/validators";
import { Money, Sensitive } from "@/components/privacy";
import { DateInput } from "@/components/ui/DateInput";
import { Label } from "@/components/ui/label";
import { INVOICE_STATUS_META, PAID_VIA_LABELS, brl, hasLiveCharge, invoiceDisplay, isOpen } from "@/lib/invoice-hub";
import { blockersText } from "@/lib/invoice-payer";
import { daysBetween, monthLabel } from "@/lib/invoice-schedule";
import { CHARGE_STATUS_LABELS } from "@/lib/billing/inter-payload";
import type { InvoiceDetailView, InvoiceEventView } from "@/lib/invoice-views";

interface Props {
    invoiceId: string;
    lang: string;
    today: string;
    /** preloaded by the page, or handed back after an action */
    initial: InvoiceDetailView | null;
    notice: string | null;
    /** the owner's bank connection can issue (connected, certificate in date) */
    bankUsable: boolean;
    /** the connection is the bank's sandbox and this site allows it: payments can be simulated */
    sandbox: boolean;
    /** the server can e-mail tenants */
    emailAvailable?: boolean;
    onBack: () => void;
    onPay: (detail: InvoiceDetailView) => void;
    onCancel: (detail: InvoiceDetailView) => void;
    /** an action here changed the invoice */
    onChanged: (detail: InvoiceDetailView, message: string | null) => void;
}

const EVENT_LABELS: Record<string, string> = {
    CREATED: "Fatura criada",
    ISSUED: "Boleto e PIX emitidos no banco",
    ISSUE_FAILED: "A emissão no banco falhou",
    CHARGE_OPEN: "Boleto pronto no banco",
    CHARGE_PAID: "Pagamento confirmado pelo banco",
    CHARGE_EXPIRED: "O boleto expirou",
    CHARGE_CANCELLED: "Boleto cancelado no banco",
    WEBHOOK: "Aviso do banco recebido",
    DUE_DATE_MOVED: "Vencimento alterado",
    EMAIL_SENT: "E-mail enviado ao inquilino",
    EMAIL_FAILED: "O e-mail ao inquilino não foi enviado",
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
    if (e.type === "CANCELLED" || e.type === "ISSUE_FAILED" || e.type === "EMAIL_FAILED") return typeof e.detail.reason === "string" ? e.detail.reason : typeof e.detail.error === "string" ? e.detail.error : null;
    if (e.type === "EMAIL_SENT") return e.detail.kind === "RESEND" ? "reenvio" : e.detail.kind === "REMINDER" ? "lembrete" : null;
    if (e.type === "DUE_DATE_MOVED") return typeof e.detail.from === "string" && typeof e.detail.to === "string" ? `de ${formatDateBR(e.detail.from)} para ${formatDateBR(e.detail.to)}` : null;
    if (e.type === "WEBHOOK") return typeof e.detail.situacao === "string" ? e.detail.situacao : null;
    if (e.type === "PAID" || e.type === "DUPLICATE_PAYMENT" || e.type === "CHARGE_PAID") {
        const via = typeof e.detail.via === "string" ? PAID_VIA_LABELS[e.detail.via] ?? e.detail.via : null;
        return [amount !== null ? brl(amount) : null, via, typeof e.detail.paid_on === "string" ? `em ${formatDateBR(e.detail.paid_on)}` : null].filter(Boolean).join(" · ") || null;
    }
    return amount !== null ? brl(amount) : null;
}
const MONEY_EVENTS = new Set(["CREATED", "PAID", "DUPLICATE_PAYMENT", "CHARGE_PAID", "ISSUED"]);

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
        </div>
    );
}

/** A code the tenant pays with, and a button that copies it. */
function CopyField({ label, value, hint }: { label: string; value: string; hint: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // the browser refused the clipboard: the text is selectable anyway
        }
    };
    return (
        <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 flex items-start gap-2">
                <Sensitive className="min-w-0 flex-1 break-all rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground">{value}</Sensitive>
                <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground" title={hint}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "copiado" : "copiar"}
                </button>
            </dd>
        </div>
    );
}

const undecided = <span className="text-muted-foreground">a decidir</span>;

async function post(url: string, body?: Record<string, unknown>): Promise<{ detail?: InvoiceDetailView; error?: string }> {
    try {
        const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { error: typeof json.error === "string" ? json.error : json.errors ? Object.values(json.errors as Record<string, string>).join(" ") : "Não foi possível concluir." };
        return { detail: json as InvoiceDetailView };
    } catch {
        return { error: "Erro de conexão. Tente novamente." };
    }
}

const DELIVERY_KIND_LABELS: Record<string, string> = { ISSUE: "fatura", REMINDER: "lembrete", RECEIPT: "recibo", RESEND: "reenvio" };

export default function InvoiceDetail({ invoiceId, lang, today, initial, notice, bankUsable, sandbox, emailAvailable = true, onBack, onPay, onCancel, onChanged }: Props) {
    const preloaded = initial && initial.invoice.id === invoiceId ? initial : null;
    const [fetched, setFetched] = useState<InvoiceDetailView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"issue" | "refresh" | "pdf" | "sandbox" | "email" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [issueModal, setIssueModal] = useState<{ dueDate: string } | null>(null);
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

    const run = async (kind: "issue" | "refresh" | "sandbox", url: string, body: Record<string, unknown> | undefined, message: string | null) => {
        setBusy(kind);
        setActionError(null);
        const out = await post(url, body);
        setBusy(null);
        if (out.detail) {
            setIssueModal(null);
            onChanged(out.detail, message);
        } else setActionError(out.error ?? null);
    };
    const resend = async () => {
        setBusy("email");
        setActionError(null);
        try {
            const res = await fetch(`/api/faturas/${invoiceId}/reenviar`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Não foi possível enviar o e-mail.");
            const email = (json.email ?? {}) as { sent?: boolean; error?: string | null };
            onChanged(json as InvoiceDetailView, email.sent ? "E-mail enviado ao inquilino." : null);
            if (!email.sent) setActionError(`O e-mail não foi enviado: ${email.error ?? "motivo não informado"}.`);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
        } finally {
            setBusy(null);
        }
    };
    const openPdf = async () => {
        setBusy("pdf");
        setActionError(null);
        try {
            const res = await fetch(`/api/faturas/${invoiceId}/pdf`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.url) throw new Error(json.error || "PDF indisponível.");
            window.open(json.url as string, "_blank", "noopener");
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "PDF indisponível.");
        } finally {
            setBusy(null);
        }
    };

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
    const charge = invoice.charge ?? null;
    const delivery = invoice.delivery ?? null;
    const deliveries = detail.deliveries ?? [];
    const display = invoiceDisplay(invoice, today);
    const meta = INVOICE_STATUS_META[display];
    const open = isOpen(invoice.status);
    const live = hasLiveCharge(invoice);
    const place = [invoice.property_name, invoice.unit_name].filter(Boolean).join(" · ") || "Imóvel";
    const gap = daysBetween(today, invoice.due_date);
    const missing = open ? blockersText(invoice.blockers) : "";
    const address = invoice.payer_address;
    const addressLine = address
        ? [[address.street, address.number].filter(Boolean).join(", "), address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join("/"), address.cep ? `CEP ${address.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null].filter(Boolean).join(" · ")
        : null;
    const contratosHref = `${lang === "pt" ? "" : `/${lang}`}/contratos?id=${invoice.lease_id}`;
    const termsUndecided = invoice.fine_pct === null || invoice.interest_pct_month === null || invoice.days_payable_after_due === null;
    const cannotIssue = !bankUsable ? "Conecte o Banco Inter em Conexões para emitir" : termsUndecided ? "Defina multa, juros e prazo em Configuração antes de emitir" : null;

    const startIssue = () => {
        if (invoice.due_date < today) setIssueModal({ dueDate: today });
        else void run("issue", `/api/faturas/${invoiceId}/emitir`, {}, "Boleto e PIX emitidos no banco.");
    };

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
                            {!live && (
                                <Button onClick={startIssue} disabled={busy !== null || Boolean(cannotIssue)} title={cannotIssue ?? "Emite o boleto com QR code PIX pela sua conta no Banco Inter"}>
                                    {busy === "issue" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Landmark className="mr-1 h-4 w-4" />} {charge ? "Emitir de novo" : "Emitir boleto e PIX"}
                                </Button>
                            )}
                            {live && (
                                <Button variant="outline" onClick={() => void run("refresh", `/api/faturas/${invoiceId}/atualizar`, undefined, null)} disabled={busy !== null} title="Consulta o banco: pagamento, expiração, cancelamento">
                                    {busy === "refresh" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar status
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => onPay(detail)} disabled={busy !== null} title="Pagamento recebido por fora (transferência, dinheiro)">
                                <CheckCircle2 className="mr-1 h-4 w-4" /> Registrar pagamento
                            </Button>
                            <Button variant="outline" onClick={() => onCancel(detail)} disabled={busy !== null}>
                                <Ban className="mr-1 h-4 w-4" /> Cancelar
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {notice && (
                <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>
            )}
            {actionError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{actionError}</span>
                    <button type="button" onClick={() => setActionError(null)} className="rounded p-0.5" aria-label="Fechar"><X className="h-4 w-4" /></button>
                </div>
            )}
            {missing && (
                <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Falta para o boleto e o e-mail: {missing}. Complete o cadastro do inquilino; a fatura pode ser baixada manualmente mesmo assim.</span>
                </div>
            )}

            {charge && (
                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Landmark className="h-4 w-4 text-orange-500" /> Boleto e PIX
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", charge.status === "OPEN" ? "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" : charge.status === "PAID" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : charge.status === "REQUESTED" ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}>
                                {CHARGE_STATUS_LABELS[charge.status]}
                            </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {charge.last_checked_at ? `conferido no banco em ${stamp(charge.last_checked_at)}` : "ainda não conferido no banco"}
                        </span>
                    </header>
                    <div className="space-y-3 p-4">
                        {charge.status === "REQUESTED" && <p className="text-sm text-muted-foreground">O banco ainda está gerando o boleto. Clique em &ldquo;Atualizar status&rdquo; daqui a instantes.</p>}
                        {charge.status === "EXPIRED" && <p className="text-sm text-amber-700 dark:text-amber-400">Este boleto deixou de aceitar pagamento. Emita de novo com uma nova data de vencimento.</p>}
                        {charge.status === "FAILED" && charge.last_error && <p role="alert" className="text-sm text-rose-600">{charge.last_error}</p>}
                        {charge.last_error && charge.status !== "FAILED" && <p className="text-xs text-rose-600">Última consulta ao banco falhou: {charge.last_error}</p>}
                        {(charge.digitable_line || charge.pix_copy_paste) && (
                            <dl className="grid gap-3 lg:grid-cols-2">
                                {charge.digitable_line && <CopyField label="Linha digitável do boleto" value={charge.digitable_line} hint="Copiar a linha digitável" />}
                                {charge.pix_copy_paste && <CopyField label="PIX copia e cola" value={charge.pix_copy_paste} hint="Copiar o código PIX" />}
                            </dl>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            {charge.has_pdf && (
                                <Button variant="outline" size="sm" onClick={openPdf} disabled={busy !== null}>
                                    {busy === "pdf" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} Boleto em PDF
                                </Button>
                            )}
                            {sandbox && live && (
                                <Button variant="outline" size="sm" onClick={() => void run("sandbox", `/api/faturas/${invoiceId}/pagar-sandbox`, { via: "PIX" }, "Pagamento simulado no sandbox do banco.")} disabled={busy !== null} title="Só no ambiente de testes do banco">
                                    {busy === "sandbox" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1 h-4 w-4" />} Simular pagamento
                                </Button>
                            )}
                            {charge.due_date && <span className="text-xs text-muted-foreground">vencimento no banco: {formatDateBR(charge.due_date)}{charge.paid_via ? ` · pago por ${PAID_VIA_LABELS[charge.paid_via] ?? charge.paid_via}` : ""}</span>}
                        </div>
                    </div>
                </section>
            )}

            {(charge || delivery) && (
                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><Mail className="h-4 w-4 text-sky-600" /> E-mail ao inquilino</span>
                        {open && charge?.status === "OPEN" && (
                            <Button variant="outline" size="sm" onClick={resend} disabled={busy !== null || !emailAvailable} title={emailAvailable ? "Envia de novo o boleto, o PIX e o link da fatura" : "Envio de e-mail não configurado neste servidor"}>
                                {busy === "email" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />} {deliveries.some(d => d.status === "SENT") ? "Reenviar e-mail" : "Enviar e-mail"}
                            </Button>
                        )}
                    </header>
                    <div className="space-y-3 p-4">
                        {!delivery && <p className="text-sm text-muted-foreground">{charge?.status === "OPEN" ? "Ainda não enviado." : "Enviado assim que o banco deixar o boleto pronto."}</p>}
                        {delivery?.status === "SENT" && delivery.sent_at && (
                            <p className="text-sm text-foreground">Enviado em {stamp(delivery.sent_at)} para <Sensitive>{delivery.recipient}</Sensitive>{delivery.kind !== "ISSUE" ? ` (${DELIVERY_KIND_LABELS[delivery.kind] ?? delivery.kind})` : ""}.</p>
                        )}
                        {(delivery?.status === "FAILED" || delivery?.status === "BOUNCED") && (
                            <p role="alert" className="text-sm text-rose-600">Não enviado: {delivery.last_error ?? "motivo não informado"}.{delivery.attempts > 1 ? ` (${plural(delivery.attempts, "tentativa", "tentativas")})` : ""}</p>
                        )}
                        {(delivery?.status === "PENDING" || delivery?.status === "SENDING") && <p className="text-sm text-muted-foreground">Em envio…</p>}
                        {deliveries.filter(d => d.status === "SENT").length > 1 && (
                            <p className="text-xs text-muted-foreground">{plural(deliveries.filter(d => d.status === "SENT").length, "e-mail enviado", "e-mails enviados")} ao todo.</p>
                        )}
                        <dl><CopyField label="Link da fatura para o inquilino" value={invoice.public_url} hint="Copiar o link (serve para mandar por WhatsApp)" /></dl>
                    </div>
                </section>
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
                                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.type === "PAID" || e.type === "CHARGE_PAID" ? "bg-emerald-500" : e.type === "CANCELLED" || e.type === "CHARGE_EXPIRED" || e.type === "CHARGE_CANCELLED" ? "bg-amber-500" : e.type === "DUPLICATE_PAYMENT" || e.type === "ISSUE_FAILED" ? "bg-rose-500" : e.type === "ISSUED" || e.type === "CHARGE_OPEN" ? "bg-sky-500" : "bg-slate-400")} />
                                        <span className="min-w-0 flex-1">
                                            <span className="font-medium text-foreground">{EVENT_LABELS[e.type] ?? e.type}</span>
                                            {text && <span className="text-muted-foreground"> — {MONEY_EVENTS.has(e.type) ? <Money>{text}</Money> : text}</span>}
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

            {issueModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Emitir com nova data de vencimento">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => busy === null && setIssueModal(null)} />
                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <button type="button" onClick={() => setIssueModal(null)} disabled={busy !== null} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-foreground"><Landmark className="h-5 w-5 text-orange-500" /> Nova data de vencimento</h2>
                        <p className="mb-4 text-sm text-muted-foreground">
                            O vencimento desta fatura ({formatDateBR(invoice.due_date)}) já passou e o banco não emite boleto com data passada. Escolha a nova data: a fatura passa a vencer nela, sem multa ou juros pelo atraso anterior.
                        </p>
                        <Label className="text-xs">Vencimento</Label>
                        <DateInput value={issueModal.dueDate} onChange={iso => setIssueModal({ dueDate: iso })} className="h-9 text-sm" wrapperClassName="mt-1 w-44" />
                        <div className="mt-5 flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setIssueModal(null)} disabled={busy !== null}>Voltar</Button>
                            <Button className="flex-1" onClick={() => void run("issue", `/api/faturas/${invoiceId}/emitir`, { due_date: issueModal.dueDate }, "Boleto e PIX emitidos no banco.")} disabled={busy !== null || !issueModal.dueDate || issueModal.dueDate < today}>
                                {busy === "issue" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Emitindo…</> : "Emitir"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
