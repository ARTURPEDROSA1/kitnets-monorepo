"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    Calculator,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PeriodFilter from "./PeriodFilter";
import Tile, { type TileInfo } from "./Tile";
import { CellSumBar, useCellSum } from "./TableCellSum";
import MoneyInput, { parseMoneyText } from "./MoneyInput";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "./TableColumnFilters";
import { columnTableKey } from "@/lib/ui-preferences";
import { monthsBetween, periodLabel, periodRange, type PeriodFilterValue } from "@/lib/period-filter";
import { parseSheet, type PropertyIncomeRow } from "@/lib/property-income";
import {
    buildTransactionImportRows,
    estimateFinancingSplits,
    formatDateBR,
    KIND_GROUP,
    KIND_LABELS,
    solarPayback,
    summarizeInvestment,
    ACTIVE_TRANSACTION_KINDS,
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
    /** Lets the dashboard feed the investment analysis with the loaded header + transactions. */
    onDataChange?: (data: { investment: PropertyInvestment | null; transactions: PropertyTransaction[]; loading: boolean }) => void;
    /** Taxes paid by the landlord (Tributos do imóvel), all years — shown with the running costs. */
    landlordTaxes?: { iptu: number; itbi: number; other: number; total: number };
    /** Extra amounts that count towards the solar payback, per month: the condominium's result when the owner chose so (`label` = its name). */
    solarExtra?: { byMonth: Map<string, number>; label: string };
    /** Loaded by the parent (overview): undefined = fetch here, null = parent still loading. */
    preloaded?: { investment: PropertyInvestment | null; transactions: PropertyTransaction[] } | null;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toInput = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "" : n.toFixed(2));
const parseInput = (s: string): number | null => {
    const n = parseMoneyText(s);
    return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const COLLAPSED_ROWS = 24;
/** Excel-style sort/filter columns for the transactions table. */
const INVESTMENT_COLUMNS: ColumnDef<PropertyTransaction>[] = [
    { key: "date", label: "Data", kind: "date", get: t => t.occurred_on },
    { key: "kind", label: "Tipo", kind: "enum", get: t => t.kind, options: TRANSACTION_KINDS.map(k => ({ value: k.kind, label: k.label })) },
    { key: "amount", label: "Valor", kind: "number", align: "right", get: t => t.amount },
    { key: "interest", label: "Juros", kind: "number", align: "right", get: t => t.interest_part },
    { key: "principal", label: "Amortização", kind: "number", align: "right", get: t => t.principal_part },
    { key: "insurance", label: "Seguro", kind: "number", align: "right", get: t => t.insurance_part },
    { key: "comment", label: "Comentários", kind: "text", get: t => t.comment ?? "" },
];

const FIN_KINDS: TransactionKind[] = ["PRESTACAO", "AMORTIZACAO", "QUITACAO"];

type TxDraft = Partial<Record<"date" | "kind" | "amount" | "interest" | "principal" | "insurance" | "comment", string>>;

export default function PropertyInvestmentSection({ propertyId, incomeRows, onDataChange, preloaded, landlordTaxes, solarExtra }: Props) {
    const taxes = landlordTaxes ?? { iptu: 0, itbi: 0, other: 0, total: 0 };
    const sel = useCellSum();
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

    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: "ytd" });   // the ledger opens on the current year

    const flash = (msg: string) => {
        setNotice(msg);
        window.setTimeout(() => setNotice(null), 8000);
    };

    // ── Load ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!txEndpoint || !invEndpoint) { setLoading(false); return; }
        if (preloaded !== undefined) {
            if (preloaded === null) { setLoading(true); return; }
            setTxs(preloaded.transactions); setInvestment(preloaded.investment); setLoading(false);
            return;
        }
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
    }, [txEndpoint, invEndpoint, preloaded]);

    useEffect(() => { onDataChange?.({ investment, transactions: txs, loading }); }, [investment, txs, loading, onDataChange]);

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
    const cancelDraft = (id: string, field: keyof TxDraft) =>
        setDrafts(prev => { const n = { ...prev, [id]: { ...prev[id] } }; delete n[id][field]; return n; });

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
    const solar = useMemo(() => solarPayback(summary.solarInvested, incomeRows, solarExtra?.byMonth), [summary.solarInvested, incomeRows, solarExtra]);
    const range = useMemo(() => periodRange(period), [period]);
    /** Rows inside the period (before column filters). */
    const inPeriod = useMemo(
        () => txs.filter(t => {
            const k = t.occurred_on.slice(0, 7);
            return (!range.start || k >= range.start) && (!range.end || k <= range.end);
        }),
        [txs, range]
    );
    // Juros / Amortização / Seguro are grouped like an Excel outline: collapsed by default, "+" expands, "−" collapses.
    const [showSplit, setShowSplit] = useState(false);
    const columns = useMemo<ColumnDef<PropertyTransaction>[]>(() => {
        const toggle = (expanded: boolean) => (
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowSplit(!expanded); }}
                title={expanded ? "Ocultar juros, amortização e seguro" : "Mostrar juros, amortização e seguro"}
                className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded border border-border text-[11px] leading-none font-bold text-muted-foreground hover:text-foreground hover:bg-muted align-middle"
            >
                {expanded ? "−" : "+"}
            </button>
        );
        const split = new Set(["interest", "principal", "insurance"]);
        return INVESTMENT_COLUMNS
            .filter(c => showSplit || !split.has(c.key))
            .map(c => (c.key === "amount" && !showSplit ? { ...c, headerExtra: toggle(false) } : c.key === "insurance" && showSplit ? { ...c, headerExtra: toggle(true) } : c));
    }, [showSplit]);
    const cf = useColumnFilters(inPeriod, columns, { key: "date", dir: "desc" }, { storageKey: columnTableKey("property-investments") });
    const cfRef = useRef(cf);
    cfRef.current = cf;
    useEffect(() => {
        // collapsing drops filters/sort that live on the hidden columns
        if (showSplit) return;
        const c = cfRef.current;
        for (const k of ["interest", "principal", "insurance"]) if (c.isActive(k)) c.clearColumn(k);
        if (["interest", "principal", "insurance"].includes(c.sort.key)) c.setSort({ key: "date", dir: "desc" });
    }, [showSplit]);
    const filtered = cf.rows;
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

    // ── Bank statement (OFX / CSV) import with review ────────────────────
    type StatementRow = { date: string; amount: number; memo: string; reference: string; kind: TransactionKind | null; inflow: boolean; duplicate: boolean; include: boolean };
    const [stmtOpen, setStmtOpen] = useState(false);
    const [stmtRows, setStmtRows] = useState<StatementRow[]>([]);
    const [stmtError, setStmtError] = useState<string | null>(null);
    const [stmtParsing, setStmtParsing] = useState(false);
    const [stmtImporting, setStmtImporting] = useState(false);
    const openStatement = () => { setStmtRows([]); setStmtError(null); setStmtOpen(true); };
    const onStatementFile = async (file: File | null) => {
        if (!file || !txEndpoint) return;
        setStmtError(null); setStmtParsing(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${txEndpoint}/statement`, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Não foi possível ler o extrato");
            const rows = (data.rows ?? []) as Omit<StatementRow, "include">[];
            setStmtRows(rows.map(r => ({ ...r, include: !r.inflow && !r.duplicate && r.kind !== null })));
        } catch (err) {
            setStmtError((err as Error).message);
        } finally {
            setStmtParsing(false);
        }
    };
    const setStmt = (i: number, patch: Partial<StatementRow>) => setStmtRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const runStatementImport = async () => {
        const chosen = stmtRows.filter(r => r.include && r.kind && !r.inflow);
        if (chosen.length === 0) return;
        setStmtImporting(true);
        const ok = await putTxs(chosen.map(r => ({
            occurred_on: r.date, kind: r.kind!, amount: Math.abs(r.amount), comment: r.memo.slice(0, 500) || null, source: "BANK" as const, bank_reference: r.reference,
        })), false);
        setStmtImporting(false);
        if (ok) { setStmtOpen(false); flash(`${chosen.length} lançamentos importados do extrato`); }
    };
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

    // ── Estimate interest / amortisation / insurance from the contract terms ──
    const [splitOpen, setSplitOpen] = useState(false);
    const [splitOverwrite, setSplitOverwrite] = useState(false);
    const [applyingSplit, setApplyingSplit] = useState(false);
    const canEstimate = Boolean(investment && investment.financing_status !== "NONE" && investment.principal && investment.annual_rate && investment.term_months);
    const estimate = useMemo(() => (splitOpen ? estimateFinancingSplits(investment, txs, { overwrite: splitOverwrite }) : null), [splitOpen, investment, txs, splitOverwrite]);
    const applySplit = async () => {
        if (!estimate || estimate.updates.length === 0) return;
        setApplyingSplit(true);
        const ok = await putTxs(estimate.updates, false, estimate.updates.map(u => u.id!));
        setApplyingSplit(false);
        if (ok) { setSplitOpen(false); flash(`${estimate.updates.length} lançamentos atualizados com juros, amortização e seguro estimados — edite qualquer célula se tiver o valor exato do extrato.`); }
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
    // months from the contract (or first instalment / purchase) to the payoff
    const paidOffStart = investment?.contract_date ?? investment?.first_due_date ?? investment?.acquired_on ?? null;
    const paidOffMonths = investment?.financing_status === "PAID_OFF" && investment.paid_off_on && paidOffStart
        ? Math.max(1, monthsBetween(paidOffStart.slice(0, 7), investment.paid_off_on.slice(0, 7)))
        : null;
    // explanations for the six tiles (icon popup)
    const investInfo: Record<"total" | "bank" | "capex" | "costs" | "financing" | "solar", TileInfo> = {
        total: {
            what: "Tudo o que saiu do seu bolso por este imóvel, do sinal até hoje. Cada linha do card é um grupo de lançamentos; os tributos vêm do registro Tributos do imóvel.",
            formula: "Entrada + banco + reformas + custos do imóvel + energia solar",
            example: <>{formatBRL(summary.downPayment + summary.closingCosts)} + {formatBRL(summary.bankPaid + summary.bankFees)} + {formatBRL(summary.capex)} + {formatBRL(summary.runningCosts + taxes.total)} + {formatBRL(summary.solarInvested)} = {formatBRL(summary.invested + taxes.total)}</>,
            note: "É o capital investido usado no payback e nos indicadores de retorno da Análise do investimento.",
        },
        bank: {
            what: "Tudo o que foi para o banco do financiamento: prestações, amortizações extras, quitação e tarifas. Juros + seguros é a parte que não abateu a dívida, calculada em Calcular juros e amortização.",
            formula: <>Pago ao banco = prestações + amortizações + quitação + tarifas<br />Juros + seguros = Σ juros e seguros das prestações</>,
            example: <>{formatBRL(summary.bankPaid)} + {formatBRL(summary.bankFees)} de tarifas = {formatBRL(summary.bankPaid + summary.bankFees)} em {summary.installments} prestações</>,
        },
        capex: {
            what: "Obras e melhorias lançadas como Reforma. Entram no capital investido, não nas despesas do mês.",
            formula: "Σ lançamentos do tipo Reforma",
            example: <>{formatBRL(summary.capex)} em {txs.filter(t => t.kind === "REFORMA").length} lançamentos</>,
        },
        costs: {
            what: "Custos do imóvel que não são financiamento nem reforma: utilidades e outros lançados no investimento, mais os tributos pagos por você no registro (IPTU, ITBI e outros).",
            formula: "Utilidades + outros + IPTU + ITBI + outros tributos",
            example: <>{formatBRL(summary.byKind.UTILIDADES)} + {formatBRL(summary.byKind.OUTROS)} + {formatBRL(taxes.iptu)} + {formatBRL(taxes.itbi)} + {formatBRL(taxes.other)} = {formatBRL(summary.runningCosts + taxes.total)}</>,
            note: "Só o IPTU pago por você entra nas despesas do mês (DRE); ITBI e outros tributos são investimento.",
        },
        financing: {
            what: "Os dados do contrato informados em Aquisição & financiamento e, quando quitado, em quantos meses a dívida foi paga contra o prazo contratado.",
            formula: "Quitado em = meses entre o contrato (ou a 1ª prestação) e a quitação",
            example: investment && investment.financing_status !== "NONE" ? <>{[investment.lender, investment.financing_system, investment.principal ? formatBRL(investment.principal) : null].filter(Boolean).join(" · ")}{paidOffMonths !== null ? ` · quitado em ${paidOffMonths} meses${investment.term_months ? ` de ${investment.term_months}` : ""}` : ""}</> : undefined,
        },
        solar: {
            what: solarExtra
                ? `O investimento no sistema solar (lançamentos Energia solar) e quanto dele já voltou: a energia paga pelo inquilino menos o custo de energia, mês a mês, mais o resultado mensal do ${solarExtra.label}: água, internet e IPTU são repassados a custo, então o que sobra no condomínio é a economia que o sistema solar gera (opção ligada na página Condomínio).`
                : "O investimento no sistema solar (lançamentos Energia solar) e quanto dele já voltou: a energia paga pelo inquilino menos o custo de energia, mês a mês. Num imóvel com condomínio, a página Condomínio permite contar o resultado mensal do condomínio aqui, já que ele vem da economia de energia do sistema solar.",
            formula: solarExtra
                ? <>Recuperado = Σ (energia recebida − custo de energia) + Σ resultado do condomínio<br />Falta = investido − recuperado</>
                : <>Recuperado = Σ (energia recebida − custo de energia)<br />Falta = investido − recuperado</>,
            example: solar.invested > 0 ? <>{formatBRL(solar.recovered)} de {formatBRL(solar.invested)} = {solar.pct}%{solar.remaining > 0 ? ` · falta ${formatBRL(solar.remaining)}` : " · recuperado"}</> : undefined,
        },
    };
    const financingHint = investment && investment.financing_status !== "NONE"
        ? <>
            {[investment.lender, investment.financing_system, investment.principal ? formatBRL(investment.principal) : null, investment.term_months ? `${investment.term_months} meses` : null, investment.annual_rate ? `${investment.annual_rate}% a.a.` : null].filter(Boolean).join(" · ")}
            {paidOffMonths !== null && <><br />Quitado em {paidOffMonths} {paidOffMonths === 1 ? "mês" : "meses"}{investment.term_months ? ` (de ${investment.term_months})` : ""}</>}
        </>
        : "Configure a aquisição e o financiamento";

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="space-y-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <PiggyBank className="w-4 h-4 text-emerald-600" />
                        Investimento no imóvel
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Tudo o que você pagou: entrada, custos de aquisição, prestações, amortizações e tarifas do financiamento, reformas, custos do imóvel, tributos e energia solar.
                        {investment?.purchase_price ? ` Valor de compra ${formatBRL(investment.purchase_price)}${investment.acquired_on ? ` em ${formatDateBR(investment.acquired_on)}` : ""}.` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={openConfig} className="gap-1.5 text-xs">
                        <Settings className="w-3.5 h-3.5" /> Aquisição & financiamento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setSplitOverwrite(false); setSplitOpen(true); }} disabled={!canEstimate} className="gap-1.5 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                        title={canEstimate ? "Estima juros, amortização e seguro de cada prestação a partir do contrato" : "Preencha valor financiado, juros e prazo em Aquisição & financiamento"}>
                        <Calculator className="w-3.5 h-3.5" /> Calcular juros e amortização
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
                    <Button size="sm" variant="outline" onClick={openStatement} className="gap-1.5 text-xs" title="Extrato OFX ou CSV do banco: cada saída vira um lançamento após sua revisão">
                        <Landmark className="w-3.5 h-3.5" /> Importar extrato
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
                <Tile label="Total investido no imóvel" value={formatBRL(summary.invested + taxes.total)} tone="emerald" icon={<PiggyBank className="w-4 h-4" />} info={investInfo.total}
                    hint={<>Entrada: {formatBRL(summary.downPayment + summary.closingCosts)}<br />Banco: {formatBRL(summary.bankPaid + summary.bankFees)}<br />Reformas: {formatBRL(summary.capex)}<br />Custos do imóvel: {formatBRL(summary.runningCosts + taxes.total)}<br />Energia solar: {formatBRL(summary.solarInvested)}</>} />
                <Tile label="Pago ao banco" value={formatBRL(summary.bankPaid + summary.bankFees)} tone="blue" icon={<Landmark className="w-4 h-4" />} info={investInfo.bank}
                    hint={<>Prestações: {summary.installments}<br />Juros + seguros: {summary.interestAndInsurance === null ? "—" : formatBRL(summary.interestAndInsurance)}<br />Tarifas: {formatBRL(summary.bankFees)}</>} />
                <Tile label="Reformas (capex)" value={formatBRL(summary.capex)} tone="violet" icon={<Hammer className="w-4 h-4" />} info={investInfo.capex}
                    hint={`${txs.filter(t => t.kind === "REFORMA").length} lançamentos`} />
                <Tile label="Custos do imóvel" value={formatBRL(summary.runningCosts + taxes.total)} tone="rose" icon={<Receipt className="w-4 h-4" />} info={investInfo.costs}
                    hint={<>Utilidades: {formatBRL(summary.byKind.UTILIDADES)}<br />Outros: {formatBRL(summary.byKind.OUTROS)}<br />IPTU: {formatBRL(taxes.iptu)}<br />ITBI: {formatBRL(taxes.itbi)}{taxes.other > 0 && <><br />Outros tributos: {formatBRL(taxes.other)}</>}</>} />
                <Tile label="Financiamento" value={financingLabel} tone="blue" icon={<Banknote className="w-4 h-4" />} hint={financingHint} info={investInfo.financing} />
                <Tile label="Energia solar" value={formatBRL(solar.invested)} tone="amber" icon={<Sun className="w-4 h-4" />} info={investInfo.solar}
                    hint={
                        <>
                            Recuperado {formatBRL(solar.recovered)} ({solar.pct}%){solarExtra && <> · condomínio {formatBRL(solar.extraRecovered)}</>}<br />
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
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    Lançamentos · <span className="font-semibold text-foreground">{periodLabel(period)}</span> · {filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}{cf.anyFilter && inPeriod.length !== filtered.length ? ` de ${inPeriod.length}` : ""} · total {formatBRL(filteredTotal)}
                    {summary.totalOutlay > 0 && <> · desembolso total {formatBRL(summary.totalOutlay)}</>}
                </span>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                </div>
            </div>

            <FilterChips columns={columns} ctl={cf} />

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : txs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum lançamento. Importe a planilha de investimento ou adicione a entrada e as prestações.
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    {cf.anyFilter ? (
                        <>Nenhum lançamento com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button></>
                    ) : "Nenhum lançamento no período selecionado."}
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[980px]">
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} trailing={<th className="px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {visible.map(tx => {
                                const d = drafts[tx.id] ?? {};
                                const busy = saving.has(tx.id);
                                const isFin = FIN_KINDS.includes(tx.kind);
                                const money = (field: "amount" | "interest" | "principal" | "insurance", value: number | null, enabled = true) => (
                                    <MoneyInput
                                        value={value}
                                        draft={d[field]}
                                        disabled={busy || !enabled}
                                        placeholder={enabled ? "" : "—"}
                                        onDraft={text => setDraft(tx.id, field, text)}
                                        onCommit={() => commit(tx, field)}
                                        className={cn("disabled:opacity-40", field === "amount" && "font-semibold text-foreground")}
                                    />
                                );
                                return (
                                    <tr key={tx.id} className="border-b border-border/60 hover:bg-muted/30">
                                        <td {...sel.cellProps("date", tx.id, null, "px-2 py-1 whitespace-nowrap", () => cancelDraft(tx.id, "date"))}>
                                            <input type="date" disabled={busy} value={d.date ?? tx.occurred_on}
                                                onChange={e => setDraft(tx.id, "date", e.target.value)} onBlur={() => commit(tx, "date")}
                                                className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1 py-1 outline-none" />
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        <td {...sel.cellProps("kind", tx.id, null, "px-2 py-1", () => cancelDraft(tx.id, "kind"))}>
                                            <select disabled={busy} value={d.kind ?? tx.kind}
                                                onChange={e => { setDraft(tx.id, "kind", e.target.value); }}
                                                onBlur={() => commit(tx, "kind")}
                                                className={cn("bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1 py-1 outline-none",
                                                    KIND_GROUP[tx.kind] === "FINANCIAMENTO" && "text-blue-700 dark:text-blue-400",
                                                    KIND_GROUP[tx.kind] === "CAPEX" && "text-violet-700 dark:text-violet-400",
                                                    KIND_GROUP[tx.kind] === "ENERGIA" && "text-amber-700 dark:text-amber-400",
                                                    KIND_GROUP[tx.kind] === "CUSTOS" && "text-rose-700 dark:text-rose-400")}>
                                                {ACTIVE_TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                            </select>
                                        </td>
                                        <td {...sel.cellProps("amount", tx.id, tx.amount, "px-2 py-1 text-right", () => cancelDraft(tx.id, "amount"))}>{money("amount", tx.amount)}</td>
                                        {showSplit && (
                                            <>
                                                <td {...sel.cellProps("interest", tx.id, tx.interest_part, "px-2 py-1 text-right", () => cancelDraft(tx.id, "interest"))}>{money("interest", tx.interest_part, isFin)}</td>
                                                <td {...sel.cellProps("principal", tx.id, tx.principal_part, "px-2 py-1 text-right", () => cancelDraft(tx.id, "principal"))}>{money("principal", tx.principal_part, isFin)}</td>
                                                <td {...sel.cellProps("insurance", tx.id, tx.insurance_part, "px-2 py-1 text-right", () => cancelDraft(tx.id, "insurance"))}>{money("insurance", tx.insurance_part, isFin)}</td>
                                            </>
                                        )}
                                        <td {...sel.cellProps("comment", tx.id, null, "px-2 py-1", () => cancelDraft(tx.id, "comment"))}>
                                            <input type="text" disabled={busy} value={d.comment ?? (tx.comment ?? "")} placeholder="—"
                                                onChange={e => setDraft(tx.id, "comment", e.target.value)} onBlur={() => commit(tx, "comment")}
                                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1.5 py-1 outline-none truncate" />
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

            <ColumnMenu columns={columns} ctl={cf} />

            {/* Estimate interest / amortisation / insurance */}
            <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-600" /> Calcular juros, amortização e seguro</DialogTitle>
                        <DialogDescription>
                            Percorre as prestações, amortizações extras e a quitação em ordem de data: juros = saldo × {investment?.annual_rate ?? "—"}% ÷ 12
                            (primeira prestação pro rata desde o contrato), amortização pela tabela {investment?.financing_system ?? "SAC"} recalculada a cada amortização extra,
                            seguro (MIP + DFI + tarifas) = o que sobra. Amortizações extras abatem o saldo; a quitação zera o saldo e o excedente é juros/encargos.
                            É uma estimativa: todos os valores continuam editáveis na tabela.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input type="checkbox" className="mt-0.5 accent-blue-600" checked={splitOverwrite} onChange={e => setSplitOverwrite(e.target.checked)} />
                            <span><span className="font-semibold text-foreground">Recalcular também as linhas já preenchidas</span> — desmarcado, linhas com juros/amortização/seguro informados são mantidas como estão.</span>
                        </label>
                        {estimate && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        ["Pago ao banco", estimate.totals.paid, "text-foreground"],
                                        ["Juros", estimate.totals.interest, "text-rose-700 dark:text-rose-400"],
                                        ["Amortização", estimate.totals.principal, "text-emerald-700 dark:text-emerald-400"],
                                        ["Seguro e tarifas", estimate.totals.insurance, "text-amber-700 dark:text-amber-400"],
                                    ].map(([label, value, cls]) => (
                                        <div key={String(label)} className="bg-muted/40 border border-border rounded-xl p-3 space-y-0.5">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                                            <p className={cn("text-base font-bold tabular-nums", String(cls))}>{formatBRL(Number(value))}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {estimate.splits.length} lançamentos do financiamento · {estimate.updates.length} a atualizar · saldo estimado ao final {formatBRL(estimate.endingBalance)}
                                    {investment?.principal ? <> · juros + seguros estimados {formatBRL(estimate.totals.interest + estimate.totals.insurance)} vs. pago − financiado {formatBRL(estimate.totals.paid - Number(investment.principal))}</> : null}
                                </p>
                                {estimate.notes.length > 0 && (
                                    <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 space-y-0.5">
                                        {estimate.notes.slice(0, 6).map((n, i) => <div key={i}>{n}</div>)}
                                        {estimate.notes.length > 6 && <div>… e mais {estimate.notes.length - 6}</div>}
                                    </div>
                                )}
                                {estimate.splits.length > 0 && (
                                    <div className="overflow-x-auto border border-border rounded-lg">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr>
                                                <th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Tipo</th><th className="text-right px-2 py-1">Valor</th>
                                                <th className="text-right px-2 py-1">Juros</th><th className="text-right px-2 py-1">Amortização</th><th className="text-right px-2 py-1">Seguro</th><th className="text-right px-2 py-1">Saldo após</th>
                                            </tr></thead>
                                            <tbody>
                                                {estimate.splits.slice(0, 8).map(s => (
                                                    <tr key={s.id} className={cn("border-t border-border/60", s.kept && "opacity-60")}>
                                                        <td className="px-2 py-1">{formatDateBR(s.occurred_on)}</td>
                                                        <td className="px-2 py-1">{KIND_LABELS[s.kind]}{s.kept ? " (mantido)" : ""}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(s.amount)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(s.interest_part)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(s.principal_part)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{formatBRL(s.insurance_part)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatBRL(s.balance_after)}</td>
                                                    </tr>
                                                ))}
                                                {estimate.splits.length > 8 && <tr className="border-t border-border/60"><td colSpan={7} className="px-2 py-1 text-muted-foreground">… e mais {estimate.splits.length - 8} lançamentos</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSplitOpen(false)}>Fechar</Button>
                        <Button onClick={applySplit} disabled={applyingSplit || !estimate || estimate.updates.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            {applyingSplit && <Loader2 className="w-4 h-4 animate-spin" />} Aplicar em {estimate?.updates.length ?? 0} lançamentos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                    {ACTIVE_TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
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

            <CellSumBar ctl={sel} />

            {/* Bank statement import (OFX / CSV) */}
            <Dialog open={stmtOpen} onOpenChange={setStmtOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Landmark className="w-5 h-5 text-emerald-600" /> Importar extrato bancário</DialogTitle>
                        <DialogDescription>
                            Envie o extrato em OFX (Banco Inter, Bradesco, Caixa, Itaú…) ou CSV com Data, Histórico e Valor. Cada saída recebe um tipo sugerido; revise, ajuste e importe. Entradas (aluguel etc.) são só mostradas. Lançamentos já importados são detectados pelo identificador do banco.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <Field label="Arquivo (.ofx, .qfx, .csv, .tsv, .txt ou .xlsx)">
                            <Input type="file" accept=".ofx,.qfx,.csv,.tsv,.txt,.xlsx" disabled={stmtParsing} onChange={e => onStatementFile(e.target.files?.[0] ?? null)} />
                            {stmtParsing && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Lendo o extrato…</span>}
                        </Field>
                        {stmtError && <div className="text-xs text-rose-600 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {stmtError}</div>}
                        {stmtRows.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{stmtRows.filter(r => r.include && r.kind && !r.inflow).length}</span> de {stmtRows.filter(r => !r.inflow).length} saídas selecionadas
                                    {" · "}{stmtRows.filter(r => r.inflow).length} entradas ignoradas
                                    {stmtRows.some(r => r.duplicate) && <> · {stmtRows.filter(r => r.duplicate).length} já importadas</>}
                                    {stmtRows.some(r => !r.inflow && !r.duplicate && !r.kind) && <> · <span className="text-amber-700 dark:text-amber-400">{stmtRows.filter(r => !r.inflow && !r.duplicate && !r.kind).length} sem tipo: escolha um para incluir</span></>}
                                </p>
                                <div className="overflow-x-auto border border-border rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr>
                                            <th className="px-2 py-1" /><th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Histórico</th><th className="text-right px-2 py-1">Valor</th><th className="text-left px-2 py-1">Tipo</th>
                                        </tr></thead>
                                        <tbody>
                                            {stmtRows.map((r, i) => (
                                                <tr key={r.reference + i} className={cn("border-t border-border/60", (r.inflow || r.duplicate) && "opacity-50")}>
                                                    <td className="px-2 py-1"><input type="checkbox" className="accent-emerald-600" checked={r.include} disabled={r.inflow || r.duplicate || !r.kind} onChange={e => setStmt(i, { include: e.target.checked })} /></td>
                                                    <td className="px-2 py-1 whitespace-nowrap">{formatDateBR(r.date)}</td>
                                                    <td className="px-2 py-1 max-w-[280px] truncate" title={r.memo}>{r.memo}{r.duplicate && <span className="ml-1 text-[10px] text-muted-foreground">(já importado)</span>}</td>
                                                    <td className={cn("px-2 py-1 text-right tabular-nums whitespace-nowrap", r.inflow ? "text-emerald-700" : "")}>{formatBRL(r.amount)}</td>
                                                    <td className="px-2 py-1">
                                                        {r.inflow ? <span className="text-muted-foreground">entrada</span> : (
                                                            <select value={r.kind ?? ""} disabled={r.duplicate} onChange={e => setStmt(i, { kind: (e.target.value || null) as TransactionKind | null, include: Boolean(e.target.value) })} className={cn("bg-transparent border rounded-md px-1.5 py-1 outline-none", r.kind ? "border-transparent" : "border-amber-400")}>
                                                                <option value="">— escolher —</option>
                                                                {ACTIVE_TRANSACTION_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                                            </select>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setStmtOpen(false)}>Fechar</Button>
                        <Button onClick={runStatementImport} disabled={stmtImporting || stmtRows.filter(r => r.include && r.kind && !r.inflow).length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                            {stmtImporting && <Loader2 className="w-4 h-4 animate-spin" />} Importar {stmtRows.filter(r => r.include && r.kind && !r.inflow).length || ""} lançamentos
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

