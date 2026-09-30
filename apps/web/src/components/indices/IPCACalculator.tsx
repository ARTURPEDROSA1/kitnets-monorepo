"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { IndexValueForCalc } from "@/lib/indexes";
import { DateInput } from "@/components/ui/DateInput";
import { addMonths, correctByIndex, firstDayOfMonth, formatDateBR, formatMonthBR, formatMonthsCount, lastDayOfMonth, normalizeCalcDate, type CorrectionResult } from "@/lib/index-correction";
import {
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from "recharts";
import {
    Calculator,
    TrendingUp,
    DollarSign,
    Percent,
    CalendarRange,
    RotateCcw,
    Copy,
    Check,
    Info,
    Zap,
    ChevronDown,
} from "lucide-react";

interface IPCACalculatorProps {
    data: IndexValueForCalc[];
    /** how the index is written in the texts ("IPCA", "IGP-M", "Selic"…); default "IPCA" */
    indexLabel?: string;
    /** Portuguese gender of the index name: "pela Selic", "Última Selic disponível" */
    feminine?: boolean;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function formatBRL(value: number): string {
    return value.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function parseBRLInput(raw: string): number {
    // Remove everything except digits and comma
    const cleaned = raw.replace(/[^\d,]/g, "");
    // Replace comma with dot
    return parseFloat(cleaned.replace(",", ".")) || 0;
}

/** ISO dates compare as strings */
const laterOf = (a: string, b: string) => (a < b ? b : a);

const DATE_INPUT = "w-full h-11 px-3 rounded-lg border border-input bg-background text-sm ring-offset-background transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function IPCACalculator({ data, indexLabel = "IPCA", feminine = false }: IPCACalculatorProps) {
    const pelo = feminine ? "pela" : "pelo";
    const artigo = feminine ? "a" : "o";
    const anchorId = `calculadora-${indexLabel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}`;
    // Boundaries from data: the series is monthly, so the dates run from the first day of the
    // earliest month to the last day of the latest one
    const earliestMonth = data.length > 0 ? data[0].month : "1995-01";
    const latestMonth = data.length > 0 ? data[data.length - 1].month : "2026-01";
    const minDate = firstDayOfMonth(earliestMonth);
    const maxDate = lastDayOfMonth(latestMonth);

    // Default: the last twelve published months (a month's last day to the latest month's last day)
    const defaultEnd = maxDate;
    const defaultStart = laterOf(lastDayOfMonth(addMonths(latestMonth, -12)), minDate);

    // State
    const [rawValue, setRawValue] = useState("1.000,00");
    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(defaultEnd);
    const [result, setResult] = useState<CorrectionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [valueError, setValueError] = useState<string | null>(null);
    const [tablePage, setTablePage] = useState(0);
    const [showBaseline, setShowBaseline] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const ROWS_PER_PAGE = 25;

    // Currency input handler
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;
        // Allow only digits, dots, commas
        const cleaned = input.replace(/[^\d.,]/g, "");
        setRawValue(cleaned);
        setValueError(null);
    };

    // Format on blur
    const handleValueBlur = () => {
        const num = parseBRLInput(rawValue);
        if (num > 0) {
            setRawValue(formatBRL(num));
            setValueError(null);
        }
    };

    // Quick picks: "this year" starts on the last day of the previous year, so January counts whole
    const quickPicks = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return [
            { label: "Últimos 12 meses", start: laterOf(lastDayOfMonth(addMonths(latestMonth, -12)), minDate), end: maxDate },
            { label: "Esse Ano", start: laterOf(`${currentYear - 1}-12-31`, minDate), end: maxDate },
        ];
    }, [latestMonth, minDate, maxDate]);

    // Calculate
    const handleCalculate = useCallback(() => {
        const valor = parseBRLInput(rawValue);
        if (valor <= 0) {
            setValueError("Informe um valor maior que zero.");
            setResult(null);
            setError(null);
            return;
        }
        setValueError(null);

        if (!startDate || !endDate) {
            setError("Informe as duas datas (dd/mm/aaaa).");
            setResult(null);
            return;
        }
        if (endDate <= startDate) {
            setError("A data final deve ser posterior à data inicial.");
            setResult(null);
            return;
        }

        setIsCalculating(true);
        // Use requestAnimationFrame to allow UI update before heavy calc
        requestAnimationFrame(() => {
            const res = correctByIndex(valor, startDate, endDate, data);
            if ("error" in res) {
                setError(res.error);
                setResult(null);
            } else {
                setError(null);
                setResult(res);
                setTablePage(0);
            }
            setIsCalculating(false);
        });
    }, [rawValue, startDate, endDate, data]);

    // Clear
    const handleClear = () => {
        setRawValue("1.000,00");
        setStartDate(defaultStart);
        setEndDate(defaultEnd);
        setResult(null);
        setError(null);
        setValueError(null);
        setTablePage(0);
    };

    // Copy link
    const handleCopyLink = () => {
        const valor = parseBRLInput(rawValue);
        const url = new URL(window.location.href);
        url.searchParams.set("calcValor", String(valor));
        url.searchParams.set("calcInicio", startDate);
        url.searchParams.set("calcFim", endDate);
        navigator.clipboard.writeText(url.toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Load from URL params on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const v = params.get("calcValor");
        // links from before day precision carry months: they meant the month's last day
        const s = normalizeCalcDate(params.get("calcInicio"));
        const e = normalizeCalcDate(params.get("calcFim"));
        if (v && s && e) {
            const numVal = parseFloat(v);
            if (numVal > 0) {
                setRawValue(formatBRL(numVal));
                setStartDate(s);
                setEndDate(e);
                // Auto-calculate
                setTimeout(() => {
                    const res = correctByIndex(numVal, s, e, data);
                    if (!("error" in res)) {
                        setResult(res);
                    }
                }, 100);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Chart data
    const chartData = useMemo(() => {
        if (!result || result.rows.length === 0) return [];
        const originalValue = parseBRLInput(rawValue);
        return [
            { month: formatDateBR(result.startDate), corrected: originalValue, original: originalValue },
            ...result.rows.map((row, i) => ({
                // a partial last month is labelled by the end date, a whole month by its name
                month: i === result.rows.length - 1 && row.fraction < 1 ? formatDateBR(result.endDate) : formatMonthBR(row.month),
                corrected: parseFloat(row.valueAtMonth.toFixed(2)),
                original: originalValue,
                ipca: row.appliedPercent,
                delta: parseFloat(row.deltaMonth.toFixed(2)),
            })),
        ];
    }, [result, rawValue]);

    // Table pagination
    const totalPages = result
        ? Math.ceil(result.rows.length / ROWS_PER_PAGE)
        : 0;

    const paginatedRows = useMemo(() => {
        if (!result) return [];
        const start = tablePage * ROWS_PER_PAGE;
        return result.rows.slice(start, start + ROWS_PER_PAGE);
    }, [result, tablePage]);

    return (
        <div
            id={anchorId}
            className="md:col-span-3 min-w-0 scroll-mt-20"
        >
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
                {/* Header with gradient accent */}
                <div className="relative px-4 py-5 md:px-6 md:py-6 border-b bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5 dark:from-emerald-500/10 dark:via-teal-500/10 dark:to-cyan-500/10">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                            <Calculator className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg md:text-xl font-bold tracking-tight">
                                Calculadora de Correção {pelo} {indexLabel}
                            </h3>
                            <p className="text-xs md:text-sm text-muted-foreground">
                                Simule a correção de um valor {pelo} {indexLabel} entre duas datas.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Inputs */}
                <div className="p-4 md:p-6 space-y-5">
                    {/* Quick picks */}
                    <div className="flex flex-wrap gap-2">
                        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground mr-1">
                            <Zap className="h-3 w-3" /> Atalhos:
                        </span>
                        {quickPicks.map((qp) => (
                            <button
                                key={qp.label}
                                type="button"
                                onClick={() => {
                                    setStartDate(qp.start);
                                    setEndDate(qp.end);
                                }}
                                className="px-3 py-1.5 text-xs font-medium rounded-full border border-border bg-background 
                                    hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700
                                    dark:hover:bg-emerald-950/40 dark:hover:border-emerald-700 dark:hover:text-emerald-400
                                    transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            >
                                {qp.label}
                            </button>
                        ))}
                    </div>

                    {/* Input fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Valor */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="calc-valor"
                                className="text-sm font-medium text-foreground flex items-center gap-1"
                            >
                                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                Valor a ser corrigido
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                                    R$
                                </span>
                                <input
                                    id="calc-valor"
                                    type="text"
                                    inputMode="decimal"
                                    value={rawValue}
                                    onChange={handleValueChange}
                                    onBlur={handleValueBlur}
                                    placeholder="Ex.: 1.000,00"
                                    className={`w-full h-11 pl-10 pr-3 rounded-lg border text-sm bg-background
                                        ring-offset-background transition-all
                                        focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500
                                        ${valueError ? "border-red-500 focus:ring-red-500/40" : "border-input"}`}
                                />
                            </div>
                            {valueError && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                    <Info className="h-3 w-3" /> {valueError}
                                </p>
                            )}
                        </div>

                        {/* Data inicial */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="calc-start"
                                className="text-sm font-medium text-foreground flex items-center gap-1"
                            >
                                <CalendarRange className="h-3.5 w-3.5 text-emerald-600" />
                                Data inicial
                            </label>
                            <DateInput
                                id="calc-start"
                                value={startDate}
                                onChange={setStartDate}
                                variant="bare"
                                className={DATE_INPUT}
                            />
                        </div>

                        {/* Data final */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="calc-end"
                                className="text-sm font-medium text-foreground flex items-center gap-1"
                            >
                                <CalendarRange className="h-3.5 w-3.5 text-emerald-600" />
                                Data final
                            </label>
                            <DateInput
                                id="calc-end"
                                value={endDate}
                                onChange={setEndDate}
                                variant="bare"
                                className={DATE_INPUT}
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={handleCalculate}
                                disabled={isCalculating}
                                className="flex-1 h-11 px-4 rounded-lg text-sm font-semibold
                                    bg-gradient-to-r from-emerald-600 to-teal-600 text-white
                                    hover:from-emerald-500 hover:to-teal-500
                                    shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50
                                    flex items-center justify-center gap-2"
                            >
                                <Calculator className="h-4 w-4" />
                                {isCalculating ? "Calculando..." : "Calcular"}
                            </button>
                            <button
                                type="button"
                                onClick={handleClear}
                                className="h-11 px-3 rounded-lg text-sm font-medium border border-border
                                    bg-background text-muted-foreground hover:bg-muted
                                    transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring
                                    flex items-center justify-center gap-1"
                                title="Limpar"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Helper note */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Info className="h-3 w-3 shrink-0" />
                            Conta os dias corridos entre as datas; nos meses parciais {artigo} {indexLabel} entra pro rata die, com capitalização composta.
                        </span>
                        <span>
                            {feminine ? "Última" : "Último"} {indexLabel} disponível: <strong>{formatMonthBR(latestMonth)}</strong> (datas de {formatDateBR(minDate)} a {formatDateBR(maxDate)})
                        </span>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4">
                            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                                <Info className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </p>
                        </div>
                    )}

                    {/* ──── Results ──── */}
                    {result && (
                        <div className="space-y-6 pt-2">
                            {/* Summary cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Valor corrigido */}
                                <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-4 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" /> Valor corrigido
                                    </p>
                                    <p className="text-xl md:text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                                        R$ {formatBRL(result.correctedValue)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Em {formatDateBR(result.endDate)}
                                    </p>
                                </div>

                                {/* Correção total */}
                                <div className="rounded-xl border bg-card p-4 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" /> Correção total
                                    </p>
                                    <p className="text-xl md:text-2xl font-bold text-foreground">
                                        R$ {formatBRL(result.totalCorrection)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Diferença no período
                                    </p>
                                </div>

                                {/* Variação acumulada */}
                                <div className="rounded-xl border bg-card p-4 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                        <Percent className="h-3 w-3" /> Variação acumulada
                                    </p>
                                    <p className="text-xl md:text-2xl font-bold text-foreground">
                                        {result.accumulatedPercent.toFixed(2).replace(".", ",")}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {indexLabel} acumulad{artigo}
                                    </p>
                                </div>

                                {/* Período */}
                                <div className="rounded-xl border bg-card p-4 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                        <CalendarRange className="h-3 w-3" /> Período
                                    </p>
                                    <p className="text-base md:text-lg font-bold text-foreground">
                                        {formatDateBR(result.startDate)} → {formatDateBR(result.endDate)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {result.days} {result.days === 1 ? "dia" : "dias"} · {formatMonthsCount(result.months)} {formatMonthsCount(result.months) === "1" ? "mês" : "meses"} de índice
                                    </p>
                                </div>
                            </div>

                            {/* Copy link button */}
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground
                                        hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border
                                        hover:bg-muted"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-3.5 w-3.5 text-emerald-500" /> Link copiado!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3.5 w-3.5" /> Copiar link da simulação
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Collapsible Details: Chart + Table */}
                            {(chartData.length > 1 || result.rows.length > 0) && (
                                <div className="rounded-xl border bg-card overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setDetailsOpen(prev => !prev)}
                                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground
                                            hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-inset"
                                    >
                                        <span className="flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                                            Ver detalhamento
                                            <span className="text-xs font-normal text-muted-foreground">
                                                (gráfico e tabela mês a mês)
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    {detailsOpen && (
                                        <div className="border-t px-4 py-5 md:px-6 space-y-6">
                                            {/* Chart */}
                                            {chartData.length > 1 && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-semibold text-foreground">
                                                            Evolução do Valor Corrigido
                                                        </h4>
                                                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={showBaseline}
                                                                onChange={(e) => setShowBaseline(e.target.checked)}
                                                                className="rounded border-input accent-emerald-600"
                                                            />
                                                            Mostrar valor original
                                                        </label>
                                                    </div>
                                                    <div className="h-[250px] md:h-[320px] w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <AreaChart
                                                                data={chartData}
                                                                margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
                                                            >
                                                                <defs>
                                                                    <linearGradient id="correctedGrad" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.25} />
                                                                        <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.02} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid
                                                                    strokeDasharray="3 3"
                                                                    vertical={false}
                                                                    stroke="hsl(var(--border))"
                                                                />
                                                                <XAxis
                                                                    dataKey="month"
                                                                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                                                    tickLine={false}
                                                                    axisLine={false}
                                                                    interval="preserveStartEnd"
                                                                />
                                                                <YAxis
                                                                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                                                                    tickLine={false}
                                                                    axisLine={false}
                                                                    tickFormatter={(v) => `R$${formatBRL(v)}`}
                                                                    width={100}
                                                                />
                                                                <RechartsTooltip
                                                                    contentStyle={{
                                                                        backgroundColor: "hsl(var(--card))",
                                                                        borderColor: "hsl(var(--border))",
                                                                        borderRadius: "10px",
                                                                        color: "hsl(var(--card-foreground))",
                                                                        fontSize: "12px",
                                                                        padding: "10px 14px",
                                                                    }}
                                                                    formatter={
                                                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                                        ((value: any, name: any) => {
                                                                            const v = Number(value ?? 0);
                                                                            if (name === "corrected")
                                                                                return [`R$ ${formatBRL(v)}`, "Valor corrigido"];
                                                                            return [`R$ ${formatBRL(v)}`, "Valor original"];
                                                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                                        }) as any
                                                                    }
                                                                    labelFormatter={(label) => `Mês: ${label}`}
                                                                />
                                                                {showBaseline && (
                                                                    <Line
                                                                        type="monotone"
                                                                        dataKey="original"
                                                                        name="original"
                                                                        stroke="hsl(var(--muted-foreground))"
                                                                        strokeWidth={1.5}
                                                                        strokeDasharray="6 4"
                                                                        dot={false}
                                                                    />
                                                                )}
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="corrected"
                                                                    name="corrected"
                                                                    stroke="hsl(160, 84%, 39%)"
                                                                    strokeWidth={2.5}
                                                                    fill="url(#correctedGrad)"
                                                                    dot={false}
                                                                    activeDot={{
                                                                        r: 5,
                                                                        fill: "hsl(160, 84%, 39%)",
                                                                        stroke: "#fff",
                                                                        strokeWidth: 2,
                                                                    }}
                                                                />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Monthly Breakdown Table */}
                                            {result.rows.length > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-sm font-semibold text-foreground">
                                                        Detalhamento Mês a Mês
                                                    </h4>
                                                    <div className="overflow-x-auto rounded-lg border">
                                                        <table className="w-full text-left text-sm">
                                                            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                                                                <tr className="border-b">
                                                                    <th className="p-3 font-medium min-w-[100px]">Mês/Ano</th>
                                                                    <th className="p-3 font-medium text-right min-w-[80px] hidden sm:table-cell" title="Dias corridos do mês dentro do período">Dias</th>
                                                                    <th className="p-3 font-medium text-right min-w-[100px]">{indexLabel} (%)</th>
                                                                    <th className="p-3 font-medium text-right min-w-[110px]" title="Índice aplicado: igual ao do mês quando o mês entra inteiro, pro rata die quando entra em parte">Aplicado (%)</th>
                                                                    <th className="p-3 font-medium text-right min-w-[120px] hidden sm:table-cell">Fator</th>
                                                                    <th className="p-3 font-medium text-right min-w-[140px]">Valor corrigido</th>
                                                                    <th className="p-3 font-medium text-right min-w-[120px] hidden md:table-cell">Variação (R$)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y">
                                                                {paginatedRows.map((row) => (
                                                                    <tr
                                                                        key={row.month}
                                                                        className="hover:bg-muted/30 transition-colors"
                                                                    >
                                                                        <td className="p-3 font-medium">{formatMonthBR(row.month)}</td>
                                                                        <td className="p-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell" title={row.fraction < 1 ? "Mês parcial: índice pro rata die" : undefined}>
                                                                            {row.daysApplied}/{row.daysInMonth}
                                                                        </td>
                                                                        <td className={`p-3 text-right tabular-nums ${row.indexPercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                                            {row.indexPercent.toFixed(2).replace(".", ",")}%
                                                                        </td>
                                                                        <td className={`p-3 text-right tabular-nums ${row.fraction < 1 ? "font-medium" : "text-muted-foreground"}`}>
                                                                            {row.appliedPercent.toFixed(row.fraction < 1 ? 4 : 2).replace(".", ",")}%
                                                                        </td>
                                                                        <td className="p-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                                                                            {row.factor.toFixed(6).replace(".", ",")}
                                                                        </td>
                                                                        <td className="p-3 text-right tabular-nums font-medium">
                                                                            R$ {formatBRL(row.valueAtMonth)}
                                                                        </td>
                                                                        <td className={`p-3 text-right tabular-nums hidden md:table-cell ${row.deltaMonth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                                            {row.deltaMonth >= 0 ? "+" : ""}R$ {formatBRL(row.deltaMonth)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Pagination */}
                                                    {totalPages > 1 && (
                                                        <div className="flex items-center justify-between pt-1">
                                                            <p className="text-xs text-muted-foreground">
                                                                Mostrando {tablePage * ROWS_PER_PAGE + 1}–
                                                                {Math.min((tablePage + 1) * ROWS_PER_PAGE, result.rows.length)} de{" "}
                                                                {result.rows.length} meses
                                                            </p>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={tablePage === 0}
                                                                    onClick={() => setTablePage(p => p - 1)}
                                                                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background
                                                                        hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                                >
                                                                    ← Anterior
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={tablePage >= totalPages - 1}
                                                                    onClick={() => setTablePage(p => p + 1)}
                                                                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background
                                                                        hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                                >
                                                                    Próxima →
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <p className="text-xs text-center text-muted-foreground md:hidden">← Deslize para ver mais →</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
