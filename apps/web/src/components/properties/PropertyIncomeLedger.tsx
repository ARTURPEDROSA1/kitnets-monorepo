"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Plus,
    Upload,
    Download,
    Trash2,
    Wallet,
    Zap,
    Loader2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Landmark,
    Building2,
    FileSpreadsheet,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
} from "recharts";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PeriodFilter from "./PeriodFilter";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "./TableColumnFilters";
import { CellSumBar, useCellSum } from "./TableCellSum";
import MoneyInput, { parseMoneyText } from "./MoneyInput";
import { periodLabel, periodRange, type PeriodFilterValue } from "@/lib/period-filter";
import {
    breakdown,
    buildImportRows,
    currentMonthKey,
    filterRowsByPeriod,
    formatMonthKey,
    INCOME_FIELD_LABELS,
    isIncomeTemplate,
    monthKey,
    parseSheet,
    receivedFromGross,
    suggestMapping,
    summarize,
    type IncomeField,
    type IncomeRowInput,
    type ImportPreviewRow,
    type ParsedSheet,
    type PropertyIncomeRow,
} from "@/lib/property-income";

interface PropertyIncomeLedgerProps {
    /** `properties.id` — undefined while the property has no DB row yet */
    propertyId?: string;
    /** Pre-fills the agency fee for new months; 0/undefined falls back to 10 % */
    defaultAgencyFeePct?: number;
    /** Called whenever the ledger changes so the parent can use real data */
    onRowsChange?: (rows: PropertyIncomeRow[]) => void;
    /** True while the initial rows are being fetched, so the parent can hold off on estimates */
    onLoadingChange?: (loading: boolean) => void;
    /** Period applied to the chart and the table. Controlled when both props are given; otherwise internal. */
    period?: PeriodFilterValue;
    onPeriodChange?: (next: PeriodFilterValue) => void;
    /** Rows loaded by the parent (overview): undefined = fetch here, null = parent still loading, array = use as is. */
    preloadedRows?: PropertyIncomeRow[] | null;
}

const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toInput = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");
const parseInput = (s: string): number | null => {
    const n = parseMoneyText(s);
    return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
};

type DraftField = "received" | "energy" | "other" | "otherExp" | "pct" | "gross" | "notes";
type Drafts = Record<string, Partial<Record<DraftField, string>>>;

const FIELD_OPTIONS: IncomeField[] = ["gross", "fee_pct", "received", "energy", "other", "other_expenses", "notes", "ignore"];
const IMPORT_CHUNK = 300;
const DEFAULT_AGENCY_FEE_PCT = 10;
const COLLAPSED_ROWS = 24;

export default function PropertyIncomeLedger({
    propertyId,
    defaultAgencyFeePct = 0,
    onRowsChange,
    onLoadingChange,
    period: periodProp,
    onPeriodChange,
    preloadedRows,
}: PropertyIncomeLedgerProps) {
    const [localPeriod, setLocalPeriod] = useState<PeriodFilterValue>({ kind: "all" });   // the ledger opens on the whole history
    const period = periodProp ?? localPeriod;
    const setPeriod = onPeriodChange ?? setLocalPeriod;
    const range = useMemo(() => periodRange(period), [period]);

    const [rows, setRows] = useState<PropertyIncomeRow[]>([]);
    const sel = useCellSum();
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Drafts>({});
    const [showAll, setShowAll] = useState(false);

    const onRowsChangeRef = useRef(onRowsChange);
    onRowsChangeRef.current = onRowsChange;
    const onLoadingChangeRef = useRef(onLoadingChange);
    onLoadingChangeRef.current = onLoadingChange;

    const endpoint = propertyId ? `/api/properties/${propertyId}/income` : null;

    const applyRows = useCallback((next: PropertyIncomeRow[]) => {
        setRows(next);
        onRowsChangeRef.current?.(next);
    }, []);

    // ── Load ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!endpoint) {
            setLoading(false);
            onLoadingChangeRef.current?.(false);
            return;
        }
        if (preloadedRows !== undefined) {
            if (preloadedRows === null) { setLoading(true); onLoadingChangeRef.current?.(true); return; }
            applyRows(preloadedRows);
            setLoading(false);
            onLoadingChangeRef.current?.(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        onLoadingChangeRef.current?.(true);
        setError(null);
        fetch(endpoint)
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao carregar receitas");
                if (!cancelled) applyRows(data.rows ?? []);
            })
            .catch(err => {
                if (!cancelled) setError((err as Error).message);
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
                onLoadingChangeRef.current?.(false);
            });
        return () => {
            cancelled = true;
        };
    }, [endpoint, applyRows, preloadedRows]);

    // ── Persist ─────────────────────────────────────────────────────────
    const putRows = useCallback(
        async (inputs: IncomeRowInput[]) => {
            if (!endpoint) return;
            const months = inputs.map(r => r.month);
            setSaving(prev => new Set([...prev, ...months]));
            setError(null);
            try {
                const res = await fetch(endpoint, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: inputs }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao salvar");
                applyRows(data.rows ?? []);
                setDrafts(prev => {
                    const next = { ...prev };
                    months.forEach(m => delete next[m]);
                    return next;
                });
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setSaving(prev => {
                    const next = new Set(prev);
                    months.forEach(m => next.delete(m));
                    return next;
                });
            }
        },
        [endpoint, applyRows]
    );

    const deleteMonth = useCallback(
        async (month: string) => {
            if (!endpoint) return;
            if (!window.confirm(`Excluir o mês ${formatMonthKey(month)}?`)) return;
            setSaving(prev => new Set([...prev, month]));
            try {
                const res = await fetch(`${endpoint}?month=${month}`, { method: "DELETE" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao excluir");
                applyRows(rows.filter(r => monthKey(r.month) !== month));
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setSaving(prev => {
                    const next = new Set(prev);
                    next.delete(month);
                    return next;
                });
            }
        },
        [endpoint, rows, applyRows]
    );

    // ── Inline editing ──────────────────────────────────────────────────
    const setDraft = (month: string, field: DraftField, value: string) =>
        setDrafts(prev => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
    const cancelDraft = (month: string, field: DraftField) =>
        setDrafts(prev => { const n = { ...prev, [month]: { ...prev[month] } }; delete n[month][field]; return n; });

    const commitDraft = (row: PropertyIncomeRow, field: DraftField) => {
        const month = monthKey(row.month);
        const raw = drafts[month]?.[field];
        if (raw === undefined) return;
        const b = breakdown(row);
        const clear = () =>
            setDrafts(prev => {
                const next = { ...prev, [month]: { ...prev[month] } };
                delete next[month][field];
                return next;
            });

        if (field === "notes") {
            const notes = raw.trim() ? raw.trim().slice(0, 500) : null;
            if (notes === (row.notes ?? null)) return clear();
            return void putRows([{ month, notes }]);
        }

        const value = parseInput(raw);
        if (value === null) return clear();

        if (field === "gross") {
            const received = receivedFromGross(value, b.feePct, b.energy);
            if (received === b.received) return clear();
            return void putRows([{ month, received_amount: received }]);
        }
        const key =
            field === "received" ? "received_amount"
                : field === "energy" ? "energy_portion"
                    : field === "other" ? "other_income"
                        : field === "otherExp" ? "other_expenses"
                            : "agency_fee_pct";
        if (field === "pct" && value >= 100) return clear();
        if (value === Number(row[key])) return clear();
        putRows([{ month, [key]: value }]);
    };

    const toggleStatus = (row: PropertyIncomeRow) =>
        putRows([{ month: monthKey(row.month), status: row.status === "CONFIRMED" ? "EXPECTED" : "CONFIRMED" }]);

    // ── Derived ─────────────────────────────────────────────────────────
    const sorted = useMemo(() => [...rows].sort((a, b) => (a.month < b.month ? 1 : -1)), [rows]);
    /** Rows inside the selected period (newest first) — drives the chart and the table. */
    const filtered = useMemo(() => filterRowsByPeriod(sorted, range), [sorted, range]);
    // Excel-style column sort & filters on top of the period filter (table only; the chart follows the period)
    const columns = useMemo<ColumnDef<PropertyIncomeRow>[]>(() => [
        { key: "month", label: "Mês", kind: "month", get: r => monthKey(r.month) },
        { key: "gross", label: "Aluguel bruto", kind: "number", align: "right", get: r => breakdown(r).grossRent },
        { key: "pct", label: "Taxa %", kind: "number", align: "right", sum: false, get: r => Number(r.agency_fee_pct) || 0 },
        { key: "net", label: "Aluguel líquido", kind: "number", align: "right", title: "Recebido − energia (aluguel após a taxa)", get: r => breakdown(r).netRent },
        { key: "energy", label: "Energia", kind: "number", align: "right", title: "Parcela de energia paga pelo inquilino (centro solar)", get: r => breakdown(r).energy },
        { key: "received", label: "Recebido", kind: "number", align: "right", title: "O que entrou na conta", get: r => breakdown(r).received },
        { key: "other", label: "Custo de energia", kind: "number", align: "right", title: "Conta de luz paga no mês (custo à parte; não altera o recebido)", get: r => breakdown(r).other },
        { key: "otherExp", label: "Outras despesas", kind: "number", align: "right", title: "Outros custos pagos à parte no mês (reparos, taxas); não alteram o recebido", get: r => breakdown(r).otherExpenses },
        { key: "status", label: "Status", kind: "enum", align: "center", get: r => r.status, options: [{ value: "CONFIRMED", label: "Confirmado" }, { value: "EXPECTED", label: "Previsto" }] },
        { key: "notes", label: "Comentários", kind: "text", get: r => r.notes ?? "" },
    ], []);
    const cf = useColumnFilters(filtered, columns, { key: "month", dir: "desc" });
    const visible = showAll ? cf.rows : cf.rows.slice(0, COLLAPSED_ROWS);
    /** Totals over the confirmed months inside the selected period (tiles 2–5). */
    const periodSummary = useMemo(() => summarize(filtered), [filtered]);
    // Fee pre-fill: last month's fee when set, else the property default, else 10 %
    const lastRowPct = sorted.length ? Number(sorted[0].agency_fee_pct) : 0;
    const lastPct = lastRowPct > 0 ? lastRowPct : defaultAgencyFeePct > 0 ? defaultAgencyFeePct : DEFAULT_AGENCY_FEE_PCT;

    const chartData = useMemo(
        () =>
            [...filtered]
                .sort((a, b) => (a.month < b.month ? -1 : 1))
                .map(r => {
                    const b = breakdown(r);
                    return {
                        month: formatMonthKey(monthKey(r.month)),
                        liquido: b.netRent,
                        energia: b.energy,
                        bruto: b.grossRent,
                        previsto: r.status === "EXPECTED",
                    };
                }),
        [filtered]
    );

    // ── Add month dialog ────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ month: currentMonthKey(), gross: "", received: "", energy: "", other: "", otherExp: "", pct: "", notes: "" });

    const openAdd = () => {
        const next = new Date();
        next.setMonth(next.getMonth() + 1);
        const suggestion = sorted.length && sorted[0].status === "CONFIRMED" && monthKey(sorted[0].month) === currentMonthKey()
            ? currentMonthKey(next)
            : currentMonthKey();
        const last = sorted[0] ? breakdown(sorted[0]) : null;
        setAddForm({
            month: suggestion,
            gross: last ? toInput(last.grossRent) : "",
            received: last ? toInput(last.received) : "",
            energy: last ? toInput(last.energy) : "",
            other: last ? toInput(last.other) : "",
            otherExp: "",
            pct: toInput(lastPct),
            notes: "",
        });
        setAddOpen(true);
    };

    const recalcFromGross = (form: typeof addForm) => {
        const gross = parseInput(form.gross);
        if (gross === null) return form;
        const received = receivedFromGross(gross, parseInput(form.pct) ?? 0, parseInput(form.energy) ?? 0);
        return { ...form, received: toInput(received) };
    };
    const recalcFromReceived = (form: typeof addForm) => {
        const received = parseInput(form.received);
        if (received === null) return form;
        const b = breakdown({
            received_amount: received,
            energy_portion: parseInput(form.energy) ?? 0,
            other_income: parseInput(form.other) ?? 0,
            agency_fee_pct: parseInput(form.pct) ?? 0,
        });
        return { ...form, gross: toInput(b.grossRent) };
    };

    const submitAdd = async () => {
        const received = parseInput(addForm.received);
        if (!/^\d{4}-\d{2}$/.test(addForm.month) || received === null) return;
        const month = addForm.month;
        await putRows([
            {
                month,
                received_amount: received,
                energy_portion: parseInput(addForm.energy) ?? 0,
                other_income: parseInput(addForm.other) ?? 0,
                other_expenses: parseInput(addForm.otherExp) ?? 0,
                agency_fee_pct: parseInput(addForm.pct) ?? 0,
                status: month > currentMonthKey() ? "EXPECTED" : "CONFIRMED",
                source: "MANUAL",
                notes: addForm.notes.trim() || null,
            },
        ]);
        setAddOpen(false);
    };

    // ── Import dialog ───────────────────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [sheet, setSheet] = useState<ParsedSheet | null>(null);
    const [mapping, setMapping] = useState<IncomeField[]>([]);
    const [importPct, setImportPct] = useState("");
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importDone, setImportDone] = useState<number | null>(null);
    const [importNotice, setImportNotice] = useState<string | null>(null);

    const [templateDetected, setTemplateDetected] = useState(false);
    const [showMapping, setShowMapping] = useState(false);
    /** Imports replace the whole ledger of the property (default). Off = merge by month. */
    const [replaceAll, setReplaceAll] = useState(true);

    const openImport = () => {
        setImportText("");
        setSheet(null);
        setMapping([]);
        setImportPct(toInput(lastPct));
        setImportError(null);
        setImportDone(null);
        setTemplateDetected(false);
        setShowMapping(false);
        setReplaceAll(true);
        setImportOpen(true);
    };

    /**
     * Parses text into the mapper. With `autoImport` (file uploads), a sheet
     * that carries the Kitnets.com template headers is imported straight away —
     * no mapping step.
     */
    const loadImportText = (text: string, autoImport = false) => {
        setImportText(text);
        setImportDone(null);
        setShowMapping(false);
        const parsed = parseSheet(text);
        const suggested = suggestMapping(parsed.headers, parsed.dateColumn);
        const isTemplate = parsed.dateColumn >= 0 && isIncomeTemplate(parsed.headers);
        setSheet(parsed);
        setMapping(suggested);
        setTemplateDetected(isTemplate);
        setImportError(parsed.dateColumn < 0 && parsed.rows.length > 0 ? "Não encontrei uma coluna de data (dd/mm/aaaa)." : null);
        if (autoImport && isTemplate) {
            const rows = buildImportRows(parsed, suggested, { agencyFeePct: parseInput(importPct) ?? DEFAULT_AGENCY_FEE_PCT });
            if (rows.length === 0) {
                setImportError("O modelo está vazio: preencha pelo menos um mês antes de importar.");
                return;
            }
            void runImportRows(rows, true);
        }
    };

    const [parsingFile, setParsingFile] = useState(false);

    const onImportFile = async (file: File | null) => {
        if (!file) return;
        const isExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name);
        if (!isExcel) {
            const reader = new FileReader();
            reader.onload = () => loadImportText(String(reader.result ?? ""), true);
            reader.readAsText(file, "utf-8");
            return;
        }
        if (!endpoint) return;
        setParsingFile(true);
        setImportError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${endpoint}/parse`, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Não foi possível ler a planilha");
            loadImportText(String(data.text ?? ""), true);
        } catch (err) {
            setImportError((err as Error).message);
        } finally {
            setParsingFile(false);
        }
    };

    // ── Excel template download ─────────────────────────────────────────
    const [exporting, setExporting] = useState<"template" | "ledger" | null>(null);

    /** Downloads the empty template, or the property's ledger in the same layout (re-importable backup). */
    const exportTemplate = async (kind: "template" | "ledger" = "template") => {
        if (!endpoint) return;
        setExporting(kind);
        setError(null);
        try {
            const query = kind === "ledger" ? "fill=ledger" : `fee=${encodeURIComponent(lastPct)}&months=12`;
            const res = await fetch(`${endpoint}/template?${query}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Erro ao gerar a planilha");
            }
            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const match = disposition.match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = match?.[1] ?? "kitnets-receitas.xlsx";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setExporting(null);
        }
    };

    const importRows = useMemo(() => {
        if (!sheet || sheet.dateColumn < 0) return [];
        return buildImportRows(sheet, mapping, { agencyFeePct: parseInput(importPct) ?? 0 });
    }, [sheet, mapping, importPct]);

    const runImportRows = async (rows: ImportPreviewRow[], replace = replaceAll) => {
        if (!endpoint || rows.length === 0) return;
        setImporting(true);
        setImportError(null);
        try {
            let lastRows: PropertyIncomeRow[] | null = null;
            for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
                // `line` is only used for the preview; the API ignores unknown fields.
                const chunk = rows.slice(i, i + IMPORT_CHUNK);
                const res = await fetch(endpoint, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    // Only the first chunk wipes the ledger; later chunks append to it.
                    body: JSON.stringify({ rows: chunk, replace: replace && i === 0 }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao importar");
                lastRows = data.rows ?? [];
            }
            if (lastRows) applyRows(lastRows);
            setImportDone(rows.length);
            setDrafts({});
            // Close the dialog so the user sees the result in the ledger; confirm with a short notice.
            setImportOpen(false);
            setImportNotice(`${rows.length} ${rows.length === 1 ? "mês importado" : "meses importados"}${replace ? " · registro anterior substituído" : ""}`);
            window.setTimeout(() => setImportNotice(null), 8000);
        } catch (err) {
            setImportError((err as Error).message);
        } finally {
            setImporting(false);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────
    if (!propertyId) {
        return (
            <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-sm text-muted-foreground flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                Salve o cadastro deste imóvel para habilitar o registro de receitas mensais.
            </div>
        );
    }


    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            {/* Header */}
            <div className="space-y-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        Receitas de Aluguel (valores reais)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        O que entrou na conta a cada mês. A parcela de energia vai para o centro de energia solar; custo de energia e outras despesas são custos pagos à parte.
                        Aluguel líquido (após a taxa) = recebido − energia; aluguel bruto = líquido ÷ (1 − taxa); receita = bruto + energia; OPEX = taxa + custo de energia + outras despesas (o IPTU pago por você entra pelo registro Tributos do imóvel, no mês do pagamento); NOI = recebido − custos.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportTemplate("template")}
                        disabled={exporting !== null}
                        className="gap-1.5 text-xs"
                        title="Baixa um modelo Excel formatado para preencher e importar"
                    >
                        {exporting === "template" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Exportar modelo
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportTemplate("ledger")}
                        disabled={exporting !== null || rows.length === 0}
                        className="gap-1.5 text-xs"
                        title="Baixa todos os meses deste imóvel em Excel (mesmo layout do modelo; pode ser reimportado)"
                    >
                        {exporting === "ledger" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                        Exportar registro
                    </Button>
                    <Button size="sm" variant="outline" onClick={openImport} className="gap-1.5 text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        Importar planilha
                    </Button>
                    <Button size="sm" onClick={openAdd} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar mês
                    </Button>
                </div>
            </div>

            {error && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}
            {importNotice && (
                <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {importNotice}
                </div>
            )}

            {/* Summary tiles: "Aluguel bruto" is the current month; the other four follow the period filter below */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <SummaryTile
                    label="Aluguel bruto no período"
                    value={formatBRL(periodSummary.totalGross)}
                    hint={periodSummary.confirmedMonths ? "Valor de contrato somado" : "Nenhum mês confirmado no período"}
                    icon={<Landmark className="w-4 h-4" />}
                    tone="emerald"
                />
                <SummaryTile
                    label="Recebido no período"
                    value={formatBRL(periodSummary.totalReceived)}
                    hint={periodSummary.confirmedMonths ? `${periodSummary.confirmedMonths} ${periodSummary.confirmedMonths === 1 ? "mês" : "meses"} · ${periodLabel(period)}` : `Nenhum mês confirmado · ${periodLabel(period)}`}
                    icon={<Wallet className="w-4 h-4" />}
                    tone="blue"
                />
                <SummaryTile
                    label="Aluguel líquido no período"
                    value={formatBRL(periodSummary.totalNetRent)}
                    hint={periodSummary.confirmedMonths ? `Média ${formatBRL(periodSummary.totalNetRent / periodSummary.confirmedMonths)}/mês` : "—"}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    tone="violet"
                />
                <SummaryTile
                    label="Energia Solar no período"
                    value={formatBRL(periodSummary.totalEnergy)}
                    hint={
                        <>
                            Custo {formatBRL(periodSummary.totalOther)}
                            <br />
                            Resultado {formatBRL(periodSummary.totalEnergy - periodSummary.totalOther)}
                        </>
                    }
                    icon={<Zap className="w-4 h-4" />}
                    tone="amber"
                />
                <SummaryTile
                    label="Taxa da imobiliária no período"
                    value={formatBRL(periodSummary.totalFee)}
                    hint="Economia potencial com autogestão no Kitnets.com"
                    icon={<Building2 className="w-4 h-4" />}
                    tone="rose"
                />
            </div>

            {/* Period (shared with the DRE chart when controlled by the dashboard) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    Período do gráfico e da tabela · <span className="font-semibold text-foreground">{periodLabel(period)}</span>
                    {" · "}{cf.anyFilter ? `${cf.rows.length} de ${filtered.length}` : filtered.length} {filtered.length === 1 ? "mês" : "meses"}
                </span>
                <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
                <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                tickFormatter={(val: number) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
                            />
                            <RechartsTooltip
                                formatter={(value, name) => [formatBRL(Number(value)), String(name)]}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "12px",
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }} />
                            <Bar dataKey="liquido" name="Aluguel líquido" stackId="a" fill="#10b981" maxBarSize={28} />
                            <Bar dataKey="energia" name="Energia" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                            <Line type="monotone" dataKey="bruto" name="Aluguel bruto" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Table */}
            <FilterChips columns={columns} ctl={cf} />

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando receitas…
                </div>
            ) : sorted.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhuma receita registrada. Adicione um mês ou importe a planilha de aluguéis.
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum mês no período selecionado ({periodLabel(period)}). Escolha outro período acima.
                </div>
            ) : cf.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhum mês com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[1040px]">
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} trailing={<th className="px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {visible.map(row => {
                                const month = monthKey(row.month);
                                const b = breakdown(row);
                                const d = drafts[month] ?? {};
                                const busy = saving.has(month);
                                const cell = (field: DraftField, value: number, step = "0.01") => field !== "pct" ? (
                                    <MoneyInput
                                        value={value}
                                        draft={d[field]}
                                        disabled={busy}
                                        onDraft={text => setDraft(month, field, text)}
                                        onCommit={() => commitDraft(row, field)}
                                        className={cn("", field === "gross" && "text-foreground font-semibold")}
                                    />
                                ) : (
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step={step}
                                        min={0}
                                        disabled={busy}
                                        value={d[field] ?? toInput(value)}
                                        onChange={e => setDraft(month, field, e.target.value)}
                                        onBlur={() => commitDraft(row, field)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        }}
                                        className="text-right bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1.5 py-1 outline-none tabular-nums"
                                    />
                                );
                                return (
                                    <tr key={row.id} className={cn("border-b border-border/60 hover:bg-muted/30", row.status === "EXPECTED" && "opacity-70")}>
                                        <td className="px-2 py-1 font-semibold text-foreground whitespace-nowrap">
                                            {formatMonthKey(month)}
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        <td {...sel.cellProps("gross", month, b.grossRent, "px-2 py-1 text-right", () => cancelDraft(month, "gross"))}>{cell("gross", b.grossRent)}</td>
                                        <td {...sel.cellProps("pct", month, b.feePct, "px-2 py-1 text-right", () => cancelDraft(month, "pct"))}>{cell("pct", b.feePct, "0.5")}</td>
                                        <td {...sel.cellProps("net", month, b.netRent, "px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums")}>{formatBRL(b.netRent)}</td>
                                        <td {...sel.cellProps("energy", month, b.energy, "px-2 py-1 text-right", () => cancelDraft(month, "energy"))}>{cell("energy", b.energy)}</td>
                                        <td {...sel.cellProps("received", month, b.received, "px-2 py-1 text-right", () => cancelDraft(month, "received"))}>{cell("received", b.received)}</td>
                                        <td {...sel.cellProps("other", month, b.other, "px-2 py-1 text-right", () => cancelDraft(month, "other"))}>{cell("other", b.other)}</td>
                                        <td {...sel.cellProps("otherExp", month, b.otherExpenses, "px-2 py-1 text-right", () => cancelDraft(month, "otherExp"))}>{cell("otherExp", b.otherExpenses)}</td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => toggleStatus(row)}
                                                title={row.status === "CONFIRMED" ? "Confirmado — clique para marcar como previsto" : "Previsto — clique para confirmar"}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                                    row.status === "CONFIRMED"
                                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                                )}
                                            >
                                                {row.status === "CONFIRMED" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {row.status === "CONFIRMED" ? "Confirmado" : "Previsto"}
                                            </button>
                                            {row.source !== "MANUAL" && (
                                                <span className="block text-[9px] text-muted-foreground mt-0.5">
                                                    {row.source === "BANK" ? "banco" : "planilha"}
                                                </span>
                                            )}
                                        </td>
                                        <td {...sel.cellProps("notes", month, null, "px-2 py-1", () => cancelDraft(month, "notes"))}>
                                            <input
                                                type="text"
                                                disabled={busy}
                                                value={d.notes ?? (row.notes ?? "")}
                                                placeholder="—"
                                                onChange={e => setDraft(month, "notes", e.target.value)}
                                                onBlur={() => commitDraft(row, "notes")}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                }}
                                                className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1.5 py-1 outline-none truncate"
                                            />
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => deleteMonth(month)}
                                                className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                title="Excluir mês"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {cf.rows.length > COLLAPSED_ROWS && (
                        <button
                            type="button"
                            onClick={() => setShowAll(v => !v)}
                            className="mt-2 mx-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                            {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {showAll ? `Mostrar apenas os primeiros ${COLLAPSED_ROWS} meses` : `Mostrar todos os ${cf.rows.length} meses${cf.anyFilter ? " filtrados" : " do período"}`}
                        </button>
                    )}
                    <ColumnMenu columns={columns} ctl={cf} />
                    <CellSumBar ctl={sel} />
                </div>
            )}

            <p className="text-[11px] text-muted-foreground">
                Edite qualquer célula e pressione Enter ou saia do campo para salvar. Alterar o aluguel bruto recalcula o valor recebido;
                alterar a taxa mantém o valor recebido e recalcula o bruto. Integração bancária (Banco Inter) preencherá o valor recebido automaticamente.
            </p>

            {/* Add month dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-emerald-600" />
                            Adicionar receita do mês
                        </DialogTitle>
                        <DialogDescription>
                            Informe o aluguel bruto ou o valor recebido; o outro é calculado pela taxa da imobiliária.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Mês</Label>
                                <Input type="month" value={addForm.month} onChange={e => setAddForm(f => ({ ...f, month: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Taxa da imobiliária (%)</Label>
                                <Input
                                    type="number" step="0.5" min={0} max={99}
                                    value={addForm.pct}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, pct: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Aluguel bruto (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="Ex: 4000.00"
                                    value={addForm.gross}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, gross: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Valor recebido (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="Ex: 3950.00"
                                    value={addForm.received}
                                    onChange={e => setAddForm(f => recalcFromReceived({ ...f, received: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Parcela de energia (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="Ex: 350.00"
                                    value={addForm.energy}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, energy: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Custo de energia (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="0.00"
                                    value={addForm.other}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, other: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Outras despesas (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="0.00"
                                    value={addForm.otherExp}
                                    onChange={e => setAddForm(f => ({ ...f, otherExp: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Comentários</Label>
                                <Input value={addForm.notes} placeholder="Opcional" onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                        </div>
                        {parseInput(addForm.received) !== null && (
                            <p className="text-xs text-muted-foreground">
                                Aluguel líquido:{" "}
                                <span className="font-semibold text-foreground">
                                    {formatBRL(breakdown({
                                        received_amount: parseInput(addForm.received) ?? 0,
                                        energy_portion: parseInput(addForm.energy) ?? 0,
                                        other_income: parseInput(addForm.other) ?? 0,
                                        agency_fee_pct: parseInput(addForm.pct) ?? 0,
                                    }).netRent)}
                                </span>
                                {addForm.month > currentMonthKey() && " · será marcado como previsto"}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={submitAdd}
                            disabled={parseInput(addForm.received) === null || saving.size > 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            Salvar mês
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import dialog */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="w-5 h-5 text-emerald-600" />
                            Importar planilha de receitas
                        </DialogTitle>
                        <DialogDescription>
                            Envie o modelo Excel preenchido (botão “Exportar modelo”): ele é importado na hora, sem mapear colunas,
                            substituindo todos os meses registrados. Outros .xlsx ou TSV/CSV com uma coluna de data passam pelo mapeamento abaixo.
                            Se a planilha trouxer o aluguel bruto do contrato, o valor recebido é calculado com a taxa e a energia já registradas no mês.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Arquivo (.xlsx do modelo, .csv, .tsv ou .txt)</Label>
                                <Input
                                    type="file"
                                    accept=".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
                                    disabled={parsingFile}
                                    onChange={e => onImportFile(e.target.files?.[0] ?? null)}
                                />
                                {parsingFile && (
                                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Lendo a planilha…
                                    </span>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label>Taxa da imobiliária aplicada aos meses importados (%)</Label>
                                <Input type="number" step="0.5" min={0} max={99} value={importPct} onChange={e => setImportPct(e.target.value)} />
                            </div>
                        </div>
                        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-emerald-600"
                                checked={replaceAll}
                                onChange={e => setReplaceAll(e.target.checked)}
                            />
                            <span>
                                <span className="font-semibold text-foreground">Substituir todos os meses existentes</span> — a planilha passa a ser o registro completo deste imóvel.
                                Desmarque para apenas atualizar os meses presentes na planilha e manter os demais.
                            </span>
                        </label>
                        <div className="space-y-1.5">
                            <Label>Ou cole aqui</Label>
                            <textarea
                                value={importText}
                                onChange={e => loadImportText(e.target.value)}
                                rows={4}
                                placeholder={"DATA\tRenda Aluguel\tComentarios\n24/09/2026\tR$ 3,950.00\t"}
                                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>

                        {templateDetected && (
                            <div className="text-xs rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between gap-3">
                                <span className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    Modelo Kitnets.com reconhecido — colunas mapeadas automaticamente.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowMapping(v => !v)}
                                    className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 shrink-0"
                                >
                                    {showMapping ? "Ocultar colunas" : "Ajustar colunas"}
                                </button>
                            </div>
                        )}

                        {sheet && sheet.headers.length > 0 && (!templateDetected || showMapping) && (
                            <div className="space-y-2">
                                <Label>Mapeamento das colunas</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {sheet.headers.map((h, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-xs">
                                            <span className={cn("flex-1 truncate", idx === sheet.dateColumn && "font-semibold")} title={h}>
                                                {h || `Coluna ${idx + 1}`}
                                                {idx === sheet.dateColumn && <span className="ml-1 text-emerald-600">(data)</span>}
                                            </span>
                                            {idx !== sheet.dateColumn && (
                                                <select
                                                    value={mapping[idx] ?? "ignore"}
                                                    onChange={e => setMapping(m => m.map((v, i) => (i === idx ? (e.target.value as IncomeField) : v)))}
                                                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                                >
                                                    {FIELD_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{INCOME_FIELD_LABELS[opt]}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {importError && (
                            <div className="text-xs text-rose-600 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5" /> {importError}
                            </div>
                        )}

                        {importRows.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{importRows.length} meses</span> reconhecidos
                                    ({formatMonthKey(importRows[0].month)} → {formatMonthKey(importRows[importRows.length - 1].month)}),{" "}
                                    {importRows.filter(r => r.status === "EXPECTED").length} futuros marcados como previstos.
                                </p>
                                <div className="overflow-x-auto border border-border rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                            <tr>
                                                <th className="text-left px-2 py-1">Mês</th>
                                                <th className="text-right px-2 py-1">Bruto</th>
                                                <th className="text-right px-2 py-1">Taxa</th>
                                                <th className="text-right px-2 py-1">Recebido</th>
                                                <th className="text-right px-2 py-1">Energia</th>
                                                <th className="text-right px-2 py-1">Custo de energia</th>
                                                <th className="text-right px-2 py-1">Outras despesas</th>
                                                <th className="text-left px-2 py-1">Comentários</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importRows.slice(-6).reverse().map(r => (
                                                <tr key={r.month} className="border-t border-border/60">
                                                    <td className="px-2 py-1 font-semibold">{formatMonthKey(r.month)}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.gross_rent !== undefined ? formatBRL(r.gross_rent) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.agency_fee_pct !== undefined ? `${r.agency_fee_pct}%` : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.received_amount !== undefined ? formatBRL(r.received_amount) : r.gross_rent !== undefined ? "calculado" : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.energy_portion !== undefined ? formatBRL(r.energy_portion) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.other_income !== undefined ? formatBRL(r.other_income) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.other_expenses !== undefined ? formatBRL(r.other_expenses) : "—"}</td>
                                                    <td className="px-2 py-1 truncate max-w-[180px]">{r.notes ?? ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {importDone !== null && (
                            <div className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {importDone} meses importados{replaceAll ? " (registro anterior substituído)" : ""}.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Fechar</Button>
                        <Button
                            onClick={() => runImportRows(importRows)}
                            disabled={importing || importRows.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                            {importDone !== null && !importing
                                ? "Importar novamente"
                                : `Importar ${importRows.length > 0 ? `${importRows.length} meses` : ""}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryTile({
    label, value, hint, icon, tone,
}: {
    label: string; value: string; hint: React.ReactNode; icon: React.ReactNode; tone: "emerald" | "blue" | "violet" | "amber" | "rose";
}) {
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
            <span className="text-lg font-bold text-foreground block tabular-nums">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
        </div>
    );
}
