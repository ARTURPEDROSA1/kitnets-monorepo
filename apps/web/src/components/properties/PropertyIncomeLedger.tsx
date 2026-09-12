"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Plus,
    Upload,
    Trash2,
    Wallet,
    Zap,
    Loader2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Landmark,
    Building2,
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
import {
    breakdown,
    buildImportRows,
    currentMonthKey,
    formatMonthKey,
    INCOME_FIELD_LABELS,
    monthKey,
    parseSheet,
    receivedFromGross,
    suggestMapping,
    summarize,
    type IncomeField,
    type IncomeRowInput,
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
}

const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toInput = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");
const parseInput = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

type DraftField = "received" | "energy" | "other" | "pct" | "gross" | "notes";
type Drafts = Record<string, Partial<Record<DraftField, string>>>;

const FIELD_OPTIONS: IncomeField[] = ["gross", "fee_pct", "received", "energy", "other", "notes", "ignore"];
const IMPORT_CHUNK = 300;
const DEFAULT_AGENCY_FEE_PCT = 10;
const COLLAPSED_ROWS = 24;

export default function PropertyIncomeLedger({ propertyId, defaultAgencyFeePct = 0, onRowsChange }: PropertyIncomeLedgerProps) {
    const [rows, setRows] = useState<PropertyIncomeRow[]>([]);
    const [loading, setLoading] = useState<boolean>(Boolean(propertyId));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Drafts>({});
    const [showAll, setShowAll] = useState(false);

    const onRowsChangeRef = useRef(onRowsChange);
    onRowsChangeRef.current = onRowsChange;

    const endpoint = propertyId ? `/api/properties/${propertyId}/income` : null;

    const applyRows = useCallback((next: PropertyIncomeRow[]) => {
        setRows(next);
        onRowsChangeRef.current?.(next);
    }, []);

    // ── Load ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!endpoint) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
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
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [endpoint, applyRows]);

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
            const received = receivedFromGross(value, b.feePct, b.energy, b.other);
            if (received === b.received) return clear();
            return void putRows([{ month, received_amount: received }]);
        }
        const key =
            field === "received" ? "received_amount"
                : field === "energy" ? "energy_portion"
                    : field === "other" ? "other_income"
                        : "agency_fee_pct";
        if (field === "pct" && value >= 100) return clear();
        if (value === Number(row[key])) return clear();
        putRows([{ month, [key]: value }]);
    };

    const toggleStatus = (row: PropertyIncomeRow) =>
        putRows([{ month: monthKey(row.month), status: row.status === "CONFIRMED" ? "EXPECTED" : "CONFIRMED" }]);

    // ── Derived ─────────────────────────────────────────────────────────
    const sorted = useMemo(() => [...rows].sort((a, b) => (a.month < b.month ? 1 : -1)), [rows]);
    const visible = showAll ? sorted : sorted.slice(0, COLLAPSED_ROWS);
    const summary = useMemo(() => summarize(rows), [rows]);
    // Fee pre-fill: last month's fee when set, else the property default, else 10 %
    const lastRowPct = sorted.length ? Number(sorted[0].agency_fee_pct) : 0;
    const lastPct = lastRowPct > 0 ? lastRowPct : defaultAgencyFeePct > 0 ? defaultAgencyFeePct : DEFAULT_AGENCY_FEE_PCT;

    const chartData = useMemo(
        () =>
            [...rows]
                .sort((a, b) => (a.month < b.month ? -1 : 1))
                .slice(-24)
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
        [rows]
    );

    // ── Add month dialog ────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ month: currentMonthKey(), gross: "", received: "", energy: "", other: "", pct: "", notes: "" });

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
            pct: toInput(lastPct),
            notes: "",
        });
        setAddOpen(true);
    };

    const recalcFromGross = (form: typeof addForm) => {
        const gross = parseInput(form.gross);
        if (gross === null) return form;
        const received = receivedFromGross(gross, parseInput(form.pct) ?? 0, parseInput(form.energy) ?? 0, parseInput(form.other) ?? 0);
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

    const openImport = () => {
        setImportText("");
        setSheet(null);
        setMapping([]);
        setImportPct(toInput(lastPct));
        setImportError(null);
        setImportDone(null);
        setImportOpen(true);
    };

    const loadImportText = (text: string) => {
        setImportText(text);
        setImportDone(null);
        const parsed = parseSheet(text);
        setSheet(parsed);
        setMapping(suggestMapping(parsed.headers, parsed.dateColumn));
        setImportError(parsed.dateColumn < 0 && parsed.rows.length > 0 ? "Não encontrei uma coluna de data (dd/mm/aaaa)." : null);
    };

    const onImportFile = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => loadImportText(String(reader.result ?? ""));
        reader.readAsText(file, "utf-8");
    };

    const importRows = useMemo(() => {
        if (!sheet || sheet.dateColumn < 0) return [];
        return buildImportRows(sheet, mapping, { agencyFeePct: parseInput(importPct) ?? 0 });
    }, [sheet, mapping, importPct]);

    const runImport = async () => {
        if (!endpoint || importRows.length === 0) return;
        setImporting(true);
        setImportError(null);
        try {
            let lastRows: PropertyIncomeRow[] | null = null;
            for (let i = 0; i < importRows.length; i += IMPORT_CHUNK) {
                // `line` is only used for the preview; the API ignores unknown fields.
                const chunk = importRows.slice(i, i + IMPORT_CHUNK);
                const res = await fetch(endpoint, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: chunk }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao importar");
                lastRows = data.rows ?? [];
            }
            if (lastRows) applyRows(lastRows);
            setImportDone(importRows.length);
            setDrafts({});
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

    const latest = summary.latest;

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        Receitas de Aluguel (valores reais)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        O que entrou na conta a cada mês. A parcela de energia é deduzida do aluguel e vai para o centro de energia solar.
                        Aluguel líquido = recebido − energia − outras despesas; aluguel bruto = líquido ÷ (1 − taxa da imobiliária).
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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

            {/* Summary tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <SummaryTile
                    label={latest ? `Último mês (${formatMonthKey(monthKey(latest.month))})` : "Último mês"}
                    value={latest ? formatBRL(latest.received) : "—"}
                    hint={latest ? `Líquido ${formatBRL(latest.netRent)} · Bruto ${formatBRL(latest.grossRent)}` : "Nenhum mês confirmado"}
                    icon={<Landmark className="w-4 h-4" />}
                    tone="emerald"
                />
                <SummaryTile
                    label="Recebido acumulado"
                    value={formatBRL(summary.totalReceived)}
                    hint={summary.confirmedMonths ? `${summary.confirmedMonths} meses confirmados${summary.firstMonth ? ` desde ${formatMonthKey(summary.firstMonth)}` : ""}` : "—"}
                    icon={<Wallet className="w-4 h-4" />}
                    tone="blue"
                />
                <SummaryTile
                    label="Aluguel líquido · 12 meses"
                    value={formatBRL(summary.netRent12m)}
                    hint={`Acumulado ${formatBRL(summary.totalNetRent)}`}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    tone="violet"
                />
                <SummaryTile
                    label="Energia (centro solar) · 12 meses"
                    value={formatBRL(summary.energy12m)}
                    hint={`Acumulado ${formatBRL(summary.totalEnergy)}`}
                    icon={<Zap className="w-4 h-4" />}
                    tone="amber"
                />
                <SummaryTile
                    label="Taxa da imobiliária · 12 meses"
                    value={formatBRL(summary.fee12m)}
                    hint={`Acumulado ${formatBRL(summary.totalFee)} · economia potencial com autogestão no Kitnets.com`}
                    icon={<Building2 className="w-4 h-4" />}
                    tone="rose"
                />
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
                                formatter={(value) => [formatBRL(Number(value)), ""]}
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
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando receitas…
                </div>
            ) : sorted.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Nenhuma receita registrada. Adicione um mês ou importe a planilha de aluguéis.
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs min-w-[900px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="text-left px-2 py-2 font-semibold">Mês</th>
                                <th className="text-right px-2 py-2 font-semibold">Aluguel bruto</th>
                                <th className="text-right px-2 py-2 font-semibold">Taxa %</th>
                                <th className="text-right px-2 py-2 font-semibold">Recebido</th>
                                <th className="text-right px-2 py-2 font-semibold">Energia</th>
                                <th className="text-right px-2 py-2 font-semibold">Outras despesas</th>
                                <th className="text-right px-2 py-2 font-semibold">Aluguel líquido</th>
                                <th className="text-center px-2 py-2 font-semibold">Status</th>
                                <th className="text-left px-2 py-2 font-semibold">Obs.</th>
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(row => {
                                const month = monthKey(row.month);
                                const b = breakdown(row);
                                const d = drafts[month] ?? {};
                                const busy = saving.has(month);
                                const cell = (field: DraftField, value: number, step = "0.01") => (
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
                                        className={cn(
                                            "w-24 text-right bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none tabular-nums",
                                            field === "gross" && "text-foreground font-semibold"
                                        )}
                                    />
                                );
                                return (
                                    <tr key={row.id} className={cn("border-b border-border/60 hover:bg-muted/30", row.status === "EXPECTED" && "opacity-70")}>
                                        <td className="px-2 py-1 font-semibold text-foreground whitespace-nowrap">
                                            {formatMonthKey(month)}
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        <td className="px-2 py-1 text-right">{cell("gross", b.grossRent)}</td>
                                        <td className="px-2 py-1 text-right">{cell("pct", b.feePct, "0.5")}</td>
                                        <td className="px-2 py-1 text-right">{cell("received", b.received)}</td>
                                        <td className="px-2 py-1 text-right">{cell("energy", b.energy)}</td>
                                        <td className="px-2 py-1 text-right">{cell("other", b.other)}</td>
                                        <td className="px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatBRL(b.netRent)}</td>
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
                                        <td className="px-2 py-1">
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
                                                className="w-40 bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-md px-1.5 py-1 outline-none truncate"
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
                    {sorted.length > COLLAPSED_ROWS && (
                        <button
                            type="button"
                            onClick={() => setShowAll(v => !v)}
                            className="mt-2 mx-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                            {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {showAll ? "Mostrar apenas os últimos 24 meses" : `Mostrar todos os ${sorted.length} meses`}
                        </button>
                    )}
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
                                <Label>Outras despesas (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="0.00"
                                    value={addForm.other}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, other: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Observações</Label>
                            <Input value={addForm.notes} placeholder="Opcional" onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
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
                            Cole ou envie um arquivo TSV/CSV (copiado do Excel / Google Sheets) com uma coluna de data e colunas de valores.
                            Meses já existentes são atualizados apenas nas colunas mapeadas; os demais campos são mantidos.
                            Se a planilha trouxer o aluguel bruto do contrato, o valor recebido é calculado com a taxa e a energia já registradas no mês.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Arquivo (.txt, .tsv, .csv)</Label>
                                <Input type="file" accept=".txt,.tsv,.csv,text/plain,text/csv" onChange={e => onImportFile(e.target.files?.[0] ?? null)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Taxa da imobiliária aplicada aos meses importados (%)</Label>
                                <Input type="number" step="0.5" min={0} max={99} value={importPct} onChange={e => setImportPct(e.target.value)} />
                            </div>
                        </div>
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

                        {sheet && sheet.headers.length > 0 && (
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
                                                <th className="text-right px-2 py-1">Outras despesas</th>
                                                <th className="text-left px-2 py-1">Obs.</th>
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
                                <CheckCircle2 className="w-3.5 h-3.5" /> {importDone} meses importados.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Fechar</Button>
                        <Button
                            onClick={runImport}
                            disabled={importing || importRows.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                            Importar {importRows.length > 0 ? `${importRows.length} meses` : ""}
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
    label: string; value: string; hint: string; icon: React.ReactNode; tone: "emerald" | "blue" | "violet" | "amber" | "rose";
}) {
    const tones = {
        emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
        blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
        violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
        amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
        rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    } as const;
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider truncate">{label}</span>
                <span className={cn("p-1.5 rounded-lg", tones[tone])}>{icon}</span>
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums">{value}</span>
            <span className="text-[11px] text-muted-foreground block truncate" title={hint}>{hint}</span>
        </div>
    );
}
