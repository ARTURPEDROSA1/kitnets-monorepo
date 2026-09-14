"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    Banknote,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    Hammer,
    Landmark,
    Loader2,
    PiggyBank,
    Plus,
    Receipt,
    Settings,
    Sun,
    Trash2,
    Upload,
    ChevronDown,
    ChevronUp,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Filter,
    FilterX,
    X,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PeriodFilter from "./PeriodFilter";
import { periodLabel, periodRange, type PeriodFilterValue } from "@/lib/period-filter";
import { parseSheet, type PropertyIncomeRow } from "@/lib/property-income";
import {
    buildTransactionImportRows,
    formatDateBR,
    KIND_GROUP,
    KIND_LABELS,
    solarPayback,
    summarizeInvestment,
    TRANSACTION_KINDS,
    type FinancingStatus,
    type FinancingSystem,
    type PropertyInvestment,
    type PropertyInvestmentInput,
    type PropertyTransaction,
    type TransactionInput,
    type TransactionKind,
} from "@/lib/property-investment";

interface Props {
    propertyId?: string;
    /** Confirmed income months feed the solar payback (net energy income). */
    incomeRows: PropertyIncomeRow[];
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toInput = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2));
const parseInput = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const COLLAPSED_ROWS = 24;
const FIN_KINDS: TransactionKind[] = ["PRESTACAO", "AMORTIZACAO", "QUITACAO"];

type TxDraft = Partial<Record<"date" | "kind" | "amount" | "interest" | "principal" | "insurance" | "comment", string>>;

export default function PropertyInvestmentSection({ propertyId, incomeRows }: Props) {
    const txEndpoint = propertyId ? `/api/properties/${propertyId}/transactions` : null;
    const invEndpoint = propertyId ? `/api/properties/${propertyId}/investment` : null;

    const [investment, setInvestment] = useState<PropertyInvestment | null>(null);
    const [txs, setTxs] = useState<PropertyTransaction[]>([]);
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Record<string, TxDraft>>({});
    const [showAll, setShowAll] = useState(false);

    // ── Excel-style column sort & filters ───────────────────────────────
    type SortCol = "date" | "kind" | "amount" | "interest" | "principal" | "insurance" | "comment";
    type NumCol = "amount" | "interest" | "principal" | "insurance";
    const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "date", dir: "desc" });
    const [kindFilter, setKindFilter] = useState<Set<TransactionKind> | null>(null);   // null = all kinds
    const [commentFilter, setCommentFilter] = useState("");
    const [numFilter, setNumFilter] = useState<Record<NumCol, { min: string; max: string }>>({
        amount: { min: "", max: "" }, interest: { min: "", max: "" }, principal: { min: "", max: "" }, insurance: { min: "", max: "" },
    });
    const [menu, setMenu] = useState<{ col: SortCol; x: number; y: number } | null>(null);
    const numOf = (t: PropertyTransaction, col: NumCol): number | null =>
        col === "amount" ? t.amount : col === "interest" ? t.interest_part : col === "principal" ? t.principal_part : t.insurance_part;
    const numActive = (col: NumCol) => numFilter[col].min.trim() !== "" || numFilter[col].max.trim() !== "";
    const filterActive = (col: SortCol) =>
        col === "kind" ? kindFilter !== null : col === "comment" ? commentFilter.trim() !== "" : col === "date" ? false : numActive(col);
    const anyFilter = kindFilter !== null || commentFilter.trim() !== "" || (["amount", "interest", "principal", "insurance"] as NumCol[]).some(numActive);
    const clearFilters = () => {
        setKindFilter(null);
        setCommentFilter("");
        setNumFilter({ amount: { min: "", max: "" }, interest: { min: "", max: "" }, principal: { min: "", max: "" }, insurance: { min: "", max: "" } });
    };
    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: "all" });

    const flash = (msg: string) => {
        setNotice(msg);
        window.setTimeout(() => setNotice(null), 8000);
    };

    // ── Load ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!txEndpoint || !invEndpoint) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([fetch(txEndpoint), fetch(invEndpoint)])
            .then(async ([a, b]) => {
                const ta = await a.json().catch(() => ({}));
                const tb = await b.json().catch(() => ({}));
                if (!a.ok) throw new Error(ta.error || "Erro ao carregar lançamentos");
                if (!b.ok) throw new Error(tb.error || "Erro ao carregar investimento");
                if (!cancelled) { setTxs(ta.rows ?? []); setInvestment(tb.investment ?? null); }
            })
            .catch(err => { if (!cancelled) setError((err as Error).message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [txEndpoint, invEndpoint]);

    // ── Persist ─────────────────────────────────────────────────────────
    const putTxs = useCallback(async (rows: TransactionInput[], replace = false, keys: string[] = []) => {
        if (!txEndpoint) return false;
        setSaving(prev => new Set([...prev, ...keys]));
        setError(null);
        try {
            const res = await fetch(txEndpoint, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows, replace }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao salvar");
            setTxs(data.rows ?? []);
            setDrafts(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
            return true;
        } catch (err) {
            setError((err as Error).message);
            return false;
        } finally {
            setSaving(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
        }
    }, [txEndpoint]);

    const deleteTx = async (tx: PropertyTransaction) => {
        if (!txEndpoint) return;
        if (!window.confirm(`Excluir o lançamento de ${formatDateBR(tx.occurred_on)} (${KIND_LABELS[tx.kind]} ${formatBRL(tx.amount)})?`)) return;
        setSaving(prev => new Set([...prev, tx.id]));
        try {
            const res = await fetch(`${txEndpoint}?id=${tx.id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao excluir");
            setTxs(prev => prev.filter(t => t.id !== tx.id));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(prev => { const n = new Set(prev); n.delete(tx.id); return n; });
        }
    };

    // ── Inline editing ──────────────────────────────────────────────────
    const setDraft = (id: string, field: keyof TxDraft, value: string) =>
        setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

    const commit = (tx: PropertyTransaction, field: keyof TxDraft) => {
        const raw = drafts[tx.id]?.[field];
        if (raw === undefined) return;
        const clear = () => setDrafts(prev => { const n = { ...prev, [tx.id]: { ...prev[tx.id] } }; delete n[tx.id][field]; return n; });
        const next: TransactionInput = {
            id: tx.id, occurred_on: tx.occurred_on, kind: tx.kind, amount: tx.amount,
            interest_part: tx.interest_part, principal_part: tx.principal_part, insurance_part: tx.insurance_part,
            comment: tx.comment, source: tx.source,
        };
        if (field === "date") {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw === tx.occurred_on) return clear();
            next.occurred_on = raw;
        } else if (field === "kind") {
            if (raw === tx.kind) return clear();
            next.kind = raw as TransactionKind;
        } else if (field === "comment") {
            const c = raw.trim() ? raw.trim().slice(0, 500) : null;
            if (c === (tx.comment ?? null)) return clear();
            next.comment = c;
        } else {
            const v = parseInput(raw);
            const key = field === "amount" ? "amount" : field === "interest" ? "interest_part" : field === "principal" ? "principal_part" : "insurance_part";
            if (key === "amount") {
                if (v === null || v === tx.amount) return clear();
                next.amount = v;
            } else {
                if (v === (tx[key] ?? null)) return clear();
                next[key] = v;
            }
        }
        void putTxs([next], false, [tx.id]);
    };

    // ── Derived ─────────────────────────────────────────────────────────
    const summary = useMemo(() => summarizeInvestment(txs, investment), [txs, investment]);
    const solar = useMemo(() => solarPayback(summary.solarInvested, incomeRows), [summary.solarInvested, incomeRows]);
    const range = useMemo(() => periodRange(period), [period]);
    /** Rows inside the period (before column filters) — used for the kind counts in the Tipo menu. */
    const inPeriod = useMemo(
        () => txs.filter(t => {
            const k = t.occurred_on.slice(0, 7);
            return (!range.start || k >= range.start) && (!range.end || k <= range.end);
        }),
        [txs, range]
    );
    const kindCounts = useMemo(() => {
        const m = new Map<TransactionKind, number>();
        inPeriod.forEach(t => m.set(t.kind, (m.get(t.kind) ?? 0) + 1));
        return m;
    }, [inPeriod]);
    const filtered = useMemo(() => {
        const q = commentFilter.trim().toLowerCase();
        const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
        const rows = inPeriod.filter(t => {
            if (kindFilter && !kindFilter.has(t.kind)) return false;
            if (q && !(t.comment ?? "").toLowerCase().includes(q)) return false;
            for (const col of ["amount", "interest", "principal", "insurance"] as NumCol[]) {
                const min = num(numFilter[col].min), max = num(numFilter[col].max);
                if (min === null && max === null) continue;
                const v = numOf(t, col);
                if (v === null) return false;
                if (min !== null && v < min) return false;
                if (max !== null && v > max) return false;
            }
            return true;
        });
        const dir = sort.dir === "asc" ? 1 : -1;
        const cmp = (a: PropertyTransaction, b: PropertyTransaction): number => {
            switch (sort.col) {
                case "date": return a.occurred_on.localeCompare(b.occurred_on) || (a.created_at ?? "").localeCompare(b.created_at ?? "");
                case "kind": return KIND_LABELS[a.kind].localeCompare(KIND_LABELS[b.kind], "pt-BR");
                case "comment": return (a.comment ?? "").localeCompare(b.comment ?? "", "pt-BR");
                default: {
                    const va = numOf(a, sort.col), vb = numOf(b, sort.col);
                    if (va === null && vb === null) return 0;
                    if (va === null) return 1 * dir;   // nulls last either way
                    if (vb === null) return -1 * dir;
                    return va - vb;
                }
            }
        };
        return rows.sort((a, b) => cmp(a, b) * dir);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inPeriod, kindFilter, commentFilter, numFilter, sort]);
    const filteredTotal = useMemo(() => filtered.reduce((a, t) => a + t.amount, 0), [filtered]);
    const visible = showAll ? filtered : filtered.slice(0, COLLAPSED_ROWS);

    // ── Config dialog (acquisition + financing) ─────────────────────────
    const [configOpen, setConfigOpen] = useState(false);
    const [cfg, setCfg] = useState<Record<string, string>>({});
    const [savingCfg, setSavingCfg] = useState(false);
    const openConfig = () => {
        const i = investment;
        setCfg({
            purchase_price: toInput(i?.purchase_price ?? null),
            acquired_on: i?.acquired_on ?? "",
            built_area_m2: toInput(i?.built_area_m2 ?? null),
            lender: i?.lender ?? "",
            contract_number: i?.contract_number ?? "",
            financing_system: i?.financing_system ?? "SAC",
            principal: toInput(i?.principal ?? null),
            annual_rate: i?.annual_rate === null || i?.annual_rate === undefined ? "" : String(i.annual_rate),
            term_months: i?.term_months ? String(i.term_months) : "",
            contract_date: i?.contract_date ?? "",
            first_due_date: i?.first_due_date ?? "",
            financing_status: i?.financing_status ?? "NONE",
            paid_off_on: i?.paid_off_on ?? "",
            notes: i?.notes ?? "",
        });
        setConfigOpen(true);
    };
    const saveConfig = async () => {
        if (!invEndpoint) return;
        setSavingCfg(true);
        setError(null);
        const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
        const body: PropertyInvestmentInput = {
            purchase_price: num(cfg.purchase_price) ?? 0,
            acquired_on: cfg.acquired_on || null,
            built_area_m2: num(cfg.built_area_m2),
            lender: cfg.lender || null,
            contract_number: cfg.contract_number || null,
            financing_system: cfg.financing_status === "NONE" ? null : (cfg.financing_system as FinancingSystem),
            principal: num(cfg.principal),
            annual_rate: num(cfg.annual_rate),
            term_months: cfg.term_months.trim() === "" ? null : Number(cfg.term_months),
            contract_date: cfg.contract_date || null,
            first_due_date: cfg.first_due_date || null,
            financing_status: cfg.financing_status as FinancingStatus,
            paid_off_on: cfg.financing_status === "PAID_OFF" ? cfg.paid_off_on || null : null,
            notes: cfg.notes || null,
        };
        try {
            const res = await fetch(invEndpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao salvar");
            setInvestment(data.investment ?? null);
            setConfigOpen(false);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSavingCfg(false);
        }
    };

    // ── Add dialog ──────────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [add, setAdd] = useState({ date: todayIso(), kind: "PRESTACAO" as TransactionKind, amount: "", interest: "", principal: "", insurance: "", comment: "" });
    const [addingTx, setAddingTx] = useState(false);
    const submitAdd = async () => {
        const amount = parseInput(add.amount);
        if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(add.date)) return;
        setAddingTx(true);
        const ok = await putTxs([{
            occurred_on: add.date, kind: add.kind, amount,
            interest_part: FIN_KINDS.includes(add.kind) ? parseInput(add.interest) : null,
            principal_part: FIN_KINDS.includes(add.kind) ? parseInput(add.principal) : null,
            insurance_part: FIN_KINDS.includes(add.kind) ? parseInput(add.insurance) : null,
            comment: add.comment.trim() || null, source: "MANUAL",
        }]);
        setAddingTx(false);
        if (ok) { setAddOpen(false); setAdd(a => ({ ...a, amount: "", interest: "", principal: "", insurance: "", comment: "" })); }
    };

    // ── Import dialog ───────────────────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importRows, setImportRows] = useState<TransactionInput[]>([]);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [importFatal, setImportFatal] = useState<string | null>(null);
    const [parsingFile, setParsingFile] = useState(false);
    const [importing, setImporting] = useState(false);
    const [replaceAll, setReplaceAll] = useState(true);
    const openImport = () => { setImportRows([]); setImportErrors([]); setImportFatal(null); setReplaceAll(true); setImportOpen(true); };
    const loadText = (text: string) => {
        const { rows, errors } = buildTransactionImportRows(parseSheet(text));
        setImportRows(rows);
        setImportErrors(errors);
        setImportFatal(rows.length === 0 && errors.length === 0 ? "Nenhum lançamento reconhecido: a planilha precisa das colunas Data, Tipo e Valor." : null);
    };
    const onImportFile = async (file: File | null) => {
        if (!file || !txEndpoint) return;
        setImportFatal(null);
        if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
            const reader = new FileReader();
            reader.onload = () => loadText(String(reader.result ?? ""));
            reader.readAsText(file, "utf-8");
            return;
        }
        setParsingFile(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${txEndpoint}/parse`, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Não foi possível ler a planilha");
            loadText(String(data.text ?? ""));
        } catch (err) {
            setImportFatal((err as Error).message);
        } finally {
            setParsingFile(false);
        }
    };
    const runImport = async () => {
        if (importRows.length === 0) return;
        setImporting(true);
        const ok = await putTxs(importRows, replaceAll);
        setImporting(false);
        if (ok) { setImportOpen(false); flash(`${importRows.length} lançamentos importados${replaceAll ? " · registro anterior substituído" : ""}`); }
    };

    // ── Export ──────────────────────────────────────────────────────────
    const [exporting, setExporting] = useState<"template" | "ledger" | null>(null);
    const exportXlsx = async (kind: "template" | "ledger") => {
        if (!txEndpoint) return;
        setExporting(kind);
        setError(null);
        try {
            const res = await fetch(`${txEndpoint}/template${kind === "ledger" ? "?fill=ledger" : ""}`);
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Erro ao gerar a planilha"); }
            const blob = await res.blob();
            const match = (res.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = match?.[1] ?? "kitnets-investimento.xlsx";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setExporting(null);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────
    if (!propertyId) {
        return (
            <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-sm text-muted-foreground flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                Salve o cadastro deste imóvel para registrar o investimento.
            </div>
        );
    }

    const financingLabel = investment?.financing_status === "PAID_OFF"
        ? `Quitado${investment.paid_off_on ? ` em ${formatDateBR(investment.paid_off_on)}` : ""}`
        : investment?.financing_status === "ACTIVE" ? "Ativo" : "Sem financiamento";
    const financingHint = investment && investment.financing_status !== "NONE"
        ? [investment.lender, investment.financing_system, investment.principal ? formatBRL(investment.principal) : null, investment.term_months ? `${investment.term_months} meses` : null, investment.annual_rate ? `${investment.annual_rate}% a.a.` : null].filter(Boolean).join(" · ")
        : "Configure a aquisição e o financiamento";

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <PiggyBank className="w-4 h-4 text-emerald-600" />
                        Investimento no imóvel
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Tudo o que você pagou: entrada, custos de aquisição, prestações e amortizações do financiamento, reformas e custos do imóvel.
                        A energia solar é um investimento à parte, recuperado pela receita líquida de energia.
                        {investment?.purchase_price ? ` Valor de compra ${formatBRL(investment.purchase_price)}${investment.acquired_on ? ` em ${formatDateBR(investment.acquired_on)}` : ""}.` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={openConfig} className="gap-1.5 text-xs">
                        <Settings className="w-3.5 h-3.5" /> Aquisição & financiamento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportXlsx("template")} disabled={exporting !== null} className="gap-1.5 text-xs">
                        {exporting === "template" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar modelo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportXlsx("ledger")} disabled={exporting !== null || txs.length === 0} className="gap-1.5 text-xs">
                        {exporting === "ledger" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Exportar registro
                    </Button>
                    <Button size="sm" variant="outline" onClick={openImport} className="gap-1.5 text-xs">
                        <Upload className="w-3.5 h-3.5" /> Importar planilha
                    </Button>
                    <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-3.5 h-3.5" /> Adicionar lançamento
                    </Button>
                </div>
            </div>

            {error && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}
            {notice && (
                <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {notice}
                </div>
            )}

            {/* Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <Tile label="Total investido no imóvel" value={formatBRL(summary.invested)} tone="emerald" icon={<PiggyBank className="w-4 h-4" />}
                    hint={<>Entrada {formatBRL(summary.downPayment)} · aquisição {formatBRL(summary.closingCosts)}<br />Banco {formatBRL(summary.bankPaid)} · reformas {formatBRL(summary.capex)}</>} />
                <Tile label="Pago ao banco" value={formatBRL(summary.bankPaid)} tone="blue" icon={<Landmark className="w-4 h-4" />}
                    hint={<>{summary.installments} prestações<br />Juros + seguros {summary.interestAndInsurance === null ? "—" : formatBRL(summary.interestAndInsurance)}</>} />
                <Tile label="Reformas (capex)" value={formatBRL(summary.capex)} tone="violet" icon={<Hammer className="w-4 h-4" />}
                    hint={`${txs.filter(t => t.kind === "REFORMA").length} lançamentos`} />
                <Tile label="Custos do imóvel" value={formatBRL(summary.runningCosts)} tone="rose" icon={<Receipt className="w-4 h-4" />}
                    hint={<>IPTU {formatBRL(summary.byKind.IPTU)} · utilidades {formatBRL(summary.byKind.UTILIDADES)}<br />Tarifas {formatBRL(summary.byKind.TARIFA)} · outros {formatBRL(summary.byKind.OUTROS)}</>} />
                <Tile label="Financiamento" value={financingLabel} tone="blue" icon={<Banknote className="w-4 h-4" />} hint={financingHint} />
                <Tile label="Energia solar" value={formatBRL(solar.invested)} tone="amber" icon={<Sun className="w-4 h-4" />}
                    hint={
                        <>
                            Recuperado {formatBRL(solar.recovered)} ({solar.pct}%)<br />
                            {solar.invested > 0 ? (solar.remaining > 0 ? `Falta ${formatBRL(solar.remaining)}` : "Investimento recuperado") : "Sem investimento registrado"}
                            {solar.invested > 0 && (
                                <span className="block mt-1 h-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 overflow-hidden">
                                    <span className="block h-full bg-amber-500" style={{ width: `${Math.min(100, solar.pct)}%` }} />
                                </span>
                            )}
                        </>
                    } />
            </div>

            {/* Period + table */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    Lançamentos · <span className="font-semibold text-foreground">{periodLabel(period)}</span> · {filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}{anyFilter && inPeriod.length !== filtered.length ? ` de ${inPeriod.length}` : ""} · total {formatBRL(filteredTotal)}
                    {summary.totalOutlay > 0 && <> · desembolso total {formatBRL(summary.totalOutlay)}</>}
                </span>
                <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            {/* Active column filters */}
            {anyFilter && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    {kindFilter && (
                        <Chip label={`Tipo: ${Array.from(kindFilter).map(k => KIND_LABELS[k]).join(", ") || "nenhum"}`} onClear={() => setKindFilter(null)} />
                    )}
                    {commentFilter.trim() && <Chip label={`Comentários contém “${commentFilter.trim()}”`} onClear={() => setCommentFilter("")} />}
                    {(["amount", "interest", "principal", "insurance"] as NumCol[]).filter(numActive).map(col => (
                        <Chip key={col}
                            label={`${{ amount: "Valor", interest: "Juros", principal: "Amortização", insurance: "Seguro" }[col]}: ${numFilter[col].min.trim() ? `≥ ${numFilter[col].min}` : ""}${numFilter[col].min.trim() && numFilter[col].max.trim() ? " e " : ""}${numFilter[col].max.trim() ? `≤ ${numFilter[col].max}` : ""}`}
                            onClear={() => setNumFilter(f => ({ ...f, [col]: { min: "", max: "" } }))} />
                    ))}
                    <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1">
                        <FilterX className="w-3.5 h-3.5" /> Limpar filtros
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : txs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum lançamento. Importe a planilha de investimento ou adicione a entrada e as prestações.
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    {anyFilter ? (
                        <>Nenhum lançamento com os filtros atuais. <button type="button" onClick={clearFilters} className="underline underline-offset-2">Limpar filtros</button></>
                    ) : "Nenhum lançamento no período selecionado."}
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[980px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                {([
                                    ["date", "Data", "left"], ["kind", "Tipo", "left"], ["amount", "Valor", "right"], ["interest", "Juros", "right"],
                                    ["principal", "Amortização", "right"], ["insurance", "Seguro", "right"], ["comment", "Comentários", "left"],
                                ] as [SortCol, string, "left" | "right"][]).map(([col, label, align]) => {
                                    const sorted = sort.col === col;
                                    const active = filterActive(col);
                                    return (
                                        <th key={col} className={cn("px-2 py-2 font-semibold", align === "right" ? "text-right" : "text-left")}>
                                            <button
                                                type="button"
                                                onClick={e => {
                                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                    setMenu(m => (m?.col === col ? null : { col, x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 4 }));
                                                }}
                                                title="Ordenar e filtrar"
                                                className={cn("inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted hover:text-foreground transition-colors uppercase",
                                                    (sorted || active) && "text-foreground", align === "right" && "flex-row-reverse")}
                                            >
                                                <span>{label}</span>
                                                {sorted ? (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                                                {active && <Filter className="w-3 h-3 text-emerald-600" />}
                                            </button>
                                        </th>
                                    );
                                })}
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(tx => {
                                const d = drafts[tx.id] ?? {};
                                const busy = saving.has(tx.id);
                                const isFin = FIN_KINDS.includes(tx.kind);
                                const money = (field: "amount" | "interest" | "principal" | "insurance", value: number | null, enabled = true) => (
                                    <input
                                        type="number" inputMode="decimal" step="0.01" min={0}
                                        disabled={busy || !enabled}
                                        value={d[field] ?? toInput(value)}
                                        placeholder={enabled ? "" : "—"}
                                        onChange={e => setDraft(tx.id, field, e.target.value)}
                                        onBlur={() => commit(tx, field)}
                                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                        className={cn("w-24 text-right bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none tabular-nums disabled:opacity-40", field === "amount" && "font-semibold text-foreground")}
                                    />
                                );
                                return (
                                    <tr key={tx.id} className="border-b border-border/60 hover:bg-muted/30">
                                        <td className="px-2 py-1 whitespace-nowrap">
                                            <input type="date" disabled={busy} value={d.date ?? tx.occurred_on}
                                                onChange={e => setDraft(tx.id, "date", e.target.value)} onBlur={() => commit(tx, "date")}
                                                className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1 py-1 outline-none" />
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        <td className="px-2 py-1">
                                            <select disabled={busy} value={d.kind ?? tx.kind}
                                                onChange={e => { setDraft(tx.id, "kind", e.target.value); }}
                                                onBlur={() => commit(tx, "kind")}
                                                className={cn("bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1 py-1 outline-none",
                                                    KIND_GROUP[tx.kind] === "FINANCIAMENTO" && "text-blue-700 dark:text-blue-400",
                                                    KIND_GROUP[tx.kind] === "CAPEX" && "text-violet-700 dark:text-violet-400",
                                                    KIND_GROUP[tx.kind] === "ENERGIA" && "text-amber-700 dark:text-amber-400",
                                                    KIND_GROUP[tx.kind] === "CUSTOS" && "text-rose-700 dark:text-rose-400")}>
                                                {TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-2 py-1 text-right">{money("amount", tx.amount)}</td>
                                        <td className="px-2 py-1 text-right">{money("interest", tx.interest_part, isFin)}</td>
                                        <td className="px-2 py-1 text-right">{money("principal", tx.principal_part, isFin)}</td>
                                        <td className="px-2 py-1 text-right">{money("insurance", tx.insurance_part, isFin)}</td>
                                        <td className="px-2 py-1">
                                            <input type="text" disabled={busy} value={d.comment ?? (tx.comment ?? "")} placeholder="—"
                                                onChange={e => setDraft(tx.id, "comment", e.target.value)} onBlur={() => commit(tx, "comment")}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                className="w-56 bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none truncate" />
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <button type="button" disabled={busy} onClick={() => deleteTx(tx)} title="Excluir"
                                                className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length > COLLAPSED_ROWS && (
                        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 mx-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                            {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {showAll ? `Mostrar apenas os últimos ${COLLAPSED_ROWS}` : `Mostrar todos os ${filtered.length} lançamentos`}
                        </button>
                    )}
                </div>
            )}

            {/* Column menu (sort + filter), positioned at the clicked header; fixed so the scrolling table never clips it */}
            {menu && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                    <div className="fixed z-[61] w-64 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-2 text-xs space-y-1" style={{ left: menu.x, top: menu.y }}>
                        {(() => {
                            const col = menu.col;
                            const isNum = col === "amount" || col === "interest" || col === "principal" || col === "insurance";
                            const ascLabel = col === "date" ? "Mais antigo primeiro" : isNum ? "Menor → maior" : "A → Z";
                            const descLabel = col === "date" ? "Mais recente primeiro" : isNum ? "Maior → menor" : "Z → A";
                            const sortBtn = (dir: "asc" | "desc", label: string, Icon: typeof ArrowUp) => (
                                <button type="button" onClick={() => { setSort({ col, dir }); setMenu(null); }}
                                    className={cn("w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted", sort.col === col && sort.dir === dir && "bg-muted font-semibold")}>
                                    <Icon className="w-3.5 h-3.5" /> {label}
                                </button>
                            );
                            return (
                                <>
                                    {sortBtn("asc", ascLabel, ArrowUp)}
                                    {sortBtn("desc", descLabel, ArrowDown)}
                                    {col !== "date" && <div className="border-t border-border my-1" />}
                                    {col === "kind" && (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                                <span>Filtrar por tipo</span>
                                                <span className="space-x-2">
                                                    <button type="button" className="hover:text-foreground" onClick={() => setKindFilter(null)}>todos</button>
                                                    <button type="button" className="hover:text-foreground" onClick={() => setKindFilter(new Set())}>nenhum</button>
                                                </span>
                                            </div>
                                            <div className="max-h-56 overflow-y-auto">
                                                {TRANSACTION_KINDS.map(k => {
                                                    const checked = kindFilter === null || kindFilter.has(k.kind);
                                                    const count = kindCounts.get(k.kind) ?? 0;
                                                    return (
                                                        <label key={k.kind} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted cursor-pointer", count === 0 && "opacity-50")}>
                                                            <input type="checkbox" className="accent-emerald-600" checked={checked}
                                                                onChange={e => setKindFilter(prev => {
                                                                    const next = new Set(prev ?? TRANSACTION_KINDS.map(x => x.kind));
                                                                    if (e.target.checked) next.add(k.kind); else next.delete(k.kind);
                                                                    return next.size === TRANSACTION_KINDS.length ? null : next;
                                                                })} />
                                                            <span className="flex-1">{k.label}</span>
                                                            <span className="text-muted-foreground tabular-nums">{count}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {col === "comment" && (
                                        <div className="px-2 py-1 space-y-1">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contém o texto</div>
                                            <input autoFocus type="text" value={commentFilter} onChange={e => setCommentFilter(e.target.value)} placeholder="Ex: reforma, calha…"
                                                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
                                        </div>
                                    )}
                                    {isNum && (
                                        <div className="px-2 py-1 space-y-1">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Faixa de valores (R$)</div>
                                            <div className="flex items-center gap-1.5">
                                                <input type="number" step="0.01" min={0} placeholder="mín." value={numFilter[col].min}
                                                    onChange={e => setNumFilter(f => ({ ...f, [col]: { ...f[col], min: e.target.value } }))}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
                                                <span className="text-muted-foreground">a</span>
                                                <input type="number" step="0.01" min={0} placeholder="máx." value={numFilter[col].max}
                                                    onChange={e => setNumFilter(f => ({ ...f, [col]: { ...f[col], max: e.target.value } }))}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
                                            </div>
                                        </div>
                                    )}
                                    {filterActive(col) && (
                                        <button type="button"
                                            onClick={() => {
                                                if (col === "kind") setKindFilter(null);
                                                else if (col === "comment") setCommentFilter("");
                                                else if (isNum) setNumFilter(f => ({ ...f, [col]: { min: "", max: "" } }));
                                            }}
                                            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted text-muted-foreground">
                                            <X className="w-3.5 h-3.5" /> Limpar filtro desta coluna
                                        </button>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </>
            )}

            {/* Config dialog */}
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Settings className="w-5 h-5 text-emerald-600" /> Aquisição & financiamento</DialogTitle>
                        <DialogDescription>Dados do contrato de compra e do financiamento. Entrada e custos de aquisição entram como lançamentos.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Valor de compra (R$)"><Input type="number" step="0.01" min={0} value={cfg.purchase_price ?? ""} onChange={e => setCfg(c => ({ ...c, purchase_price: e.target.value }))} /></Field>
                            <Field label="Data da compra"><Input type="date" value={cfg.acquired_on ?? ""} onChange={e => setCfg(c => ({ ...c, acquired_on: e.target.value }))} /></Field>
                            <Field label="Área construída (m²)"><Input type="number" step="0.01" min={0} value={cfg.built_area_m2 ?? ""} onChange={e => setCfg(c => ({ ...c, built_area_m2: e.target.value }))} /></Field>
                            <Field label="Financiamento">
                                <select value={cfg.financing_status ?? "NONE"} onChange={e => setCfg(c => ({ ...c, financing_status: e.target.value }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    <option value="NONE">Sem financiamento</option>
                                    <option value="ACTIVE">Ativo</option>
                                    <option value="PAID_OFF">Quitado</option>
                                </select>
                            </Field>
                        </div>
                        {cfg.financing_status !== "NONE" && (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Banco"><Input value={cfg.lender ?? ""} onChange={e => setCfg(c => ({ ...c, lender: e.target.value }))} placeholder="Ex: Bradesco" /></Field>
                                <Field label="Nº do contrato"><Input value={cfg.contract_number ?? ""} onChange={e => setCfg(c => ({ ...c, contract_number: e.target.value }))} /></Field>
                                <Field label="Sistema">
                                    <select value={cfg.financing_system ?? "SAC"} onChange={e => setCfg(c => ({ ...c, financing_system: e.target.value }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                        <option value="SAC">SAC</option><option value="PRICE">PRICE</option><option value="OTHER">Outro</option>
                                    </select>
                                </Field>
                                <Field label="Valor financiado (R$)"><Input type="number" step="0.01" min={0} value={cfg.principal ?? ""} onChange={e => setCfg(c => ({ ...c, principal: e.target.value }))} /></Field>
                                <Field label="Juros nominal (% a.a.)"><Input type="number" step="0.01" min={0} value={cfg.annual_rate ?? ""} onChange={e => setCfg(c => ({ ...c, annual_rate: e.target.value }))} /></Field>
                                <Field label="Prazo (meses)"><Input type="number" step="1" min={1} value={cfg.term_months ?? ""} onChange={e => setCfg(c => ({ ...c, term_months: e.target.value }))} /></Field>
                                <Field label="Data do contrato"><Input type="date" value={cfg.contract_date ?? ""} onChange={e => setCfg(c => ({ ...c, contract_date: e.target.value }))} /></Field>
                                <Field label="1ª prestação"><Input type="date" value={cfg.first_due_date ?? ""} onChange={e => setCfg(c => ({ ...c, first_due_date: e.target.value }))} /></Field>
                                {cfg.financing_status === "PAID_OFF" && (
                                    <Field label="Quitado em"><Input type="date" value={cfg.paid_off_on ?? ""} onChange={e => setCfg(c => ({ ...c, paid_off_on: e.target.value }))} /></Field>
                                )}
                            </div>
                        )}
                        <Field label="Observações"><Input value={cfg.notes ?? ""} onChange={e => setCfg(c => ({ ...c, notes: e.target.value }))} placeholder="Opcional" /></Field>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setConfigOpen(false)}>Cancelar</Button>
                        <Button onClick={saveConfig} disabled={savingCfg} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {savingCfg && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-emerald-600" /> Adicionar lançamento</DialogTitle>
                        <DialogDescription>Um pagamento feito por você relacionado ao imóvel.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Data"><Input type="date" value={add.date} onChange={e => setAdd(a => ({ ...a, date: e.target.value }))} /></Field>
                            <Field label="Tipo">
                                <select value={add.kind} onChange={e => setAdd(a => ({ ...a, kind: e.target.value as TransactionKind }))} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                    {TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                </select>
                            </Field>
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-2">{TRANSACTION_KINDS.find(k => k.kind === add.kind)?.hint}</p>
                        <Field label="Valor (R$)"><Input type="number" step="0.01" min={0} placeholder="Ex: 3850.04" value={add.amount} onChange={e => setAdd(a => ({ ...a, amount: e.target.value }))} /></Field>
                        {FIN_KINDS.includes(add.kind) && (
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Juros (R$)"><Input type="number" step="0.01" min={0} value={add.interest} onChange={e => setAdd(a => ({ ...a, interest: e.target.value }))} /></Field>
                                <Field label="Amortização (R$)"><Input type="number" step="0.01" min={0} value={add.principal} onChange={e => setAdd(a => ({ ...a, principal: e.target.value }))} /></Field>
                                <Field label="Seguro (R$)"><Input type="number" step="0.01" min={0} value={add.insurance} onChange={e => setAdd(a => ({ ...a, insurance: e.target.value }))} /></Field>
                            </div>
                        )}
                        <Field label="Comentários"><Input value={add.comment} placeholder="Opcional" onChange={e => setAdd(a => ({ ...a, comment: e.target.value }))} /></Field>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
                        <Button onClick={submitAdd} disabled={addingTx || parseInput(add.amount) === null} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {addingTx && <Loader2 className="w-4 h-4 animate-spin" />} Salvar lançamento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import dialog */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-emerald-600" /> Importar planilha de investimento</DialogTitle>
                        <DialogDescription>
                            Envie o modelo Excel preenchido (botão “Exportar modelo”) ou um CSV/TSV com as colunas Data, Tipo, Valor e, opcionalmente, Juros, Amortização, Seguro e Comentários.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <Field label="Arquivo (.xlsx do modelo, .csv, .tsv ou .txt)">
                            <Input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt" disabled={parsingFile} onChange={e => onImportFile(e.target.files?.[0] ?? null)} />
                            {parsingFile && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Lendo a planilha…</span>}
                        </Field>
                        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input type="checkbox" className="mt-0.5 accent-emerald-600" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} />
                            <span><span className="font-semibold text-foreground">Substituir todos os lançamentos existentes</span> — a planilha passa a ser o registro completo. Desmarque para apenas acrescentar.</span>
                        </label>
                        {importFatal && <div className="text-xs text-rose-600 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {importFatal}</div>}
                        {importErrors.length > 0 && (
                            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 space-y-0.5">
                                <div className="font-semibold">{importErrors.length} linha(s) ignorada(s):</div>
                                {importErrors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}
                                {importErrors.length > 8 && <div>…</div>}
                            </div>
                        )}
                        {importRows.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{importRows.length} lançamentos</span> reconhecidos ({formatDateBR(importRows[0].occurred_on)} → {formatDateBR(importRows[importRows.length - 1].occurred_on)}) · total {formatBRL(importRows.reduce((a, r) => a + r.amount, 0))}
                                </p>
                                <div className="overflow-x-auto border border-border rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr>
                                            <th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Tipo</th><th className="text-right px-2 py-1">Valor</th><th className="text-left px-2 py-1">Comentários</th>
                                        </tr></thead>
                                        <tbody>
                                            {importRows.slice(-6).reverse().map((r, i) => (
                                                <tr key={i} className="border-t border-border/60">
                                                    <td className="px-2 py-1 font-semibold">{formatDateBR(r.occurred_on)}</td>
                                                    <td className="px-2 py-1">{KIND_LABELS[r.kind]}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{formatBRL(r.amount)}</td>
                                                    <td className="px-2 py-1 truncate max-w-[220px]">{r.comment ?? ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Fechar</Button>
                        <Button onClick={runImport} disabled={importing || importRows.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {importing && <Loader2 className="w-4 h-4 animate-spin" />} Importar {importRows.length > 0 ? `${importRows.length} lançamentos` : ""}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 px-2 py-0.5">
            {label}
            <button type="button" onClick={onClear} className="hover:text-foreground" title="Remover filtro"><X className="w-3 h-3" /></button>
        </span>
    );
}

function Tile({ label, value, hint, icon, tone }: { label: string; value: string; hint: React.ReactNode; icon: React.ReactNode; tone: "emerald" | "blue" | "violet" | "amber" | "rose" }) {
    const tones = {
        emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
        blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
        violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
        amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
        rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    } as const;
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1 flex flex-col">
            <div className="flex items-start justify-between gap-2 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{label}</span>
                <span className={cn("p-1.5 rounded-lg shrink-0", tones[tone])}>{icon}</span>
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums leading-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
        </div>
    );
}
