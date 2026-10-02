"use client";

/**
 * The two things the owner does to an open invoice by hand: record a payment received outside the
 * module (baixa manual) and cancel it. Both answer with the invoice as it now stands.
 */
import React, { useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/DateInput";
import { Money } from "@/components/privacy";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/invoice-hub";
import type { InvoiceDetailView, InvoiceView } from "@/lib/invoice-views";

type Target = Pick<InvoiceView, "id" | "number" | "amount" | "due_date">;

interface ModalProps {
    invoice: Target;
    /** `YYYY-MM-DD` in Brasília */
    today: string;
    onClose: () => void;
    onDone: (detail: InvoiceDetailView) => void;
}

/** "115050" → "1.150,50": the amount as it is typed, cents first */
const maskMoney = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    return digits ? (parseInt(digits, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

function Shell({ title, icon, onClose, busy, children }: { title: string; icon: React.ReactNode; onClose: () => void; busy: boolean; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <button type="button" onClick={onClose} disabled={busy} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">{icon} {title}</h2>
                {children}
            </div>
        </div>
    );
}

async function post(url: string, body: Record<string, unknown>): Promise<{ detail?: InvoiceDetailView; errors?: Record<string, string> }> {
    try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { errors: json.errors ?? { _form: typeof json.error === "string" ? json.error : "Não foi possível concluir." } };
        return { detail: json as InvoiceDetailView };
    } catch {
        return { errors: { _form: "Erro de conexão. Tente novamente." } };
    }
}

export function InvoicePayModal({ invoice, today, onClose, onDone }: ModalProps) {
    const [paidOn, setPaidOn] = useState(today);
    const [amount, setAmount] = useState(() => maskMoney(invoice.amount.toFixed(2)));
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const submit = async () => {
        setBusy(true);
        setErrors({});
        const { detail, errors: failed } = await post(`/api/faturas/${invoice.id}/pagar`, { paid_on: paidOn, paid_amount: amount, notes });
        setBusy(false);
        if (detail) onDone(detail);
        else setErrors(failed ?? {});
    };

    return (
        <Shell title="Registrar pagamento" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} onClose={onClose} busy={busy}>
            <p className="mb-4 text-sm text-muted-foreground">
                Fatura nº {invoice.number}, <Money>{brl(invoice.amount)}</Money>, vencimento em {formatDateBR(invoice.due_date)}. Use quando o inquilino pagou por fora (transferência, dinheiro).
            </p>
            <div className="space-y-3">
                <div>
                    <Label className="text-xs">Data do pagamento</Label>
                    <DateInput value={paidOn} onChange={setPaidOn} className="h-9 text-sm" wrapperClassName="mt-1 w-44" />
                    {errors.paid_on && <p className="mt-1 text-xs text-rose-600">{errors.paid_on}</p>}
                </div>
                <div>
                    <Label htmlFor="invoice-paid-amount" className="text-xs">Valor recebido (R$)</Label>
                    <Input id="invoice-paid-amount" value={amount} onChange={e => setAmount(maskMoney(e.target.value))} inputMode="numeric" className="mt-1 h-9 w-44 privacy-money" />
                    {errors.paid_amount
                        ? <p className="mt-1 text-xs text-rose-600">{errors.paid_amount}</p>
                        : <p className="mt-1 text-xs text-muted-foreground">O que vier acima do valor da fatura é registrado como multa e juros.</p>}
                </div>
                <div>
                    <Label htmlFor="invoice-paid-notes" className="text-xs">Observação (opcional)</Label>
                    <Input id="invoice-paid-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} placeholder="Ex: transferência recebida na conta da holding" className="mt-1 h-9" />
                </div>
            </div>
            {errors._form && <p className="mt-3 flex items-start gap-1.5 text-sm text-rose-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errors._form}</p>}
            <div className="mt-5 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>Voltar</Button>
                <Button className="flex-1" onClick={submit} disabled={busy || !paidOn}>
                    {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando…</> : "Registrar pagamento"}
                </Button>
            </div>
        </Shell>
    );
}

export function InvoiceCancelModal({ invoice, onClose, onDone }: ModalProps) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const submit = async () => {
        setBusy(true);
        setErrors({});
        const { detail, errors: failed } = await post(`/api/faturas/${invoice.id}/cancelar`, { reason });
        setBusy(false);
        if (detail) onDone(detail);
        else setErrors(failed ?? {});
    };

    return (
        <Shell title="Cancelar fatura?" icon={<Ban className="h-5 w-5 text-rose-600" />} onClose={onClose} busy={busy}>
            <p className="mb-4 text-sm text-muted-foreground">
                A fatura nº {invoice.number} (<Money>{brl(invoice.amount)}</Money>) deixa de ser cobrada. O mês fica livre: uma nova fatura pode ser gerada para o mesmo contrato.
            </p>
            <Label htmlFor="invoice-cancel-reason" className="text-xs">Motivo (opcional)</Label>
            <Input id="invoice-cancel-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Ex: valor errado, contrato rescindido" className="mt-1 h-9" />
            {errors._form && <p className="mt-3 flex items-start gap-1.5 text-sm text-rose-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errors._form}</p>}
            <div className="mt-5 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>Voltar</Button>
                <Button variant="destructive" className="flex-1" onClick={submit} disabled={busy}>
                    {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelando…</> : "Cancelar fatura"}
                </Button>
            </div>
        </Shell>
    );
}
