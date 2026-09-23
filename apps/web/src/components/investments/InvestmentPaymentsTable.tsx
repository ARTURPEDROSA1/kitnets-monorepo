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
 * the developer, drops the receipts in and moves on.
 *
 * Receipts are read on the way in. Each one says who paid — a CPF is the person, a CNPJ is the
 * company — so an instalment settled from two pockets gets its PF/PJ split filled in from the two
 * receipts, and the row's paid total and date follow them. Everything stays editable after.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Eye, Loader2, Paperclip, Plus, Settings, Sparkles, Trash2, Upload, X } from "lucide-react";
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
import { columnTableKey, recordTableKey } from "@/lib/ui-preferences";
import {
    PAYER_LABELS,
    PAYMENT_KINDS,
    formatBRL,
    indexBetweenPayments,
    payerSplit,
    paymentTotal,
    pendingByKind,
    pendingInstalments,
    type InvestmentPayment,
    type InvestmentSchedule,
    type Payer,
    type PaymentKind,
    type ScheduledInstalment,
} from "@/lib/new-investments";
import { allocateFromReceipts, type ExtractedReceipt } from "@/lib/new-investment-receipt";
import { readByFromJson, readerLabel, type ReadBy } from "@/lib/ai-reader-label";
import { stageInvestmentFile } from "@/lib/new-investment-upload-client";

export interface PaymentDraft {
    due_on: string;
    paid_on: string;
    kind: PaymentKind;
    amount: number;
    correction_amount: number;
    status: "PLANNED" | "PAID";
    notes: string;
    payer: Payer | null;
    pj_amount: number | null;
    /** Staged receipts, adopted when the row is created. */
    receipt_paths: string[];
    receipt_names: string[];
}

/** A receipt as the dashboard hands it over: the document row plus its signed URL. */
export interface ReceiptDoc {
    id: string;
    storage_path: string;
    file_name: string | null;
    url: string | null;
}

interface Props {
    investmentId: string;
    payments: InvestmentPayment[];
    schedules: InvestmentSchedule[];
    receiptsByPayment: Record<string, ReceiptDoc[]>;
    onCreate: (draft: PaymentDraft) => Promise<boolean>;
    onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    /** Reload after receipts were attached without a row patch. */
    onRefresh: () => Promise<void> | void;
    /** Opens the quadro resumo editor — the forecast above the table comes from it. */
    onEditPlan?: () => void;
    /** Opens a receipt in the app's own viewer — never a new tab. */
    onView?: (url: string, name: string) => void;
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
    payer: null,
    pj_amount: null,
    receipt_paths: [],
    receipt_names: [],
});

const round2 = (n: number) => Math.round(n * 100) / 100;

const cellInput = "bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full px-1.5 py-1 outline-none";

/** Every column hugs its content (`w-px` + nowrap); Observação is the one that absorbs the rest. */
const tight = "w-px whitespace-nowrap";

/** The sum bar prints an instalment number as a count, not as reais. */
const SUM_FORMATS = { installment_number: (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) };

const PAYER_OPTIONS: { value: Payer | ""; label: string }[] = [
    { value: "", label: "—" },
    { value: "PF", label: PAYER_LABELS.PF },
    { value: "PJ", label: PAYER_LABELS.PJ },
    { value: "SPLIT", label: PAYER_LABELS.SPLIT },
];

/** What one uploaded receipt turned into: where it sits in storage, and what the reader made of it. */
interface ReadReceipt {
    path: string;
    name: string;
    file: File;
    extracted: ExtractedReceipt | null;
    /** Which model read it; null when the read failed and the file was only attached. */
    readBy: ReadBy | null;
}

/**
 * The allocation a set of freshly read receipts implies on top of what the row already records.
 *
 * A row that already knows its payer keeps that share and adds the new receipts to it; a row that
 * does not is taken over by the receipts only when every one of them could be attributed — better
 * "não informado" than the company's money quietly booked to the person.
 */
function mergeAllocation(
    current: { total: number; payer: Payer | null; pj: number },
    read: ExtractedReceipt[]
): { total: number; payer: Payer | null; pj_amount: number | null; paid_on: string | null } | null {
    const fresh = allocateFromReceipts(read);
    if (fresh.total === 0 && !fresh.paid_on) return null;

    if (current.payer === null) {
        return {
            total: fresh.total > 0 ? fresh.total : current.total,
            payer: fresh.payer,
            pj_amount: fresh.payer === "SPLIT" ? fresh.pj : null,
            paid_on: fresh.paid_on,
        };
    }
    const pf = round2((current.payer === "PJ" ? 0 : current.total - (current.payer === "SPLIT" ? current.pj : 0)) + fresh.pf);
    const pj = round2((current.payer === "PF" ? 0 : current.payer === "PJ" ? current.total : current.pj) + fresh.pj);
    const payer: Payer | null = fresh.unattributed > 0 ? null : pf > 0 && pj > 0 ? "SPLIT" : pj > 0 ? "PJ" : "PF";
    return { total: round2(current.total + fresh.total), payer, pj_amount: payer === "SPLIT" ? pj : null, paid_on: fresh.paid_on };
}

export default function InvestmentPaymentsTable({
    investmentId,
    payments,
    schedules,
    receiptsByPayment,
    onCreate,
    onPatch,
    onDelete,
    onRefresh,
    onEditPlan,
    onView,
    busy,
}: Props) {
    const [draft, setDraft] = useState<PaymentDraft | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    /** The row whose receipts are being read; "new" for the draft. */
    const [uploading, setUploading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** What the last batch of receipts was read as — shown once, under the table. */
    const [notice, setNotice] = useState<string | null>(null);
    const [showUpcoming, setShowUpcoming] = useState(true);
    /** Which kind the forecast strip is showing; "ALL" is every kind at once. */
    const [upcomingKind, setUpcomingKind] = useState<PaymentKind | "ALL">("ALL");
    /**
     * Which end of the plan the strip shows. "first" is what is due next; "last" is what an owner
     * paying ahead reaches for — settling the final instalments is how a plan gets shorter.
     */
    const [upcomingOrder, setUpcomingOrder] = useState<"first" | "last">("first");
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const newFileRef = useRef<HTMLInputElement>(null);

    // The read-out is a toast, not a fixture: it leaves on its own, or on its X.
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 20_000);
        return () => clearTimeout(timer);
    }, [notice]);

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
    // From the chosen end of the plan; one kind chosen means the owner is lining payments up to
    // anticipate, so more of them show, and "ver todas" shows every one.
    const upcoming = useMemo(() => {
        const ordered = upcomingOrder === "last" ? [...filteredPending].reverse() : filteredPending;
        return showAllUpcoming ? ordered : ordered.slice(0, selectedKind === "ALL" ? 6 : 12);
    }, [filteredPending, selectedKind, upcomingOrder, showAllUpcoming]);
    const selectedSummary = pendingKinds.find(k => k.kind === selectedKind) ?? null;

    /** The index each bill carries over the previous one of its kind — computed on all payments, not the filtered view. */
    const indexOf = useMemo(() => indexBetweenPayments(payments), [payments]);

    const columns = useMemo<ColumnDef<InvestmentPayment>[]>(() => [
        { key: "due_on", label: "Vencimento", kind: "date", className: tight, get: r => r.due_on },
        { key: "paid_on", label: "Pago em", kind: "date", className: tight, get: r => r.paid_on ?? "" },
        {
            key: "kind",
            label: "Tipo",
            kind: "enum",
            className: tight,
            get: r => r.kind,
            options: PAYMENT_KINDS.map(k => ({ value: k.kind, label: k.label })),
        },
        {
            key: "status",
            label: "Situação",
            kind: "enum",
            className: tight,
            get: r => r.status,
            options: [{ value: "PAID", label: "Pago" }, { value: "PLANNED", label: "Previsto" }],
        },
        { key: "installment_number", label: "Parcela nº", kind: "number", align: "right", sum: false, className: tight, get: r => r.installment_number },
        { key: "amount", label: "Valor", kind: "number", align: "right", className: tight, title: "Valor contratado da parcela, como está no quadro resumo", get: r => r.amount },
        {
            key: "correction_amount",
            label: "Correção",
            kind: "number",
            align: "right",
            className: tight,
            title: "Calculada: valor pago − valor da parcela. Positiva quando houve correção (CUB, INCC); negativa quando houve desconto por antecipação.",
            get: r => r.correction_amount,
        },
        { key: "total", label: "Valor pago", kind: "number", align: "right", className: tight, title: "O que saiu da conta — a soma dos comprovantes", get: r => paymentTotal(r) },
        {
            key: "index_pct",
            label: "Índice",
            kind: "number",
            align: "right",
            sum: false,
            className: tight,
            title: "Variação sobre o pagamento anterior do mesmo tipo, na ordem em que foram pagos — o CUB/INCC do período. O primeiro de cada tipo compara com o valor de contrato: a correção acumulada desde a assinatura.",
            get: r => indexOf.get(r.id)?.pct ?? null,
        },
        {
            key: "payer",
            label: "Pagador",
            kind: "enum",
            className: tight,
            title: "Quem pagou: a pessoa física, a pessoa jurídica ou as duas. Lido do CPF/CNPJ do pagador no comprovante.",
            get: r => r.payer ?? "NONE",
            options: [{ value: "NONE", label: "Não informado" }, ...(["PF", "PJ", "SPLIT"] as Payer[]).map(p => ({ value: p, label: PAYER_LABELS[p] }))],
        },
        {
            key: "pj_amount",
            label: "PJ (R$)",
            kind: "number",
            align: "right",
            className: tight,
            title: "A parte paga pela pessoa jurídica. Editável quando o pagador é PF + PJ; a parte PF é o restante do valor pago.",
            get: r => payerSplit(r)?.pj ?? null,
        },
        { key: "notes", label: "Observação", kind: "text", get: r => r.notes ?? "" },
        {
            key: "receipt",
            label: "Comprovantes",
            kind: "enum",
            align: "center",
            className: tight,
            get: r => ((receiptsByPayment[r.id]?.length ?? 0) > 0 ? "YES" : "NO"),
            options: [{ value: "YES", label: "Anexado" }, { value: "NO", label: "Sem comprovante" }],
        },
    ], [indexOf, receiptsByPayment]);

    // The order and filters chosen here follow the user to any device, like the hidden columns.
    const cf = useColumnFilters(payments, columns, { key: "due_on", dir: "asc" }, {
        storageKey: columnTableKey("investment-payments"),
        filtersKey: recordTableKey("investment-payments", investmentId),
    });
    const rows = cf.rows;
    const show = (key: string) => !vis.isHidden(key);
    const visibleCount = columns.filter(c => show(c.key)).length;

    const totals = useMemo(() => {
        const paid = rows.filter(r => r.status === "PAID");
        let pf = 0, pj = 0, unknown = 0;
        for (const r of paid) {
            const split = payerSplit(r);
            if (split) { pf += split.pf; pj += split.pj; } else unknown += paymentTotal(r);
        }
        return {
            paid: paid.reduce((s, r) => s + paymentTotal(r), 0),
            corrections: paid.reduce((s, r) => s + r.correction_amount, 0),
            planned: rows.filter(r => r.status === "PLANNED").reduce((s, r) => s + paymentTotal(r), 0),
            pf: round2(pf),
            pj: round2(pj),
            unknown: round2(unknown),
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

    const commitPj = async (row: InvestmentPayment) => {
        const pj = takeDraft(row.id, "pj");
        if (pj === null) return;
        await onPatch(row.id, { payer: "SPLIT", pj_amount: round2(Math.min(Math.max(pj, 0), paymentTotal(row))) });
    };

    const cancelDraft = (rowId: string, field: string) =>
        setDrafts(d => { const next = { ...d }; delete next[`${rowId}:${field}`]; return next; });

    /** The chip already knows what the bill should be: the contracted value, plus the correction the last payment of this kind carried. */
    const startFromInstalment = (inst: ScheduledInstalment) => {
        setDraft({
            ...emptyDraft(),
            due_on: inst.dueOn,
            paid_on: inst.dueOn,
            kind: inst.kind,
            amount: inst.contractedAmount,
            correction_amount: round2(inst.amount - inst.contractedAmount),
            notes: inst.label,
        });
        setError(null);
    };

    /** Stages a receipt and asks the reader what it says; a read that fails still leaves the file attached. */
    const readReceipt = async (file: File): Promise<ReadReceipt | { error: string }> => {
        const staged = await stageInvestmentFile(file);
        if ("error" in staged) return staged;
        let extracted: ExtractedReceipt | null = null;
        let readBy: ReadBy | null = null;
        try {
            const res = await fetch(`/api/investments/${investmentId}/receipts/extract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storage_path: staged.path }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.success) {
                extracted = json.receipt as ExtractedReceipt;
                readBy = readByFromJson(json.read_by);
            }
        } catch {
            // the receipt is still attached below; only the allocation is lost
        }
        return { path: staged.path, name: file.name.slice(0, 200), file, extracted, readBy };
    };

    const describe = (read: ReadReceipt[]): string => {
        const alloc = allocateFromReceipts(read.map(r => r.extracted).filter((r): r is ExtractedReceipt => r !== null));
        const parts = [
            alloc.pf > 0 ? `PF ${formatBRL(alloc.pf)}` : null,
            alloc.pj > 0 ? `PJ ${formatBRL(alloc.pj)}` : null,
            alloc.unattributed > 0 ? `${formatBRL(alloc.unattributed)} sem pagador identificado` : null,
        ].filter(Boolean);
        const unread = read.filter(r => r.extracted === null).length;
        // "pelo Gemini (gemini-3.5-flash)" — or both names when a batch fell back halfway
        const readers = [...new Set(read.map(r => readerLabel(r.readBy)).filter((l): l is string => l !== null))];
        const by = readers.length === 0 ? "" : ` pelo ${readers.join(" e pelo ")}`;
        return `${read.length === 1 ? "Comprovante lido" : `${read.length} comprovantes lidos`}${by}: ${parts.length ? parts.join(" · ") : "nenhum valor identificado"}${unread ? ` · ${unread} não ${unread === 1 ? "lido" : "lidos"}` : ""}. Confira e ajuste se preciso.`;
    };

    /** Receipts dropped on an existing row: attach every one, then let what they say update the row. */
    const attachToRow = async (row: InvestmentPayment, files: File[]) => {
        if (files.length === 0) return;
        setUploading(row.id);
        setError(null);
        setNotice(null);
        const read: ReadReceipt[] = [];
        for (const file of files) {
            const result = await readReceipt(file);
            if ("error" in result) { setError(result.error); break; }
            read.push(result);
            await fetch(`/api/investments/${investmentId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "RECEIPT", storage_path: result.path, file_name: result.name, mime_type: file.type, size_bytes: file.size, payment_id: row.id }),
            });
        }
        setUploading(null);
        if (read.length === 0) return;

        const current = { total: paymentTotal(row), payer: row.payer, pj: payerSplit(row)?.pj ?? 0 };
        const merged = mergeAllocation(current, read.map(r => r.extracted).filter((r): r is ExtractedReceipt => r !== null));
        if (merged) {
            await onPatch(row.id, {
                correction_amount: round2(merged.total - row.amount),
                payer: merged.payer,
                pj_amount: merged.pj_amount,
                ...(merged.paid_on ? { paid_on: merged.paid_on, status: "PAID" } : {}),
            });
        } else {
            await onRefresh();
        }
        setNotice(describe(read));
    };

    /** Receipts dropped on the new row: keep them staged, and let what they say fill the row in. */
    const attachToDraft = async (files: File[]) => {
        if (files.length === 0) return;
        setUploading("new");
        setError(null);
        setNotice(null);
        const read: ReadReceipt[] = [];
        for (const file of files) {
            const result = await readReceipt(file);
            if ("error" in result) { setError(result.error); break; }
            read.push(result);
        }
        setUploading(null);
        if (read.length === 0) return;

        setDraft(prev => {
            if (!prev) return prev;
            const current = { total: prev.amount + prev.correction_amount, payer: prev.payer, pj: prev.pj_amount ?? 0 };
            const merged = mergeAllocation(current, read.map(r => r.extracted).filter((r): r is ExtractedReceipt => r !== null));
            return {
                ...prev,
                receipt_paths: [...prev.receipt_paths, ...read.map(r => r.path)],
                receipt_names: [...prev.receipt_names, ...read.map(r => r.name)],
                ...(merged
                    ? {
                          correction_amount: round2(merged.total - prev.amount),
                          payer: merged.payer,
                          pj_amount: merged.pj_amount,
                          ...(merged.paid_on ? { paid_on: merged.paid_on, status: "PAID" as const } : {}),
                      }
                    : {}),
            };
        });
        setNotice(describe(read));
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
    /** Everything after "Valor pago", plus the trailing actions column. */
    const tailSpan = 1 + ["index_pct", "payer", "pj_amount", "notes", "receipt"].filter(show).length;

    const payerSelect = (value: Payer | null, onChange: (p: Payer | null) => void, label: string) => (
        <select
            value={value ?? ""}
            onChange={e => onChange((e.target.value || null) as Payer | null)}
            aria-label={label}
            className={cn(cellInput, "w-auto cursor-pointer")}
        >
            {PAYER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );

    const receiptList = (row: InvestmentPayment) => {
        const receipts = receiptsByPayment[row.id] ?? [];
        return (
            <span className="inline-flex items-center gap-2">
                {receipts.map((doc, i) => (
                    <button
                        key={doc.id}
                        type="button"
                        onClick={() => { if (doc.url && onView) onView(doc.url, doc.file_name ?? "Comprovante"); }}
                        disabled={!doc.url || !onView}
                        title={doc.file_name ?? "Comprovante"}
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                        <Eye className="w-3.5 h-3.5" /> {receipts.length > 1 ? i + 1 : "ver"}
                    </button>
                ))}
                <label className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer" title="Anexar um ou mais comprovantes; a IA lê o valor, a data e quem pagou">
                    {uploading === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : receipts.length > 0 ? <Plus className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                    <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="sr-only"
                        disabled={uploading !== null}
                        onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void attachToRow(row, files); }}
                    />
                    {receipts.length > 0 ? "" : "anexar"}
                </label>
            </span>
        );
    };

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Pagamentos</h2>
                    <p className="text-xs text-muted-foreground">
                        Um lançamento por parcela paga. Anexe os comprovantes: a IA lê o valor, a data e se pagou a PF ou a PJ.
                        Clique numa célula e ande com as setas; botão direito no cabeçalho esconde colunas.
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
                        <span className="ml-auto inline-flex rounded-full border border-border p-0.5 text-[11px]" role="group" aria-label="Qual ponta do plano mostrar">
                            {(["first", "last"] as const).map(order => (
                                <button
                                    key={order}
                                    type="button"
                                    onClick={() => setUpcomingOrder(order)}
                                    aria-pressed={upcomingOrder === order}
                                    title={order === "first" ? "As próximas a vencer" : "As últimas do plano — para antecipar do fim"}
                                    className={cn(
                                        "rounded-full px-2.5 py-0.5 transition-colors",
                                        upcomingOrder === order ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {order === "first" ? "Próximas" : "Últimas"}
                                </button>
                            ))}
                        </span>
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
                        <ul className={cn("mt-2 flex flex-wrap gap-2", showAllUpcoming && "max-h-56 overflow-y-auto pr-1")}>
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
                            {(filteredPending.length > upcoming.length || showAllUpcoming) && (
                                <li className="self-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowAllUpcoming(v => !v)}
                                        className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
                                    >
                                        {showAllUpcoming
                                            ? "mostrar menos"
                                            : `ver todas as ${filteredPending.length} (+${filteredPending.length - upcoming.length} ${upcomingOrder === "last" ? "antes" : "depois"})`}
                                    </button>
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
                    <table className="w-full text-xs [&_td]:whitespace-nowrap">
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2 w-px" />} />
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

                            {rows.map(row => {
                                const split = payerSplit(row);
                                return (
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
                                                    className={cn(cellInput, "w-auto cursor-pointer")}
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
                                                    className={cn(cellInput, "w-auto cursor-pointer")}
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
                                        {show("index_pct") && (() => {
                                            const idx = indexOf.get(row.id) ?? null;
                                            return (
                                                <td
                                                    {...sel.cellProps("index_pct", row.id, idx?.pct ?? null, cn("px-2 py-1 text-right tabular-nums", idx && idx.pct < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"))}
                                                    title={idx ? (idx.sinceContract ? "Sobre o valor de contrato: a correção acumulada até este pagamento" : "Sobre o pagamento anterior deste tipo, na ordem em que foram pagos") : undefined}
                                                >
                                                    {idx ? `${idx.pct > 0 ? "+" : ""}${idx.pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%${idx.sinceContract ? " *" : ""}` : "—"}
                                                </td>
                                            );
                                        })()}
                                        {show("payer") && (
                                            <td {...sel.cellProps("payer", row.id, null, "px-2 py-1")}>
                                                {payerSelect(row.payer, p => onPatch(row.id, { payer: p }), "Pagador")}
                                            </td>
                                        )}
                                        {show("pj_amount") && (
                                            <td
                                                {...sel.cellProps("pj_amount", row.id, split?.pj ?? null, "px-2 py-1 text-right", () => cancelDraft(row.id, "pj"))}
                                                title={row.payer === "SPLIT" ? `PF ${formatBRL(split?.pf ?? 0)} · PJ ${formatBRL(split?.pj ?? 0)}` : row.payer ? "Escolha PF + PJ no pagador para dividir" : "Informe o pagador"}
                                            >
                                                <MoneyInput
                                                    value={split?.pj ?? null}
                                                    draft={drafts[`${row.id}:pj`]}
                                                    onDraft={text => setDrafts(d => ({ ...d, [`${row.id}:pj`]: text }))}
                                                    onCommit={() => commitPj(row)}
                                                    disabled={row.payer !== "SPLIT"}
                                                    placeholder={row.payer === "PJ" ? formatBRL(paymentTotal(row)) : "—"}
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
                                                {receiptList(row)}
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
                                );
                            })}

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
                                            <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as PaymentKind })} aria-label="Tipo do novo lançamento" className={cn(cellInput, "w-auto cursor-pointer")}>
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
                                    {show("index_pct") && <td className="px-2 py-1 text-right text-muted-foreground">—</td>}
                                    {show("payer") && (
                                        <td className="px-2 py-1">
                                            {payerSelect(draft.payer, p => setDraft({ ...draft, payer: p, pj_amount: p === "SPLIT" ? draft.pj_amount : null }), "Pagador do novo lançamento")}
                                        </td>
                                    )}
                                    {show("pj_amount") && (
                                        <td className="px-2 py-1 text-right">
                                            <MoneyInput
                                                value={draft.payer === "SPLIT" ? draft.pj_amount : draft.payer === "PJ" ? draft.amount + draft.correction_amount : draft.payer === "PF" ? 0 : null}
                                                draft={drafts["new:pj"]}
                                                onDraft={text => setDrafts(d => ({ ...d, "new:pj": text }))}
                                                onCommit={() => {
                                                    const text = drafts["new:pj"];
                                                    setDrafts(d => { const next = { ...d }; delete next["new:pj"]; return next; });
                                                    if (text !== undefined) setDraft(prev => (prev ? { ...prev, payer: "SPLIT", pj_amount: parseMoneyText(text) ?? 0 } : prev));
                                                }}
                                                disabled={draft.payer !== "SPLIT"}
                                                placeholder="—"
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
                                                disabled={uploading !== null}
                                                title="Anexar um ou mais comprovantes; a IA lê o valor, a data e quem pagou"
                                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                                            >
                                                {uploading === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : draft.receipt_paths.length > 0 ? <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> : <Paperclip className="w-3.5 h-3.5" />}
                                                {draft.receipt_paths.length > 0 ? `${draft.receipt_paths.length} anexado${draft.receipt_paths.length === 1 ? "" : "s"}` : "anexar"}
                                            </button>
                                            <input
                                                ref={newFileRef}
                                                type="file"
                                                multiple
                                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                                className="sr-only"
                                                onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void attachToDraft(files); }}
                                            />
                                        </td>
                                    )}
                                    <td className="px-2 py-1">
                                        <div className="flex items-center gap-1 justify-end">
                                            <button type="button" onClick={save} disabled={saving || uploading !== null} title="Salvar" aria-label="Salvar lançamento" className="p-1 rounded text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50">
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            </button>
                                            <button type="button" onClick={() => { setDraft(null); setError(null); setNotice(null); }} title="Cancelar" aria-label="Cancelar" className="p-1 rounded text-muted-foreground hover:text-foreground">
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
                                    <td colSpan={tailSpan} className="px-2 py-2 text-[11px] font-normal text-muted-foreground whitespace-normal">
                                        {[
                                            totals.pf > 0 || totals.pj > 0 ? `PF ${formatBRL(totals.pf)} · PJ ${formatBRL(totals.pj)}` : null,
                                            totals.unknown > 0 ? `${formatBRL(totals.unknown)} sem pagador informado` : null,
                                            totals.planned > 0 ? `${formatBRL(totals.planned)} lançados como previstos` : null,
                                            show("index_pct") && rows.some(r => indexOf.get(r.id)?.sinceContract) ? "* índice acumulado desde o contrato" : null,
                                        ].filter(Boolean).join(" · ")}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {notice && (
                    <p
                        role="status"
                        aria-live="polite"
                        className="flex items-start gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
                    >
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="flex-1">{notice}</span>
                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            title="Fechar"
                            aria-label="Fechar aviso"
                            className="shrink-0 p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </p>
                )}
                {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>

            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} />
            <CellSumBar ctl={sel} />
        </section>
    );
}
