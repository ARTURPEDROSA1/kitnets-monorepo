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
import PeriodFilter, { GroupSelect } from "./PeriodFilter";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "./TableColumnFilters";
import { CellSumBar, useCellSum } from "./TableCellSum";
import MoneyInput, { parseMoneyText } from "./MoneyInput";
import Tile, { type TileInfo } from "./Tile";
import { ColumnVisibilityButton, ColumnVisibilityMenu, useColumnVisibility } from "./TableColumnVisibility";
import { groupMonthly, periodLabel, periodRange, type ChartGroup, type PeriodFilterValue } from "@/lib/period-filter";
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
    aggregateIncomeByMonth,
    incomeRowKey,
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
    /** Units of a multi-unit property: the ledger then holds one row per month and unit (a "Unidade" column and select appear). */
    units?: Array<{ id: string; name: string }>;
}

const NO_UNITS: Array<{ id: string; name: string }> = [];

const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toInput = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");
const parseInput = (s: string): number | null => {
    const n = parseMoneyText(s);
    return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
};

type DraftField = "received" | "energy" | "other" | "otherExp" | "condo" | "pct" | "gross" | "notes" | "month";

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-08", "08/2026" or "ago/2026" → "2026-08" (null when not a month) */
function parseMonthText(text: string): string | null {
    const t = text.trim().toLowerCase();
    let m = t.match(/^(\d{4})-(\d{1,2})$/);
    if (m) { const mm = Number(m[2]); return mm >= 1 && mm <= 12 ? `${m[1]}-${String(mm).padStart(2, "0")}` : null; }
    m = t.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) { const mm = Number(m[1]); return mm >= 1 && mm <= 12 ? `${m[2]}-${String(mm).padStart(2, "0")}` : null; }
    m = t.match(/^([a-z]{3})\/(\d{4})$/);
    if (m) { const idx = MONTH_SHORT.indexOf(m[1]); return idx >= 0 ? `${m[2]}-${String(idx + 1).padStart(2, "0")}` : null; }
    return null;
}
type Drafts = Record<string, Partial<Record<DraftField, string>>>;

const FIELD_OPTIONS: IncomeField[] = ["unit", "gross", "fee_pct", "received", "energy", "other", "other_expenses", "condo", "fee_on_condo", "notes", "ignore"];
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
    units = NO_UNITS,
}: PropertyIncomeLedgerProps) {
    const multiUnit = units.length > 0;
    const vis = useColumnVisibility("income-ledger", { locked: ["month"] });
    const [localPeriod, setLocalPeriod] = useState<PeriodFilterValue>({ kind: "all" });   // the ledger opens on the whole history
    const period = periodProp ?? localPeriod;
    const setPeriod = onPeriodChange ?? setLocalPeriod;
    const range = useMemo(() => periodRange(period), [period]);
    const [chartGroup, setChartGroup] = useState<ChartGroup>("month");   // chart only; the table stays monthly

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

    // The ledger keeps one row per month and unit; everything above it (DRE, payback, rent history) works per month.
    const applyRows = useCallback((next: PropertyIncomeRow[]) => {
        setRows(next);
        onRowsChangeRef.current?.(aggregateIncomeByMonth(next));
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
            const months = inputs.map(r => incomeRowKey(r));   // row identity: month + unit
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

    const deleteRow = useCallback(
        async (row: PropertyIncomeRow) => {
            if (!endpoint) return;
            const month = monthKey(row.month), rk = incomeRowKey(row);
            if (!window.confirm(`Excluir ${formatMonthKey(month)}${row.unit_name ? ` · ${row.unit_name}` : ""}?`)) return;
            setSaving(prev => new Set([...prev, rk]));
            try {
                const res = await fetch(`${endpoint}?month=${month}${row.unit_id ? `&unit=${encodeURIComponent(row.unit_id)}` : ""}`, { method: "DELETE" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Erro ao excluir");
                applyRows(rows.filter(r => incomeRowKey(r) !== rk));
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setSaving(prev => {
                    const next = new Set(prev);
                    next.delete(rk);
                    return next;
                });
            }
        },
        [endpoint, rows, applyRows]
    );

    /** Moves a row to another month and/or unit: writes it under the new identity, then removes the old one. */
    const moveRow = useCallback(
        async (row: PropertyIncomeRow, to: { month?: string; unit_id?: string | null }) => {
            if (!endpoint) return;
            const fromMonth = monthKey(row.month), fromKey = incomeRowKey(row);
            const target = { month: to.month ?? fromMonth, unit_id: to.unit_id === undefined ? row.unit_id ?? null : to.unit_id };
            const targetKey = incomeRowKey(target);
            if (targetKey === fromKey) return;
            if (rows.some(r => incomeRowKey(r) === targetKey)) {
                const unitName = target.unit_id ? units.find(u => u.id === target.unit_id)?.name : null;
                setError(`Já existe um lançamento em ${formatMonthKey(target.month)}${unitName ? ` para ${unitName}` : multiUnit ? " para o imóvel inteiro" : ""}.`);
                return;
            }
            setSaving(prev => new Set([...prev, fromKey]));
            setError(null);
            try {
                const put = await fetch(endpoint, {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: [{
                        ...target, received_amount: row.received_amount, energy_portion: row.energy_portion, other_income: row.other_income,
                        other_expenses: row.other_expenses, condo_amount: row.condo_amount ?? 0, fee_on_condo: row.fee_on_condo ?? false, agency_fee_pct: row.agency_fee_pct, status: row.status, source: row.source,
                        received_on: row.received_on, notes: row.notes, bank_reference: row.bank_reference,
                    }] }),
                });
                const data = await put.json().catch(() => ({}));
                if (!put.ok) throw new Error(data.error || "Erro ao mover o lançamento");
                const del = await fetch(`${endpoint}?month=${fromMonth}${row.unit_id ? `&unit=${encodeURIComponent(row.unit_id)}` : ""}`, { method: "DELETE" });
                if (!del.ok) throw new Error((await del.json().catch(() => ({}))).error || "Erro ao remover o lançamento antigo");
                applyRows(((data.rows ?? []) as PropertyIncomeRow[]).filter(r => incomeRowKey(r) !== fromKey));
                setDrafts(prev => { const n = { ...prev }; delete n[fromKey]; return n; });
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setSaving(prev => { const n = new Set(prev); n.delete(fromKey); return n; });
            }
        },
        [endpoint, rows, applyRows, units, multiUnit]
    );

    // ── Inline editing ──────────────────────────────────────────────────
    // drafts are keyed by the row's identity (month + unit), like `saving`
    const setDraft = (rk: string, field: DraftField, value: string) =>
        setDrafts(prev => ({ ...prev, [rk]: { ...prev[rk], [field]: value } }));
    const cancelDraft = (rk: string, field: DraftField) =>
        setDrafts(prev => { const n = { ...prev, [rk]: { ...prev[rk] } }; delete n[rk][field]; return n; });

    const commitDraft = (row: PropertyIncomeRow, field: DraftField) => {
        const rk = incomeRowKey(row);
        const ident = { month: monthKey(row.month), unit_id: row.unit_id ?? null };
        const raw = drafts[rk]?.[field];
        if (raw === undefined) return;
        const b = breakdown(row);
        const clear = () =>
            setDrafts(prev => {
                const next = { ...prev, [rk]: { ...prev[rk] } };
                delete next[rk][field];
                return next;
            });

        if (field === "notes") {
            const notes = raw.trim() ? raw.trim().slice(0, 500) : null;
            if (notes === (row.notes ?? null)) return clear();
            return void putRows([{ ...ident, notes }]);
        }

        const value = parseInput(raw);
        if (value === null) return clear();

        if (field === "gross") {
            const received = receivedFromGross(value, b.feePct, b.energy, b.condo, b.feeOnCondo);
            if (received === b.received) return clear();
            return void putRows([{ ...ident, received_amount: received }]);
        }
        if (field === "condo") {
            if (value === b.condo) return clear();
            // the tenant's condominium comes inside the deposit: the rent stays, the deposit follows
            return void putRows([{ ...ident, condo_amount: value, ...keepRent(row) }]);
        }
        const key =
            field === "received" ? "received_amount"
                : field === "energy" ? "energy_portion"
                    : field === "other" ? "other_income"
                        : field === "otherExp" ? "other_expenses"
                            : "agency_fee_pct";
        if (field === "pct" && value >= 100) return clear();
        if (value === (Number(row[key]) || 0)) return clear();
        putRows([{ ...ident, [key]: value }]);
    };

    /**
     * Changing the condominium (or whether the fee reaches it) keeps the row's gross rent and lets the server
     * recalculate the deposit. A deposit read from the bank is a fact, so there the rent follows instead.
     */
    const keepRent = (row: PropertyIncomeRow): Pick<IncomeRowInput, "gross_rent"> =>
        row.source === "BANK" ? {} : { gross_rent: breakdown(row).grossRent };

    const toggleFeeOnCondo = (row: PropertyIncomeRow) =>
        putRows([{ month: monthKey(row.month), unit_id: row.unit_id ?? null, fee_on_condo: !row.fee_on_condo, ...keepRent(row) }]);

    /** The agreement with the agency is usually one for the whole property: applies it to every row with a condominium. */
    const setFeeOnCondoAll = (value: boolean) => {
        const targets = rows.filter(r => (Number(r.condo_amount) || 0) > 0 && Boolean(r.fee_on_condo) !== value);
        if (targets.length > 0) void putRows(targets.map(r => ({ month: monthKey(r.month), unit_id: r.unit_id ?? null, fee_on_condo: value, ...keepRent(r) })));
    };

    const toggleStatus = (row: PropertyIncomeRow) =>
        putRows([{ month: monthKey(row.month), unit_id: row.unit_id ?? null, status: row.status === "CONFIRMED" ? "EXPECTED" : "CONFIRMED" }]);

    // ── Derived ─────────────────────────────────────────────────────────
    /** Rows with a condominium: only then the "fee on the condominium" column and selector show up. */
    const condoRows = useMemo(() => rows.filter(r => (Number(r.condo_amount) || 0) > 0), [rows]);
    const hasCondo = condoRows.length > 0;
    const condoFeeMode: "rent" | "all" | "mixed" = !hasCondo || condoRows.every(r => !r.fee_on_condo) ? "rent" : condoRows.every(r => r.fee_on_condo) ? "all" : "mixed";
    const sorted = useMemo(() => [...rows].sort((a, b) => (a.month !== b.month ? (a.month < b.month ? 1 : -1) : (a.unit_name ?? "").localeCompare(b.unit_name ?? "", "pt-BR", { numeric: true }))), [rows]);
    /** Rows inside the selected period (newest first) — drives the chart and the table. */
    const filtered = useMemo(() => filterRowsByPeriod(sorted, range), [sorted, range]);
    // Excel-style column sort & filters on top of the period filter (table only; the chart follows the period)
    const columns = useMemo<ColumnDef<PropertyIncomeRow>[]>(() => [
        { key: "month", label: "Mês", kind: "month", get: r => monthKey(r.month) },
        ...(multiUnit ? [{
            key: "unit", label: "Unidade", kind: "enum" as const, title: "Unidade do imóvel a que o lançamento pertence",
            get: (r: PropertyIncomeRow) => r.unit_id ?? "",
            options: [...units.map(u => ({ value: u.id, label: u.name })), { value: "", label: "Imóvel inteiro" }],
        }] : []),
        { key: "gross", label: "Aluguel bruto", kind: "number", align: "right", get: r => breakdown(r).grossRent },
        { key: "pct", label: "Taxa %", kind: "number", align: "right", sum: false, get: r => Number(r.agency_fee_pct) || 0 },
        { key: "net", label: "Aluguel líquido", kind: "number", align: "right", title: "Recebido − energia − condomínio que veio no depósito (aluguel após a taxa)", get: r => breakdown(r).netRent },
        { key: "energy", label: "Energia", kind: "number", align: "right", title: "Parcela de energia paga pelo inquilino (centro solar)", get: r => breakdown(r).energy },
        { key: "received", label: "Recebido", kind: "number", align: "right", title: "O que entrou na conta", get: r => breakdown(r).received },
        { key: "other", label: "Custo de energia", kind: "number", align: "right", title: "Conta de luz paga no mês (custo à parte; não altera o recebido)", get: r => breakdown(r).other },
        { key: "otherExp", label: "Outras despesas", kind: "number", align: "right", title: "Outros custos pagos à parte no mês (reparos, taxas); não alteram o recebido", get: r => breakdown(r).otherExpenses },
        { key: "condo", label: "Condomínio", kind: "number", align: "right", title: "Condomínio da unidade no mês: despesa do imóvel, devida mesmo com a unidade vaga. Com a unidade alugada, o inquilino paga e o valor vem dentro do depósito da imobiliária.", get: r => breakdown(r).condo },
        ...(hasCondo ? [{
            key: "feeOnCondo", label: "Taxa s/ cond.", kind: "enum" as const, align: "center" as const,
            title: "A taxa da imobiliária incide também sobre o condomínio? Marcado = sobre aluguel + condomínio; desmarcado = só sobre o aluguel (condomínio repassado integralmente).",
            get: (r: PropertyIncomeRow) => (r.fee_on_condo ? "yes" : "no"),
            options: [{ value: "yes", label: "Aluguel + condomínio" }, { value: "no", label: "Só o aluguel" }],
        }] : []),
        { key: "status", label: "Status", kind: "enum", align: "center", get: r => r.status, options: [{ value: "CONFIRMED", label: "Confirmado" }, { value: "EXPECTED", label: "Previsto" }] },
        { key: "notes", label: "Comentários", kind: "text", get: r => r.notes ?? "" },
    ], [multiUnit, units, hasCondo]);
    const cf = useColumnFilters(filtered, columns, { key: "month", dir: "desc" });
    /** Months in the period (a multi-unit property has several rows per month). */
    const monthCount = useMemo(() => new Set(filtered.map(r => monthKey(r.month))).size, [filtered]);
    const visible = showAll ? cf.rows : cf.rows.slice(0, COLLAPSED_ROWS);
    /** Totals over the confirmed months inside the selected period (tiles 2–5). */
    const periodSummary = useMemo(() => summarize(filtered), [filtered]);
    // explanations for the five tiles (icon popup)
    const months = periodSummary.confirmedMonths;
    const ledgerInfo: Record<"gross" | "received" | "net" | "energy" | "fee", TileInfo> = {
        gross: {
            what: "O aluguel de contrato somado nos meses confirmados do período: o valor antes da taxa da administradora, sem a energia.",
            formula: <>Aluguel bruto do mês = (recebido − energia − condomínio no depósito) ÷ (1 − taxa %)<br />No período = Σ dos meses confirmados</>,
            example: months ? <>{formatBRL(periodSummary.totalGross)} em {months} {months === 1 ? "mês" : "meses"} · {periodLabel(period)}</> : undefined,
            note: "Meses marcados como previstos ficam fora dos totais.",
        },
        received: {
            what: "O que a imobiliária depositou nos meses confirmados: o aluguel líquido, a parcela de energia e o condomínio pagos pelo inquilino.",
            formula: <>Recebido = aluguel líquido + energia + condomínio no depósito<br />No período = Σ dos meses confirmados</>,
            example: months ? <>{formatBRL(periodSummary.totalNetRent)} + {formatBRL(periodSummary.totalEnergy)}{periodSummary.totalCondoIn > 0 && <> + {formatBRL(periodSummary.totalCondoIn)}</>} = {formatBRL(periodSummary.totalReceived)}</> : undefined,
            note: hasCondo ? "O condomínio é despesa do imóvel (devida mesmo com a unidade vaga). Com a unidade alugada o inquilino paga e o valor vem no depósito: integral quando a taxa incide só sobre o aluguel, líquido da taxa quando incide sobre aluguel + condomínio." : undefined,
        },
        net: {
            what: "O aluguel depois da taxa da administradora e sem a energia: o que o imóvel rende de aluguel de fato.",
            formula: <>Aluguel líquido = recebido − energia − condomínio no depósito<br />Média = total ÷ meses confirmados</>,
            example: months ? <>{formatBRL(periodSummary.totalReceived)} − {formatBRL(periodSummary.totalEnergy)}{periodSummary.totalCondoIn > 0 && <> − {formatBRL(periodSummary.totalCondoIn)}</>} = {formatBRL(periodSummary.totalNetRent)} · média {formatBRL(periodSummary.totalNetRent / months)}/mês</> : undefined,
        },
        energy: {
            what: "A energia paga pelo inquilino no período, a conta de luz que você pagou e o resultado. Com geração solar, o resultado é a economia que o sistema gera.",
            formula: "Resultado = energia recebida − custo de energia",
            example: months ? <>{formatBRL(periodSummary.totalEnergy)} − {formatBRL(periodSummary.totalOther)} = {formatBRL(periodSummary.totalEnergy - periodSummary.totalOther)}</> : undefined,
        },
        fee: {
            what: "Quanto foi para a administradora no período. Com a autogestão no Kitnets.com esse valor ficaria com você.",
            formula: <>Taxa do mês = aluguel bruto × taxa %{hasCondo && <> (+ condomínio × taxa %, quando a taxa incide sobre o condomínio)</>}<br />No período = Σ dos meses confirmados</>,
            example: months ? <>{formatBRL(periodSummary.totalFee)} em {months} {months === 1 ? "mês" : "meses"}</> : undefined,
            note: hasCondo ? "O acordo com a imobiliária define a base da taxa: só o aluguel (o condomínio é repassado integralmente) ou o valor total (aluguel + condomínio). Ajuste no seletor acima da tabela ou na coluna “Taxa s/ cond.”." : undefined,
        },
    };
    // Fee pre-fill: last month's fee when set, else the property default, else 10 %
    const lastRowPct = sorted.length ? Number(sorted[0].agency_fee_pct) : 0;
    const lastPct = lastRowPct > 0 ? lastRowPct : defaultAgencyFeePct > 0 ? defaultAgencyFeePct : DEFAULT_AGENCY_FEE_PCT;

    const chartData = useMemo(
        () =>
            aggregateIncomeByMonth(filtered)
                .sort((a, b) => (a.month < b.month ? -1 : 1))
                .map(r => {
                    const b = breakdown(r);
                    return {
                        key: monthKey(r.month),
                        month: formatMonthKey(monthKey(r.month)),
                        liquido: b.netRent,
                        energia: b.energy,
                        bruto: b.grossRent,
                        previsto: r.status === "EXPECTED",
                    };
                }),
        [filtered]
    );
    const chartPoints = useMemo(() => groupMonthly(chartData, chartGroup), [chartData, chartGroup]);

    // ── Add month dialog ────────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ month: currentMonthKey(), unit: "", gross: "", received: "", energy: "", other: "", otherExp: "", condo: "", feeOnCondo: false, pct: "", notes: "" });
    /** The agency agreement seen in the latest row with a condominium (of the unit, else of the ledger). */
    const lastFeeOnCondo = (unitId: string) => Boolean((sorted.find(r => (r.unit_id ?? "") === unitId && (Number(r.condo_amount) || 0) > 0) ?? sorted.find(r => (Number(r.condo_amount) || 0) > 0))?.fee_on_condo);
    /** Pre-fill from the latest row of a unit ("" = whole property); falls back to the latest row of the ledger. */
    const lastRowFor = (unitId: string) => sorted.find(r => (r.unit_id ?? "") === unitId) ?? (multiUnit ? undefined : sorted[0]);

    const openAdd = () => {
        const next = new Date();
        next.setMonth(next.getMonth() + 1);
        const suggestion = sorted.length && sorted[0].status === "CONFIRMED" && monthKey(sorted[0].month) === currentMonthKey()
            ? currentMonthKey(next)
            : currentMonthKey();
        // multi-unit: start on the first unit that has no row in the suggested month yet
        const unit = multiUnit ? (units.find(u => !rows.some(r => monthKey(r.month) === suggestion && r.unit_id === u.id)) ?? units[0]).id : "";
        const lastRow = lastRowFor(unit);
        const last = lastRow ? breakdown(lastRow) : null;
        setAddForm({
            month: suggestion,
            unit,
            gross: last ? toInput(last.grossRent) : "",
            received: last ? toInput(last.received) : "",
            energy: last ? toInput(last.energy) : "",
            other: last ? toInput(last.other) : "",
            otherExp: "",
            condo: last && last.condo > 0 ? toInput(last.condo) : "",
            feeOnCondo: lastFeeOnCondo(unit),
            pct: toInput(last && last.feePct > 0 ? last.feePct : lastPct),
            notes: "",
        });
        setAddOpen(true);
    };

    const recalcFromGross = (form: typeof addForm) => {
        const gross = parseInput(form.gross);
        if (gross === null) return form;
        const received = receivedFromGross(gross, parseInput(form.pct) ?? 0, parseInput(form.energy) ?? 0, parseInput(form.condo) ?? 0, form.feeOnCondo);
        return { ...form, received: toInput(received) };
    };
    const recalcFromReceived = (form: typeof addForm) => {
        const received = parseInput(form.received);
        if (received === null) return form;
        const b = breakdown({
            received_amount: received,
            energy_portion: parseInput(form.energy) ?? 0,
            other_income: parseInput(form.other) ?? 0,
            condo_amount: parseInput(form.condo) ?? 0,
            fee_on_condo: form.feeOnCondo,
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
                unit_id: multiUnit && addForm.unit ? addForm.unit : null,
                received_amount: received,
                energy_portion: parseInput(addForm.energy) ?? 0,
                other_income: parseInput(addForm.other) ?? 0,
                other_expenses: parseInput(addForm.otherExp) ?? 0,
                condo_amount: parseInput(addForm.condo) ?? 0,
                fee_on_condo: addForm.feeOnCondo && (parseInput(addForm.condo) ?? 0) > 0,
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

    /** The sheet names units: the preview and the messages then talk about entries, not months. */
    const importHasUnits = importRows.some(r => r.unit_name);

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
            const perUnit = rows.some(r => r.unit_name);
            setImportNotice(`${rows.length} ${perUnit ? (rows.length === 1 ? "lançamento importado" : "lançamentos importados") : rows.length === 1 ? "mês importado" : "meses importados"}${replace ? " · registro anterior substituído" : ""}`);
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
                        O condomínio é despesa do imóvel, devida mesmo com a unidade vaga; com a unidade alugada o inquilino paga e o valor vem dentro do depósito da imobiliária. A taxa da imobiliária pode incidir só sobre o aluguel ou sobre aluguel + condomínio.
                        Aluguel líquido (após a taxa) = recebido − energia − condomínio no depósito; aluguel bruto = líquido ÷ (1 − taxa); receita = bruto + energia + condomínio pago pelo inquilino; OPEX = taxa + custo de energia + outras despesas + condomínio (o IPTU pago por você entra pelo registro Tributos do imóvel, no mês do pagamento); NOI = recebido − custos.
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

            {/* Summary tiles: the five follow the period filter below */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Tile
                    label="Aluguel bruto no período"
                    value={formatBRL(periodSummary.totalGross)}
                    hint={periodSummary.confirmedMonths ? "Valor de contrato somado" : "Nenhum mês confirmado no período"}
                    icon={<Landmark className="w-4 h-4" />}
                    tone="emerald"
                    info={ledgerInfo.gross}
                />
                <Tile
                    label="Recebido no período"
                    value={formatBRL(periodSummary.totalReceived)}
                    hint={periodSummary.confirmedMonths
                        ? <>{periodSummary.confirmedMonths} {periodSummary.confirmedMonths === 1 ? "mês" : "meses"} · {periodLabel(period)}{periodSummary.totalCondoIn > 0 && <><br />inclui condomínio {formatBRL(periodSummary.totalCondoIn)}</>}</>
                        : `Nenhum mês confirmado · ${periodLabel(period)}`}
                    icon={<Wallet className="w-4 h-4" />}
                    tone="blue"
                    info={ledgerInfo.received}
                />
                <Tile
                    label="Aluguel líquido no período"
                    value={formatBRL(periodSummary.totalNetRent)}
                    hint={periodSummary.confirmedMonths ? `Média ${formatBRL(periodSummary.totalNetRent / periodSummary.confirmedMonths)}/mês` : "—"}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    tone="violet"
                    info={ledgerInfo.net}
                />
                <Tile
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
                    info={ledgerInfo.energy}
                />
                <Tile
                    label="Taxa da imobiliária no período"
                    value={formatBRL(periodSummary.totalFee)}
                    hint="Economia potencial com autogestão no Kitnets.com"
                    icon={<Building2 className="w-4 h-4" />}
                    tone="rose"
                    info={ledgerInfo.fee}
                />
            </div>

            {/* Period (shared with the DRE chart when controlled by the dashboard) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                    Período do gráfico e da tabela · <span className="font-semibold text-foreground">{periodLabel(period)}</span>
                    {" · "}{monthCount} {monthCount === 1 ? "mês" : "meses"}
                    {(multiUnit || cf.anyFilter) && <>{" · "}{cf.anyFilter ? `${cf.rows.length} de ${filtered.length}` : filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}</>}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                    <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                    {hasCondo && (
                        <select
                            value={condoFeeMode}
                            disabled={saving.size > 0}
                            onChange={e => setFeeOnCondoAll(e.target.value === "all")}
                            title="Acordo com a imobiliária: a taxa de administração incide só sobre o aluguel (o condomínio é repassado integralmente) ou sobre o valor total (aluguel + condomínio). Vale para todos os lançamentos com condomínio; cada linha pode ser ajustada na coluna “Taxa s/ cond.”."
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                            {condoFeeMode === "mixed" && <option value="mixed" disabled>Taxa: varia por lançamento</option>}
                            <option value="rent">Taxa só sobre o aluguel</option>
                            <option value="all">Taxa sobre aluguel + condomínio</option>
                        </select>
                    )}
                    <ColumnVisibilityButton ctl={vis} />
                    <GroupSelect value={chartGroup} onChange={setChartGroup} />
                </div>
            </div>

            {/* Chart */}
            {chartPoints.length > (chartGroup === "month" ? 1 : 0) && (
                <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartPoints} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    <table className="w-full text-xs" style={{ minWidth: `${Math.max(480, columns.filter(c => !vis.isHidden(c.key)).length * 104)}px` }}>
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2" />} />
                        </thead>
                        <tbody>
                            {visible.map(row => {
                                const month = monthKey(row.month);
                                const rk = incomeRowKey(row);   // identity of the row: month + unit
                                const b = breakdown(row);
                                const d = drafts[rk] ?? {};
                                const busy = saving.has(rk);
                                const show = (key: string) => !vis.isHidden(key);
                                const cell = (field: DraftField, value: number, step = "0.01") => field !== "pct" ? (
                                    <MoneyInput
                                        value={value}
                                        draft={d[field]}
                                        disabled={busy}
                                        onDraft={text => setDraft(rk, field, text)}
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
                                        onChange={e => setDraft(rk, field, e.target.value)}
                                        onBlur={() => commitDraft(row, field)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        }}
                                        className="text-right bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1.5 py-1 outline-none tabular-nums"
                                    />
                                );
                                return (
                                    <tr key={row.id} className={cn("border-b border-border/60 hover:bg-muted/30", row.status === "EXPECTED" && "opacity-70")}>
                                        <td {...sel.cellProps("month", rk, null, "px-2 py-1 font-semibold text-foreground whitespace-nowrap", () => cancelDraft(rk, "month"))}>
                                            <MonthCell
                                                month={month}
                                                draft={d.month}
                                                disabled={busy}
                                                onDraft={text => setDraft(rk, "month", text)}
                                                onCommit={() => {
                                                    const raw = drafts[rk]?.month;
                                                    if (raw === undefined) return;
                                                    const target = parseMonthText(raw);
                                                    cancelDraft(rk, "month");
                                                    if (!target) { setError("Mês inválido: use AAAA-MM ou MM/AAAA."); return; }
                                                    void moveRow(row, { month: target });
                                                }}
                                            />
                                            {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                        </td>
                                        {multiUnit && show("unit") && (
                                            <td {...sel.cellProps("unit", rk, null, "px-2 py-1 whitespace-nowrap")}>
                                                <select
                                                    disabled={busy}
                                                    value={row.unit_id ?? ""}
                                                    onChange={e => void moveRow(row, { unit_id: e.target.value || null })}
                                                    title="Unidade a que o lançamento pertence (duplo clique para trocar)"
                                                    className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[7rem] px-1 py-1 outline-none text-xs"
                                                >
                                                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                    {/* a unit that was removed from the property keeps its saved name */}
                                                    {row.unit_id && !units.some(u => u.id === row.unit_id) && <option value={row.unit_id}>{row.unit_name ?? "Unidade removida"}</option>}
                                                    <option value="">Imóvel inteiro</option>
                                                </select>
                                            </td>
                                        )}
                                        {show("gross") && <td {...sel.cellProps("gross", rk, b.grossRent, "px-2 py-1 text-right", () => cancelDraft(rk, "gross"))}>{cell("gross", b.grossRent)}</td>}
                                        {show("pct") && <td {...sel.cellProps("pct", rk, b.feePct, "px-2 py-1 text-right", () => cancelDraft(rk, "pct"))}>{cell("pct", b.feePct, "0.5")}</td>}
                                        {show("net") && <td {...sel.cellProps("net", rk, b.netRent, "px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums")}>{formatBRL(b.netRent)}</td>}
                                        {show("energy") && <td {...sel.cellProps("energy", rk, b.energy, "px-2 py-1 text-right", () => cancelDraft(rk, "energy"))}>{cell("energy", b.energy)}</td>}
                                        {show("received") && <td {...sel.cellProps("received", rk, b.received, "px-2 py-1 text-right", () => cancelDraft(rk, "received"))}>{cell("received", b.received)}</td>}
                                        {show("other") && <td {...sel.cellProps("other", rk, b.other, "px-2 py-1 text-right", () => cancelDraft(rk, "other"))}>{cell("other", b.other)}</td>}
                                        {show("otherExp") && <td {...sel.cellProps("otherExp", rk, b.otherExpenses, "px-2 py-1 text-right", () => cancelDraft(rk, "otherExp"))}>{cell("otherExp", b.otherExpenses)}</td>}
                                        {show("condo") && <td {...sel.cellProps("condo", rk, b.condo, "px-2 py-1 text-right", () => cancelDraft(rk, "condo"))}>{cell("condo", b.condo)}</td>}
                                        {hasCondo && show("feeOnCondo") && <td {...sel.cellProps("feeOnCondo", rk, null, "px-2 py-1 text-center")}>
                                            <input
                                                type="checkbox"
                                                className="accent-emerald-600 align-middle"
                                                disabled={busy || b.condo <= 0}
                                                checked={b.condo > 0 && b.feeOnCondo}
                                                onChange={() => toggleFeeOnCondo(row)}
                                                title={b.condo <= 0 ? "Sem condomínio neste lançamento"
                                                    : b.feeOnCondo ? `Taxa sobre aluguel + condomínio: ${formatBRL(b.condoFee)} de taxa sobre o condomínio, ${formatBRL(b.condoIn)} repassados`
                                                        : `Taxa só sobre o aluguel: condomínio repassado integralmente (${formatBRL(b.condoIn)})`}
                                            />
                                        </td>}
                                        {show("status") && <td {...sel.cellProps("status", rk, null, "px-2 py-1 text-center")}>
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                aria-disabled={busy}
                                                onDoubleClick={() => { if (!busy) toggleStatus(row); }}
                                                onKeyDown={e => { if (e.key === "Enter" && !busy) toggleStatus(row); }}
                                                title={row.status === "CONFIRMED" ? "Confirmado — duplo clique para marcar como previsto" : "Previsto — duplo clique para confirmar"}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                                    row.status === "CONFIRMED"
                                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                                )}
                                            >
                                                {row.status === "CONFIRMED" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {row.status === "CONFIRMED" ? "Confirmado" : "Previsto"}
                                            </span>
                                            {row.source !== "MANUAL" && (
                                                <span className="block text-[9px] text-muted-foreground mt-0.5">
                                                    {row.source === "BANK" ? "banco" : "planilha"}
                                                </span>
                                            )}
                                        </td>}
                                        {show("notes") && <td {...sel.cellProps("notes", rk, null, "px-2 py-1", () => cancelDraft(rk, "notes"))}>
                                            <input
                                                type="text"
                                                disabled={busy}
                                                value={d.notes ?? (row.notes ?? "")}
                                                placeholder="—"
                                                onChange={e => setDraft(rk, "notes", e.target.value)}
                                                onBlur={() => commitDraft(row, "notes")}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                }}
                                                className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[5rem] px-1.5 py-1 outline-none truncate"
                                            />
                                        </td>}
                                        <td className="px-2 py-1 text-right">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => deleteRow(row)}
                                                className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                title={multiUnit ? "Excluir lançamento" : "Excluir mês"}
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
                    <CellSumBar ctl={sel} />
                </div>
            )}

            <p className="text-[11px] text-muted-foreground">
                Edite qualquer célula e pressione Enter ou saia do campo para salvar. Alterar o aluguel bruto recalcula o valor recebido;
                alterar a taxa mantém o valor recebido e recalcula o bruto. Integração bancária (Banco Inter) preencherá o valor recebido automaticamente.
            </p>

            {/* Column sort/filter popup: at the root so an empty filter result never unmounts it */}
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} />

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
                        {multiUnit && (
                            <div className="space-y-1.5">
                                <Label>Unidade</Label>
                                <select
                                    value={addForm.unit}
                                    onChange={e => {
                                        const unit = e.target.value;
                                        const lastRow = lastRowFor(unit);
                                        const last = lastRow ? breakdown(lastRow) : null;
                                        // each unit has its own rent: start from that unit's latest row
                                        setAddForm(f => ({ ...f, unit, gross: last ? toInput(last.grossRent) : "", received: last ? toInput(last.received) : "", energy: last ? toInput(last.energy) : "", other: last ? toInput(last.other) : "", condo: last && last.condo > 0 ? toInput(last.condo) : "", feeOnCondo: lastFeeOnCondo(unit), pct: toInput(last && last.feePct > 0 ? last.feePct : lastPct) }));
                                    }}
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    <option value="">Imóvel inteiro (sem unidade)</option>
                                </select>
                                {rows.some(r => monthKey(r.month) === addForm.month && (r.unit_id ?? "") === addForm.unit) && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Esta unidade já tem um lançamento neste mês: salvar vai atualizá-lo.</p>
                                )}
                            </div>
                        )}
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
                                <Label>Condomínio (R$)</Label>
                                <Input
                                    type="number" step="0.01" min={0} placeholder="0.00"
                                    value={addForm.condo}
                                    onChange={e => setAddForm(f => recalcFromGross({ ...f, condo: e.target.value }))}
                                />
                            </div>
                        </div>
                        <label className={cn("flex items-start gap-2 text-xs text-muted-foreground select-none", (parseInput(addForm.condo) ?? 0) > 0 ? "cursor-pointer" : "opacity-60")}>
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-emerald-600"
                                disabled={(parseInput(addForm.condo) ?? 0) <= 0}
                                checked={addForm.feeOnCondo && (parseInput(addForm.condo) ?? 0) > 0}
                                onChange={e => setAddForm(f => recalcFromGross({ ...f, feeOnCondo: e.target.checked }))}
                            />
                            <span>
                                <span className="font-semibold text-foreground">A taxa da imobiliária incide também sobre o condomínio</span> — marque se a imobiliária cobra a taxa sobre o valor total (aluguel + condomínio).
                                Desmarcado, a taxa incide só sobre o aluguel e o condomínio é repassado integralmente. O condomínio pago pelo inquilino vem dentro do valor recebido; com a unidade vaga (aluguel 0) ele entra só como despesa.
                            </span>
                        </label>
                        <div className="space-y-1.5">
                            <Label>Comentários</Label>
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
                                        condo_amount: parseInput(addForm.condo) ?? 0,
                                        fee_on_condo: addForm.feeOnCondo,
                                        agency_fee_pct: parseInput(addForm.pct) ?? 0,
                                    }).netRent)}
                                </span>
                                {(parseInput(addForm.condo) ?? 0) > 0 && (() => {
                                    const c = breakdown({ received_amount: parseInput(addForm.received) ?? 0, energy_portion: parseInput(addForm.energy) ?? 0, other_income: 0, condo_amount: parseInput(addForm.condo) ?? 0, fee_on_condo: addForm.feeOnCondo, agency_fee_pct: parseInput(addForm.pct) ?? 0 });
                                    return <> · condomínio no depósito: <span className="font-semibold text-foreground">{formatBRL(c.condoIn)}</span>{c.condoFee > 0 && <> (taxa de {formatBRL(c.condoFee)})</>} · taxa total: <span className="font-semibold text-foreground">{formatBRL(c.feeAmount)}</span></>;
                                })()}
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
                                    <span className="font-semibold text-foreground">{importRows.length} {importHasUnits ? "lançamentos (um por mês e unidade)" : "meses"}</span> reconhecidos
                                    ({formatMonthKey(importRows[0].month)} → {formatMonthKey(importRows[importRows.length - 1].month)}),{" "}
                                    {importRows.filter(r => r.status === "EXPECTED").length} futuros marcados como previstos.
                                </p>
                                <div className="overflow-x-auto border border-border rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                            <tr>
                                                <th className="text-left px-2 py-1">Mês</th>
                                                {importHasUnits && <th className="text-left px-2 py-1">Unidade</th>}
                                                <th className="text-right px-2 py-1">Bruto</th>
                                                <th className="text-right px-2 py-1">Taxa</th>
                                                <th className="text-right px-2 py-1">Recebido</th>
                                                <th className="text-right px-2 py-1">Energia</th>
                                                <th className="text-right px-2 py-1">Custo de energia</th>
                                                <th className="text-right px-2 py-1">Outras despesas</th>
                                                <th className="text-right px-2 py-1">Condomínio</th>
                                                <th className="text-left px-2 py-1">Comentários</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importRows.slice(-6).reverse().map(r => (
                                                <tr key={`${r.month}|${r.unit_name ?? ""}`} className="border-t border-border/60">
                                                    <td className="px-2 py-1 font-semibold">{formatMonthKey(r.month)}</td>
                                                    {importHasUnits && <td className="px-2 py-1">{r.unit_name ?? "Imóvel inteiro"}</td>}
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.gross_rent !== undefined ? formatBRL(r.gross_rent) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.agency_fee_pct !== undefined ? `${r.agency_fee_pct}%` : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.received_amount !== undefined ? formatBRL(r.received_amount) : r.gross_rent !== undefined ? "calculado" : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.energy_portion !== undefined ? formatBRL(r.energy_portion) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.other_income !== undefined ? formatBRL(r.other_income) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.other_expenses !== undefined ? formatBRL(r.other_expenses) : "—"}</td>
                                                    <td className="px-2 py-1 text-right tabular-nums">{r.condo_amount !== undefined ? formatBRL(r.condo_amount) : "—"}</td>
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
                                : `Importar ${importRows.length > 0 ? `${importRows.length} ${importHasUnits ? "lançamentos" : "meses"}` : ""}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Month cell: "ago/2026" at rest, "2026-08" while editing (double-click); Enter/blur commits, Esc cancels. */
function MonthCell({ month, draft, disabled, onDraft, onCommit }: { month: string; draft?: string; disabled?: boolean; onDraft: (text: string) => void; onCommit: () => void }) {
    const [editing, setEditing] = useState(false);
    const text = editing ? (draft ?? month) : draft !== undefined ? draft : formatMonthKey(month);
    return (
        <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={text}
            title="AAAA-MM ou MM/AAAA"
            onFocus={e => { setEditing(true); requestAnimationFrame(() => e.target.select()); }}
            onChange={e => onDraft(e.target.value)}
            onBlur={() => { setEditing(false); onCommit(); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-full min-w-[5rem] bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none px-1.5 py-1 outline-none font-semibold text-foreground"
        />
    );
}
