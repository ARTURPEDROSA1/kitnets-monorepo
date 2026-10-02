/**
 * The invoice as the tenant sees it (app/[lang]/pagar/[token]): the least that identifies it — first
 * name, masked CPF, the place — and every way to pay it: the Pix QR code and copia e cola, the boleto's
 * digitable line and PDF. A server component; the page loads the invoice and makes the QR code.
 */
import React from "react";
import { AlertCircle, CheckCircle2, Clock, FileDown, Receipt } from "lucide-react";
import { formatDateBR } from "@/lib/dates";
import { monthLabel } from "@/lib/invoice-schedule";
import { PUBLIC_STATE_META, publicInvoiceState, type PublicInvoice, type PublicInvoiceState } from "@/lib/billing/public-invoice";
import CopyCode from "./CopyCode";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const TONES: Record<(typeof PUBLIC_STATE_META)[PublicInvoiceState]["tone"], string> = {
    sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    slate: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    rose: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
};

/** "2026-10-20" + 30 → "19/11/2026" */
function plusDays(iso: string, days: number): string {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return formatDateBR(d.toISOString().slice(0, 10));
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto w-full max-w-2xl space-y-5 px-2 py-6 sm:py-10">{children}</div>;
}

function Notice({ tone, icon, children }: { tone: "amber" | "emerald" | "slate" | "rose"; icon: React.ReactNode; children: React.ReactNode }) {
    const styles = {
        amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200",
        emerald: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
        slate: "border-border bg-muted/40 text-foreground",
        rose: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    }[tone];
    return <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>{icon}<span className="flex-1">{children}</span></div>;
}

export function PublicInvoiceNotFound({ reason }: { reason: "missing" | "limited" }) {
    return (
        <Shell>
            <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
                <Receipt className="mx-auto h-10 w-10 text-muted-foreground" />
                <h1 className="mt-3 text-xl font-bold text-foreground">{reason === "limited" ? "Muitas tentativas" : "Fatura não encontrada"}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {reason === "limited" ? "Aguarde alguns minutos e abra o link de novo." : "Este link não leva a nenhuma fatura. Confira o endereço no e-mail que você recebeu ou peça um novo ao proprietário."}
                </p>
            </div>
        </Shell>
    );
}

interface Props {
    invoice: PublicInvoice;
    /** the Pix QR code as inline SVG (made by the page from the copia e cola); null when there is nothing to pay */
    qrSvg: string | null;
    /** where the boleto's PDF is served */
    pdfHref: string;
    /** `YYYY-MM-DD` in Brasília */
    today: string;
}

export default function PublicInvoiceView({ invoice, qrSvg, pdfHref, today }: Props) {
    const state = publicInvoiceState(invoice, today);
    const meta = PUBLIC_STATE_META[state];
    const charge = invoice.charge;
    const payable = (state === "pay" || state === "late_pay") && charge !== null;
    const greeting = invoice.payer_first_name ? `Olá, ${invoice.payer_first_name}.` : "Olá.";
    const terms = [invoice.fine_pct !== null ? `multa de ${pct(invoice.fine_pct)}` : null, invoice.interest_pct_month !== null ? `juros de ${pct(invoice.interest_pct_month)} ao mês` : null].filter(Boolean).join(" e ");
    const payableUntil = invoice.days_payable_after_due !== null && charge?.due_date ? plusDays(charge.due_date, invoice.days_payable_after_due) : null;

    return (
        <Shell>
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Fatura de {invoice.sender_name}</p>
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
                    <Receipt className="h-6 w-6 text-emerald-600" /> Fatura nº {invoice.number}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONES[meta.tone]}`}>{meta.label}</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                    {greeting} Referente a {monthLabel(invoice.reference_month)} · {invoice.place}{invoice.payer_cpf_masked ? ` · CPF ${invoice.payer_cpf_masked}` : ""}
                </p>
            </header>

            {state === "paid" && (
                <Notice tone="emerald" icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}>
                    Pagamento recebido{invoice.paid ? ` em ${formatDateBR(invoice.paid.on)}` : ""}. Obrigado!
                </Notice>
            )}
            {state === "cancelled" && <Notice tone="slate" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}>Esta fatura foi cancelada pelo proprietário. Nada a pagar por aqui.</Notice>}
            {state === "preparing" && <Notice tone="slate" icon={<Clock className="mt-0.5 h-4 w-4 shrink-0" />}>O boleto e o PIX desta fatura ainda estão sendo preparados. Abra o link de novo daqui a alguns minutos.</Notice>}
            {state === "expired" && <Notice tone="amber" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}>Este boleto deixou de aceitar pagamento. Peça ao proprietário uma nova fatura.</Notice>}
            {state === "late_pay" && (
                <Notice tone="rose" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}>
                    Vencida em {formatDateBR(invoice.due_date)}. O boleto e o PIX ainda aceitam o pagamento{payableUntil ? ` até ${payableUntil}` : ""}{terms ? `, com ${terms} calculados pelo banco` : ""}.
                </Notice>
            )}

            <section className="rounded-2xl border border-border/80 bg-card">
                <div className="p-5">
                    <table className="w-full text-sm">
                        <tbody>
                            {invoice.items.map((item, i) => (
                                <tr key={i} className="border-b border-border/40">
                                    <td className="py-2 pr-2 text-foreground">{item.description}</td>
                                    <td className="py-2 text-right tabular-nums text-foreground">{brl(item.amount)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td className="pt-3 font-semibold text-foreground">Total</td>
                                <td className="pt-3 text-right text-xl font-bold tabular-nums text-foreground">{brl(invoice.amount)}</td>
                            </tr>
                            <tr>
                                <td className="pt-1 text-xs text-muted-foreground">Vencimento</td>
                                <td className="pt-1 text-right text-xs text-muted-foreground">{formatDateBR(invoice.due_date)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {payable && (
                <section className="rounded-2xl border border-border/80 bg-card">
                    <header className="border-b border-border/60 px-5 py-3 text-sm font-semibold text-foreground">Como pagar</header>
                    <div className="space-y-5 p-5">
                        {qrSvg && charge.pix_copy_paste && (
                            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                                <div className="w-44 shrink-0 rounded-xl border border-border/70 bg-white p-2" aria-label="QR code do PIX" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <p className="text-sm text-foreground"><strong>PIX:</strong> leia o QR code no aplicativo do seu banco, ou copie o código abaixo e cole em &ldquo;Pix copia e cola&rdquo;. O pagamento é confirmado na hora.</p>
                                    <CopyCode label="PIX copia e cola" value={charge.pix_copy_paste} />
                                </div>
                            </div>
                        )}
                        {charge.digitable_line && (
                            <div className="space-y-2">
                                <p className="text-sm text-foreground"><strong>Boleto:</strong> pague pela linha digitável em qualquer banco ou lotérica{charge.has_pdf ? ", ou baixe o PDF" : ""}. A compensação leva até 3 dias úteis.</p>
                                <CopyCode label="Linha digitável" value={charge.digitable_line} />
                                {charge.has_pdf && (
                                    <a href={pdfHref} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50" rel="noreferrer">
                                        <FileDown className="h-4 w-4" /> Boleto em PDF
                                    </a>
                                )}
                            </div>
                        )}
                        {terms && state === "pay" && (
                            <p className="text-xs text-muted-foreground">Após o vencimento: {terms} (pro rata){payableUntil ? `; aceito até ${payableUntil}` : ""}.</p>
                        )}
                    </div>
                </section>
            )}

            <p className="text-center text-xs text-muted-foreground">
                Cobrança emitida por {invoice.sender_name} através do Kitnets. Dúvidas sobre a fatura? Responda ao e-mail em que recebeu este link.
            </p>
        </Shell>
    );
}
