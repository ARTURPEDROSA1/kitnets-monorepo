"use client";

/**
 * The payment ledger of a Novo Investimento: one line per month, edited in place like a spreadsheet.
 *
 * Above it sit the instalments the contract still owes (from the quadro resumo). "Registrar" turns
 * one into a line already filled in, which is the normal way a month is added: the owner pays the
 * developer, drops the receipt in and moves on.
 */
import React, { useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Download, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import MoneyInput, { parseMoneyText } from "@/components/properties/MoneyInput";
import {
    PAYMENT_KINDS,
    formatBRL,
    paymentTotal,
    pendingInstalments,
    type InvestmentPayment,
    type InvestmentSchedule,
    type PaymentKind,
    type ScheduledInstalment,
} from "@/lib/new-investments";
import { stageInvestmentFile } from "@/lib/new-investment-upload-client";

export interface PaymentDraft {
    due_on: string;
    paid_on: string;
    kind: PaymentKind;
    amount: number;
    correction_amount: number;
    status: "PLANNED" | "PAID";
    notes: string;
    receipt_path?: string | null;
    receipt_name?: string | null;
}

interface Props {
    payments: InvestmentPayment[];
    schedules: InvestmentSchedule[];
    receiptUrls: Record<string, string | null>;
    onCreate: (draft: PaymentDraft) => Promise<boolean>;
    onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    busy?: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyDraft = (): PaymentDraft => ({
    due_on: todayISO(),
    paid_on: todayISO(),
    kind: "PARCELA",
    amount: 0,
    correction_amount: 0,
    status: "PAID",
    notes: "",
});

const cellInput = "bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded px-1.5 py-1 outline-none w-full";

export default function InvestmentPaymentsTable({
    payments,
    schedules,
    receiptUrls,
    onCreate,
    onPatch,
    onDelete,
    busy,
}: Props) {
    const [draft, setDraft] = useState<PaymentDraft | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showUpcoming, setShowUpcoming] = useState(true);
    const newFileRef = useRef<HTMLInputElement>(null);

    const rows = useMemo(
        () => [...payments].sort((a, b) => ((a.paid_on ?? a.due_on) < (b.paid_on ?? b.due_on) ? -1 : 1)),
        [payments]
    );
    const upcoming = useMemo(() => pendingInstalments(schedules, payments).slice(0, 6), [schedules, payments]);

    const totals = useMemo(() => {
        const paid = rows.filter(r => r.status === "PAID");
        return {
            paid: paid.reduce((s, r) => s + paymentTotal(r), 0),
            corrections: paid.reduce((s, r) => s + r.correction_amount, 0),
            planned: rows.filter(r => r.status === "PLANNED").reduce((s, r) => s + paymentTotal(r), 0),
        };
    }, [rows]);

    const commitMoney = async (row: InvestmentPayment, field: "amount" | "correction_amount") => {
        const key = `${row.id}:${field}`;
        const text = drafts[key];
        if (text === undefined) return;
        setDrafts(d => { const next = { ...d }; delete next[key]; return next; });
        const value = parseMoneyText(text) ?? 0;
        if (value === row[field]) return;
        await onPatch(row.id, { [field]: value });
    };

    const startFromInstalment = (inst: ScheduledInstalment) => {
        setDraft({
            due_on: inst.dueOn,
            paid_on: inst.dueOn,
            kind: inst.kind,
            amount: inst.amount,
            correction_amount: 0,
            status: "PAID",
            notes: inst.label,
        });
        setError(null);
    };

    const uploadReceipt = async (file: File, paymentId: string | null) => {
        setUploading(paymentId ?? "new");
        setError(null);
        const staged = await stageInvestmentFile(file);
        setUploading(null);
        if ("error" in staged) {
            setError(staged.error);
            return;
        }
        if (paymentId) {
            await onPatch(paymentId, { receipt_path: staged.path, receipt_name: file.name.slice(0, 200) });
        } else {
            setDraft(d => (d ? { ...d, receipt_path: staged.path, receipt_name: file.name.slice(0, 200) } : d));
        }
    };

    const save = async () => {
        if (!draft) return;
        if (draft.amount <= 0 && draft.correction_amount <= 0) {
            setError("Informe o valor pago.");
            return;
        }
        setSaving(true);
        const ok = await onCreate(draft);
        setSaving(false);
        if (ok) {
            setDraft(null);
            setError(null);
        } else {
            setError("Não foi possível salvar o lançamento.");
        }
    };

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Pagamentos</h2>
                    <p className="text-xs text-muted-foreground">Um lançamento por parcela paga, com o comprovante anexado.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setDraft(emptyDraft()); setError(null); }} disabled={busy || draft !== null}>
                    <Plus className="w-4 h-4 mr-1" /> Novo lançamento
                </Button>
            </header>

            {upcoming.length > 0 && (
                <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
                    <button
                        type="button"
                        onClick={() => setShowUpcoming(v => !v)}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                        Próximas parcelas do contrato ({upcoming.length})
                    </button>
                    {showUpcoming && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                            {upcoming.map(inst => (
                                <li key={`${inst.scheduleId}-${inst.number}`}>
                                    <button
                                        type="button"
                                        onClick={() => startFromInstalment(inst)}
                                        disabled={busy}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:border-emerald-400 disabled:opacity-50"
                                        title={`${inst.label} · parcela ${inst.number}`}
                                    >
                                        <CalendarPlus className="w-3.5 h-3.5 text-emerald-600" />
                                        <span className="tabular-nums">{formatDateBR(inst.dueOn)}</span>
                                        <span className="font-semibold tabular-nums">{formatBRL(inst.amount, 0)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                            <th className="text-left font-semibold px-3 py-2">Vencimento</th>
                            <th className="text-left font-semibold px-3 py-2">Pago em</th>
                            <th className="text-left font-semibold px-3 py-2">Tipo</th>
                            <th className="text-right font-semibold px-3 py-2">Valor</th>
                            <th className="text-right font-semibold px-3 py-2">Correção</th>
                            <th className="text-right font-semibold px-3 py-2">Total</th>
                            <th className="text-left font-semibold px-3 py-2">Observação</th>
                            <th className="text-center font-semibold px-3 py-2">Comprovante</th>
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && draft === null && (
                            <tr>
                                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                    Nenhum pagamento lançado ainda. Comece pela entrada ou pelo sinal.
                                </td>
                            </tr>
                        )}

                        {rows.map(row => (
                            <tr key={row.id} className={cn("border-b border-border/40 hover:bg-muted/30", row.status === "PLANNED" && "text-muted-foreground")}>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="date"
                                        value={row.due_on}
                                        onChange={e => onPatch(row.id, { due_on: e.target.value })}
                                        className={cn(cellInput, "tabular-nums")}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="date"
                                        value={row.paid_on ?? ""}
                                        onChange={e => onPatch(row.id, { paid_on: e.target.value || null, status: e.target.value ? "PAID" : "PLANNED" })}
                                        className={cn(cellInput, "tabular-nums")}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <select
                                        value={row.kind}
                                        onChange={e => onPatch(row.id, { kind: e.target.value })}
                                        className={cn(cellInput, "text-xs")}
                                    >
                                        {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                    </select>
                                </td>
                                <td className="px-3 py-1.5">
                                    <MoneyInput
                                        value={row.amount}
                                        draft={drafts[`${row.id}:amount`]}
                                        onDraft={text => setDrafts(d => ({ ...d, [`${row.id}:amount`]: text }))}
                                        onCommit={() => commitMoney(row, "amount")}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <MoneyInput
                                        value={row.correction_amount}
                                        draft={drafts[`${row.id}:correction_amount`]}
                                        onDraft={text => setDrafts(d => ({ ...d, [`${row.id}:correction_amount`]: text }))}
                                        onCommit={() => commitMoney(row, "correction_amount")}
                                        title="INCC, IGP-M ou CUB cobrado sobre esta parcela"
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatBRL(paymentTotal(row))}</td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="text"
                                        defaultValue={row.notes ?? ""}
                                        onBlur={e => { if (e.target.value !== (row.notes ?? "")) onPatch(row.id, { notes: e.target.value || null }); }}
                                        placeholder="—"
                                        className={cn(cellInput, "text-xs min-w-[8rem]")}
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                    {row.receipt_path ? (
                                        <a
                                            href={receiptUrls[row.receipt_path] ?? "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={row.receipt_name ?? "Comprovante"}
                                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                        >
                                            <Download className="w-3.5 h-3.5" /> ver
                                        </a>
                                    ) : (
                                        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                                            {uploading === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                            <input
                                                type="file"
                                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                                className="sr-only"
                                                onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadReceipt(f, row.id); }}
                                            />
                                            anexar
                                        </label>
                                    )}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                    <button
                                        type="button"
                                        onClick={() => onDelete(row.id)}
                                        title="Excluir lançamento"
                                        aria-label="Excluir lançamento"
                                        className="p-1 rounded text-muted-foreground hover:text-rose-600"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </td>
                            </tr>
                        ))}

                        {draft && (
                            <tr className="border-b border-border/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                                <td className="px-3 py-1.5">
                                    <input type="date" value={draft.due_on} onChange={e => setDraft({ ...draft, due_on: e.target.value })} className={cn(cellInput, "tabular-nums")} />
                                </td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="date"
                                        value={draft.paid_on}
                                        onChange={e => setDraft({ ...draft, paid_on: e.target.value, status: e.target.value ? "PAID" : "PLANNED" })}
                                        className={cn(cellInput, "tabular-nums")}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as PaymentKind })} className={cn(cellInput, "text-xs")}>
                                        {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                    </select>
                                </td>
                                <td className="px-3 py-1.5">
                                    <MoneyInput
                                        value={draft.amount}
                                        draft={drafts["new:amount"]}
                                        onDraft={text => setDrafts(d => ({ ...d, "new:amount": text }))}
                                        onCommit={() => {
                                            const text = drafts["new:amount"];
                                            setDrafts(d => { const next = { ...d }; delete next["new:amount"]; return next; });
                                            if (text !== undefined) setDraft(prev => (prev ? { ...prev, amount: parseMoneyText(text) ?? 0 } : prev));
                                        }}
                                    />
                                </td>
                                <td className="px-3 py-1.5">
                                    <MoneyInput
                                        value={draft.correction_amount}
                                        draft={drafts["new:correction"]}
                                        onDraft={text => setDrafts(d => ({ ...d, "new:correction": text }))}
                                        onCommit={() => {
                                            const text = drafts["new:correction"];
                                            setDrafts(d => { const next = { ...d }; delete next["new:correction"]; return next; });
                                            if (text !== undefined) setDraft(prev => (prev ? { ...prev, correction_amount: parseMoneyText(text) ?? 0 } : prev));
                                        }}
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                                    {formatBRL(draft.amount + draft.correction_amount)}
                                </td>
                                <td className="px-3 py-1.5">
                                    <input
                                        type="text"
                                        value={draft.notes}
                                        onChange={e => setDraft({ ...draft, notes: e.target.value })}
                                        placeholder="Observação"
                                        className={cn(cellInput, "text-xs min-w-[8rem]")}
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                    <button
                                        type="button"
                                        onClick={() => newFileRef.current?.click()}
                                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        {uploading === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                                        {draft.receipt_name ? draft.receipt_name.slice(0, 14) : "anexar"}
                                    </button>
                                    <input
                                        ref={newFileRef}
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        className="sr-only"
                                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadReceipt(f, null); }}
                                    />
                                </td>
                                <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button type="button" onClick={save} disabled={saving} title="Salvar" aria-label="Salvar lançamento" className="p-1 rounded text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50">
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        </button>
                                        <button type="button" onClick={() => { setDraft(null); setError(null); }} title="Cancelar" aria-label="Cancelar" className="p-1 rounded text-muted-foreground hover:text-foreground">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="text-sm font-semibold">
                            <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground uppercase text-[10px] tracking-wider">Total pago</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatBRL(totals.paid - totals.corrections)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatBRL(totals.corrections)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{formatBRL(totals.paid)}</td>
                            <td colSpan={3} className="px-3 py-2 text-xs font-normal text-muted-foreground">
                                {totals.planned > 0 ? `${formatBRL(totals.planned)} lançados como previstos` : ""}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {error && <p className="px-4 py-2 text-xs text-rose-600">{error}</p>}
        </section>
    );
}
