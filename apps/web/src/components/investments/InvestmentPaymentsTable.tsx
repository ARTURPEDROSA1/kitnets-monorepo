"use client";

/**
 * The payment ledger of a Novo Investimento — the same spreadsheet the rest of the app uses.
 *
 * It is built on the shared table machinery, so it behaves exactly like Receitas de Aluguel and the
 * condominium ledger: sort and filter from each header, right-click a header to hide or show
 * columns (the choice follows the account), click a cell and move with the arrows, Shift+arrows to
 * select a rectangle, Enter or F2 to edit, Esc to cancel, and a floating bar with the count, sum
 * and average of the selected cells.
 *
 * Above the table sit the instalments the contract still owes (from the quadro resumo). Clicking one
 * turns it into a line already filled in, which is the normal way a month is added: the owner pays
 * the developer, drops the receipt in and moves on.
 */
import React, { useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Download, Loader2, Paperclip, Plus, Settings, Trash2, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import MoneyInput, { parseMoneyText } from "@/components/properties/MoneyInput";
import {
    ColumnHeaders,
    ColumnMenu,
    FilterChips,
    useColumnFilters,
    type ColumnDef,
} from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { columnTableKey } from "@/lib/ui-preferences";
import {
    PAYMENT_KINDS,
    formatBRL,
    paymentTotal,
    pendingByKind,
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
    /** Opens the quadro resumo editor — the forecast above the table comes from it. */
    onEditPlan?: () => void;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

const cellInput = "bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full px-1.5 py-1 outline-none";

/** The sum bar prints an instalment number as a count, not as reais. */
const SUM_FORMATS = { installment_number: (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) };

export default function InvestmentPaymentsTable({
    payments,
    schedules,
    receiptUrls,
    onCreate,
    onPatch,
    onDelete,
    onEditPlan,
    busy,
}: Props) {
    const [draft, setDraft] = useState<PaymentDraft | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showUpcoming, setShowUpcoming] = useState(true);
    /** Which kind the forecast strip is showing; "ALL" is every kind at once. */
    const [upcomingKind, setUpcomingKind] = useState<PaymentKind | "ALL">("ALL");
    const newFileRef = useRef<HTMLInputElement>(null);

    const sel = useCellSum({ formatByCol: SUM_FORMATS });
    const vis = useColumnVisibility(columnTableKey("investment-payments"), {
        locked: ["due_on"],
        defaultHidden: ["installment_number"],
    });

    const pending = useMemo(() => pendingInstalments(schedules, payments), [schedules, payments]);
    const pendingKinds = useMemo(() => pendingByKind(pending), [pending]);
    const selectedKind = upcomingKind !== "ALL" && pendingKinds.some(k => k.kind === upcomingKind) ? upcomingKind : "ALL";
    const filteredPending = useMemo(
        () => (selectedKind === "ALL" ? pending : pending.filter(i => i.kind === selectedKind)),
        [pending, selectedKind]
    );
    // One kind chosen means the owner is lining payments up to anticipate: show more of them.
    const upcoming = useMemo(
        () => filteredPending.slice(0, selectedKind === "ALL" ? 6 : 12),
        [filteredPending, selectedKind]
    );
    const selectedSummary = pendingKinds.find(k => k.kind === selectedKind) ?? null;

    const columns = useMemo<ColumnDef<InvestmentPayment>[]>(() => [
        { key: "due_on", label: "Vencimento", kind: "date", get: r => r.due_on },
        { key: "paid_on", label: "Pago em", kind: "date", get: r => r.paid_on ?? "" },
        {
            key: "kind",
            label: "Tipo",
            kind: "enum",
            get: r => r.kind,
            options: PAYMENT_KINDS.map(k => ({ value: k.kind, label: k.label })),
        },
        {
            key: "status",
            label: "Situação",
            kind: "enum",
            get: r => r.status,
            options: [{ value: "PAID", label: "Pago" }, { value: "PLANNED", label: "Previsto" }],
        },
        { key: "installment_number", label: "Parcela nº", kind: "number", align: "right", sum: false, get: r => r.installment_number },
        { key: "amount", label: "Valor", kind: "number", align: "right", title: "Valor contratado da parcela, como está no quadro resumo", get: r => r.amount },
        {
            key: "correction_amount",
            label: "Correção",
            kind: "number",
            align: "right",
            title: "Calculada: valor pago − valor da parcela. Positiva quando houve correção (CUB, INCC); negativa quando houve desconto por antecipação.",
            get: r => r.correction_amount,
        },
        { key: "total", label: "Valor pago", kind: "number", align: "right", title: "O que saiu da conta — o valor do comprovante", get: r => paymentTotal(r) },
        { key: "notes", label: "Observação", kind: "text", get: r => r.notes ?? "" },
        {
            key: "receipt",
            label: "Comprovante",
            kind: "enum",
            align: "center",
            get: r => (r.receipt_path ? "YES" : "NO"),
            options: [{ value: "YES", label: "Anexado" }, { value: "NO", label: "Sem comprovante" }],
        },
    ], []);

    const cf = useColumnFilters(payments, columns, { key: "due_on", dir: "asc" });
    const rows = cf.rows;
    const show = (key: string) => !vis.isHidden(key);
    const visibleCount = columns.filter(c => show(c.key)).length;

    const totals = useMemo(() => {
        const paid = rows.filter(r => r.status === "PAID");
        return {
            paid: paid.reduce((s, r) => s + paymentTotal(r), 0),
            corrections: paid.reduce((s, r) => s + r.correction_amount, 0),
            planned: rows.filter(r => r.status === "PLANNED").reduce((s, r) => s + paymentTotal(r), 0),
        };
    }, [rows]);

    /**
     * The two typed facts are the contracted instalment and what was actually paid; the correction
     * is always the difference. Whichever of the two is edited, the other stays and the correction
     * is recomputed — so the row never holds three numbers that disagree.
     */
    const takeDraft = (rowId: string, field: string): number | null => {
        const key = `${rowId}:${field}`;
        const text = drafts[key];
        if (text === undefined) return null;
        setDrafts(d => { const next = { ...d }; delete next[key]; return next; });
        return parseMoneyText(text) ?? 0;
    };

    const commitAmount = async (row: InvestmentPayment) => {
        const amount = takeDraft(row.id, "amount");
        if (amount === null || amount === row.amount) return;
        await onPatch(row.id, { amount, correction_amount: round2(paymentTotal(row) - amount) });
    };

    const commitPaid = async (row: InvestmentPayment) => {
        const paid = takeDraft(row.id, "paid");
        if (paid === null || paid === paymentTotal(row)) return;
        await onPatch(row.id, { correction_amount: round2(paid - row.amount) });
    };

    const cancelDraft = (rowId: string, field: string) =>
        setDrafts(d => { const next = { ...d }; delete next[`${rowId}:${field}`]; return next; });

    /** The chip already knows what the bill should be: the contracted value, plus the correction the last payment of this kind carried. */
    const startFromInstalment = (inst: ScheduledInstalment) => {
        setDraft({
            due_on: inst.dueOn,
            paid_on: inst.dueOn,
            kind: inst.kind,
            amount: inst.contractedAmount,
            correction_amount: round2(inst.amount - inst.contractedAmount),
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

    /** Columns before "Valor", so the footer's label spans exactly the ones on screen. */
    const labelSpan = Math.max(1, columns.slice(0, columns.findIndex(c => c.key === "amount")).filter(c => show(c.key)).length);

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Pagamentos</h2>
                    <p className="text-xs text-muted-foreground">
                        Um lançamento por parcela paga, com o comprovante anexado. Clique numa célula e ande com as setas;
                        botão direito no cabeçalho esconde colunas.
                    </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setDraft(emptyDraft()); setError(null); }} disabled={busy || draft !== null}>
                    <Plus className="w-4 h-4 mr-1" /> Novo lançamento
                </Button>
            </header>

            {upcoming.length > 0 && (
                <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setShowUpcoming(v => !v)}
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                            Próximas parcelas do contrato ({filteredPending.length})
                        </button>
                        {onEditPlan && (
                            <button
                                type="button"
                                onClick={onEditPlan}
                                title="Editar o plano de pagamento do contrato"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <Settings className="w-3.5 h-3.5" /> Editar plano
                            </button>
                        )}
                    </div>
                    {showUpcoming && pendingKinds.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setUpcomingKind("ALL")}
                                className={cn(
                                    "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                                    selectedKind === "ALL" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-border text-muted-foreground hover:border-emerald-400"
                                )}
                            >
                                Todas ({pending.length})
                            </button>
                            {pendingKinds.map(k => (
                                <button
                                    key={k.kind}
                                    type="button"
                                    onClick={() => setUpcomingKind(k.kind)}
                                    title={`${k.count} em aberto · ${formatBRL(k.total)} · próxima em ${formatDateBR(k.nextDueOn)}`}
                                    className={cn(
                                        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                                        selectedKind === k.kind ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-border text-muted-foreground hover:border-emerald-400"
                                    )}
                                >
                                    {k.short} ({k.count})
                                </button>
                            ))}
                        </div>
                    )}
                    {showUpcoming && selectedSummary && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            {selectedSummary.count} em aberto, somando{" "}
                            <strong className="text-foreground tabular-nums">{formatBRL(selectedSummary.total)}</strong>,
                            pelo último valor pago deste tipo. Antecipar uma parcela a lança por esse valor, sem a correção
                            que ela ainda acumularia até o vencimento.
                        </p>
                    )}
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
                            {filteredPending.length > upcoming.length && (
                                <li className="self-center text-[11px] text-muted-foreground">
                                    + {filteredPending.length - upcoming.length} depois
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}

            <div className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                        {payments.length} {payments.length === 1 ? "lançamento" : "lançamentos"}
                        {cf.anyFilter && ` · ${rows.length} de ${payments.length}`}
                        {vis.hiddenCount > 0 && ` · ${vis.hiddenCount} coluna${vis.hiddenCount === 1 ? "" : "s"} oculta${vis.hiddenCount === 1 ? "" : "s"}`}
                    </span>
                    <FilterChips columns={columns} ctl={cf} />
                </div>

                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs" style={{ minWidth: `${Math.max(560, visibleCount * 104)}px` }}>
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {rows.length === 0 && draft === null && (
                                <tr>
                                    <td colSpan={visibleCount + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                        {payments.length === 0
                                            ? "Nenhum pagamento lançado ainda. Comece pela entrada ou pelo sinal."
                                            : "Nenhum lançamento com os filtros atuais."}
                                        {onEditPlan && payments.length === 0 && upcoming.length === 0 && (
                                            <>
                                                {" "}
                                                <button type="button" onClick={onEditPlan} className="underline hover:text-foreground">
                                                    Cadastre o plano de pagamento
                                                </button>{" "}
                                                para ver a previsão das parcelas.
                                            </>
                                        )}
                                    </td>
                                </tr>
                            )}

                            {rows.map(row => (
                                <tr key={row.id} className={cn("border-b border-border/60 hover:bg-muted/30", row.status === "PLANNED" && "opacity-70")}>
                                    {show("due_on") && (
                                        <td {...sel.cellProps("due_on", row.id, null, "px-2 py-1")}>
                                            <input
                                                type="date"
                                                value={row.due_on}
                                                onChange={e => onPatch(row.id, { due_on: e.target.value })}
                                                aria-label="Vencimento"
                                                className={cn(cellInput, "tabular-nums")}
                                            />
                                        </td>
                                    )}
                                    {show("paid_on") && (
                                        <td {...sel.cellProps("paid_on", row.id, null, "px-2 py-1")}>
                                            <input
                                                type="date"
                                                value={row.paid_on ?? ""}
                                                onChange={e => onPatch(row.id, { paid_on: e.target.value || null, status: e.target.value ? "PAID" : "PLANNED" })}
                                                aria-label="Pago em"
                                                className={cn(cellInput, "tabular-nums")}
                                            />
                                        </td>
                                    )}
                                    {show("kind") && (
                                        <td {...sel.cellProps("kind", row.id, null, "px-2 py-1")}>
                                            <select
                                                value={row.kind}
                                                onChange={e => onPatch(row.id, { kind: e.target.value })}
                                                aria-label="Tipo do pagamento"
                                                className={cn(cellInput, "cursor-pointer")}
                                            >
                                                {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                            </select>
                                        </td>
                                    )}
                                    {show("status") && (
                                        <td {...sel.cellProps("status", row.id, null, "px-2 py-1")}>
                                            <select
                                                value={row.status}
                                                onChange={e => onPatch(row.id, { status: e.target.value })}
                                                aria-label="Situação"
                                                className={cn(cellInput, "cursor-pointer")}
                                            >
                                                <option value="PAID">Pago</option>
                                                <option value="PLANNED">Previsto</option>
                                            </select>
                                        </td>
                                    )}
                                    {show("installment_number") && (
                                        <td {...sel.cellProps("installment_number", row.id, row.installment_number, "px-2 py-1 text-right")}>
                                            <input
                                                type="number"
                                                min={1}
                                                value={row.installment_number ?? ""}
                                                onChange={e => onPatch(row.id, { installment_number: e.target.value ? Number(e.target.value) : null })}
                                                aria-label="Número da parcela"
                                                className={cn(cellInput, "text-right tabular-nums")}
                                            />
                                        </td>
                                    )}
                                    {show("amount") && (
                                        <td {...sel.cellProps("amount", row.id, row.amount, "px-2 py-1 text-right", () => cancelDraft(row.id, "amount"))}>
                                            <MoneyInput
                                                value={row.amount}
                                                draft={drafts[`${row.id}:amount`]}
                                                onDraft={text => setDrafts(d => ({ ...d, [`${row.id}:amount`]: text }))}
                                                onCommit={() => commitAmount(row)}
                                            />
                                        </td>
                                    )}
                                    {show("correction_amount") && (
                                        <td
                                            {...sel.cellProps("correction_amount", row.id, row.correction_amount, cn("px-2 py-1 text-right tabular-nums", row.correction_amount < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"))}
                                            title={row.correction_amount < 0 ? "Desconto: pagou menos que o valor da parcela" : "Correção: pagou mais que o valor da parcela"}
                                        >
                                            {formatBRL(row.correction_amount)}
                                        </td>
                                    )}
                                    {show("total") && (
                                        <td {...sel.cellProps("total", row.id, paymentTotal(row), "px-2 py-1 text-right font-semibold", () => cancelDraft(row.id, "paid"))}>
                                            <MoneyInput
                                                value={paymentTotal(row)}
                                                draft={drafts[`${row.id}:paid`]}
                                                onDraft={text => setDrafts(d => ({ ...d, [`${row.id}:paid`]: text }))}
                                                onCommit={() => commitPaid(row)}
                                                title="O valor do comprovante. A correção ao lado é a diferença para o valor da parcela."
                                                className="font-semibold"
                                            />
                                        </td>
                                    )}
                                    {show("notes") && (
                                        <td {...sel.cellProps("notes", row.id, null, "px-2 py-1")}>
                                            <input
                                                type="text"
                                                defaultValue={row.notes ?? ""}
                                                onBlur={e => { if (e.target.value !== (row.notes ?? "")) onPatch(row.id, { notes: e.target.value || null }); }}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                placeholder="—"
                                                aria-label="Observação"
                                                className={cn(cellInput, "min-w-[8rem]")}
                                            />
                                        </td>
                                    )}
                                    {show("receipt") && (
                                        <td {...sel.cellProps("receipt", row.id, null, "px-2 py-1 text-center")}>
                                            {row.receipt_path ? (
                                                <a
                                                    href={receiptUrls[row.receipt_path] ?? "#"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={row.receipt_name ?? "Comprovante"}
                                                    className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline"
                                                >
                                                    <Download className="w-3.5 h-3.5" /> ver
                                                </a>
                                            ) : (
                                                <label className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer">
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
                                    )}
                                    <td className="px-2 py-1 text-center">
                                        <button
                                            type="button"
                                            onClick={() => onDelete(row.id)}
                                            title="Excluir lançamento"
                                            aria-label="Excluir lançamento"
                                            className="text-muted-foreground hover:text-rose-600"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {draft && (
                                <tr className="border-b border-border/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                                    {show("due_on") && (
                                        <td className="px-2 py-1">
                                            <input type="date" value={draft.due_on} onChange={e => setDraft({ ...draft, due_on: e.target.value })} aria-label="Vencimento do novo lançamento" className={cn(cellInput, "tabular-nums")} />
                                        </td>
                                    )}
                                    {show("paid_on") && (
                                        <td className="px-2 py-1">
                                            <input
                                                type="date"
                                                value={draft.paid_on}
                                                onChange={e => setDraft({ ...draft, paid_on: e.target.value, status: e.target.value ? "PAID" : "PLANNED" })}
                                                aria-label="Data do pagamento"
                                                className={cn(cellInput, "tabular-nums")}
                                            />
                                        </td>
                                    )}
                                    {show("kind") && (
                                        <td className="px-2 py-1">
                                            <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as PaymentKind })} aria-label="Tipo do novo lançamento" className={cn(cellInput, "cursor-pointer")}>
                                                {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                            </select>
                                        </td>
                                    )}
                                    {show("status") && <td className="px-2 py-1 text-muted-foreground">{draft.status === "PAID" ? "Pago" : "Previsto"}</td>}
                                    {show("installment_number") && <td className="px-2 py-1" />}
                                    {show("amount") && (
                                        <td className="px-2 py-1 text-right">
                                            <MoneyInput
                                                value={draft.amount}
                                                draft={drafts["new:amount"]}
                                                onDraft={text => setDrafts(d => ({ ...d, "new:amount": text }))}
                                                onCommit={() => {
                                                    const text = drafts["new:amount"];
                                                    setDrafts(d => { const next = { ...d }; delete next["new:amount"]; return next; });
                                                    if (text === undefined) return;
                                                    const amount = parseMoneyText(text) ?? 0;
                                                    setDraft(prev => {
                                                        if (!prev) return prev;
                                                        // nothing typed as paid yet: the parcel's value is what will be paid
                                                        const paid = prev.amount + prev.correction_amount;
                                                        return { ...prev, amount, correction_amount: paid > 0 ? round2(paid - amount) : 0 };
                                                    });
                                                }}
                                            />
                                        </td>
                                    )}
                                    {show("correction_amount") && (
                                        <td className={cn("px-2 py-1 text-right tabular-nums", draft.correction_amount < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                                            {formatBRL(draft.correction_amount)}
                                        </td>
                                    )}
                                    {show("total") && (
                                        <td className="px-2 py-1 text-right font-semibold">
                                            <MoneyInput
                                                value={draft.amount + draft.correction_amount}
                                                draft={drafts["new:paid"]}
                                                onDraft={text => setDrafts(d => ({ ...d, "new:paid": text }))}
                                                onCommit={() => {
                                                    const text = drafts["new:paid"];
                                                    setDrafts(d => { const next = { ...d }; delete next["new:paid"]; return next; });
                                                    if (text !== undefined) {
                                                        const paid = parseMoneyText(text) ?? 0;
                                                        setDraft(prev => (prev ? { ...prev, correction_amount: round2(paid - prev.amount) } : prev));
                                                    }
                                                }}
                                                title="O valor do comprovante. A correção ao lado é a diferença para o valor da parcela."
                                                className="font-semibold"
                                            />
                                        </td>
                                    )}
                                    {show("notes") && (
                                        <td className="px-2 py-1">
                                            <input
                                                type="text"
                                                value={draft.notes}
                                                onChange={e => setDraft({ ...draft, notes: e.target.value })}
                                                placeholder="Observação"
                                                aria-label="Observação do novo lançamento"
                                                className={cn(cellInput, "min-w-[8rem]")}
                                            />
                                        </td>
                                    )}
                                    {show("receipt") && (
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                type="button"
                                                onClick={() => newFileRef.current?.click()}
                                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
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
                                    )}
                                    <td className="px-2 py-1">
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
                        {rows.length > 0 && (
                            <tfoot>
                                <tr className="font-semibold border-t border-border">
                                    <td colSpan={labelSpan} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Total pago
                                    </td>
                                    {show("amount") && <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totals.paid - totals.corrections)}</td>}
                                    {show("correction_amount") && <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totals.corrections)}</td>}
                                    {show("total") && <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatBRL(totals.paid)}</td>}
                                    <td colSpan={3} className="px-2 py-2 text-[11px] font-normal text-muted-foreground">
                                        {totals.planned > 0 ? `${formatBRL(totals.planned)} lançados como previstos` : ""}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>

            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} />
            <CellSumBar ctl={sel} />
        </section>
    );
}
