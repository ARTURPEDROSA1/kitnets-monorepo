"use client";

import React, { useMemo, useEffect } from "react";
import {
    X,
    TrendingUp,
    LineChart as LineChartIcon,
    DollarSign,
    Info,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Maximize2,
    Minimize2,
} from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import type { EnergyBillRecord } from "@/app/[lang]/dashboard/energy/[propertyId]/page";

interface HistoricUnitPriceModalProps {
    isOpen: boolean;
    onClose: () => void;
    bills: EnergyBillRecord[];
    currentUnitPrice?: number | null;
}

const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatNumber = (val: number, decimals = 4) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonthLabel(isoMonth: string): string {
    if (!isoMonth) return "-";
    const parts = isoMonth.split("-");
    if (parts.length < 2) return isoMonth;
    const m = parseInt(parts[1], 10);
    return `${MONTH_NAMES[m - 1] || parts[1]}/${parts[0].substring(2)}`;
}

function getFlagBadge(flagType?: string | null) {
    const raw = (flagType || "").trim();
    const lower = raw.toLowerCase();

    if (lower.includes("verde") || lower.includes("green")) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {raw || "Verde"}
            </span>
        );
    }

    if (lower.includes("amarel") || lower.includes("yellow")) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {raw || "Amarela"}
            </span>
        );
    }

    if (lower.includes("vermelh") || lower.includes("red") || lower.includes("escassez")) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                {raw || "Vermelha"}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border whitespace-nowrap">
            {raw || "Normal"}
        </span>
    );
}

type RangeFilter = "YTD" | "1Y" | "2Y" | "3Y" | "4Y" | "5Y" | "ALL";

const RANGE_OPTIONS: { key: RangeFilter; label: string }[] = [
    { key: "YTD", label: "YTD" },
    { key: "1Y", label: "1 Year" },
    { key: "2Y", label: "2 Year" },
    { key: "3Y", label: "3 Year" },
    { key: "4Y", label: "4 Year" },
    { key: "5Y", label: "5 Year" },
    { key: "ALL", label: "All" },
];

export function HistoricUnitPriceModal({
    isOpen,
    onClose,
    bills,
    currentUnitPrice,
}: HistoricUnitPriceModalProps) {
    const [isMaximized, setIsMaximized] = React.useState(false);
    const [rangeFilter, setRangeFilter] = React.useState<RangeFilter>("ALL");

    // Reset maximized and filter states when closed
    useEffect(() => {
        if (!isOpen) {
            setIsMaximized(false);
            setRangeFilter("ALL");
        }
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Filter bills that have a valid unit price and sort chronologically
    const allTariffHistory = useMemo(() => {
        const valid = bills
            .filter((b) => typeof b.unit_price === "number" && b.unit_price > 0)
            .sort((a, b) => a.reference_month.localeCompare(b.reference_month))
            .map((b) => ({
                reference_month: b.reference_month,
                label: b.reference_month_label || formatMonthLabel(b.reference_month),
                unit_price: Number(b.unit_price),
                grid_consumption_kwh: Number(b.grid_consumption_kwh) || 0,
                availability_cost_amount: Number(b.availability_cost_amount) || 0,
                flag_type: b.flag_type || "Normal",
                total_amount: Number(b.total_amount) || 0,
            }));

        return valid;
    }, [bills]);

    // Filter by selected range: YTD, 1 Year, 2 Year, 3 Year, 4 Year, 5 Year, All
    const tariffHistory = useMemo(() => {
        if (allTariffHistory.length === 0 || rangeFilter === "ALL") {
            return allTariffHistory;
        }

        const latest = allTariffHistory[allTariffHistory.length - 1];
        const [latestYear, latestMonth] = latest.reference_month.split("-").map(Number);

        if (rangeFilter === "YTD") {
            const cutoff = `${latestYear}-01`;
            const filtered = allTariffHistory.filter((item) => item.reference_month >= cutoff);
            return filtered.length > 0 ? filtered : allTariffHistory;
        }

        const yearsMap: Record<"1Y" | "2Y" | "3Y" | "4Y" | "5Y", number> = {
            "1Y": 1,
            "2Y": 2,
            "3Y": 3,
            "4Y": 4,
            "5Y": 5,
        };

        const years = yearsMap[rangeFilter as "1Y" | "2Y" | "3Y" | "4Y" | "5Y"];
        if (years) {
            const cutoffYear = latestYear - years;
            const cutoffMonth = String(latestMonth).padStart(2, "0");
            const cutoff = `${cutoffYear}-${cutoffMonth}`;
            const filtered = allTariffHistory.filter((item) => item.reference_month >= cutoff);
            return filtered.length > 0 ? filtered : allTariffHistory;
        }

        return allTariffHistory;
    }, [allTariffHistory, rangeFilter]);

    // Compute key statistics
    const stats = useMemo(() => {
        if (tariffHistory.length === 0) {
            return {
                latest: currentUnitPrice || 0,
                min: currentUnitPrice || 0,
                max: currentUnitPrice || 0,
                avg: currentUnitPrice || 0,
                deltaPercent: 0,
                count: 0,
            };
        }

        const prices = tariffHistory.map((t) => t.unit_price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((acc, v) => acc + v, 0) / prices.length;
        const latest = prices[prices.length - 1];
        const first = prices[0];
        const deltaPercent = first > 0 ? ((latest - first) / first) * 100 : 0;

        return {
            latest,
            min,
            max,
            avg,
            deltaPercent,
            count: tariffHistory.length,
        };
    }, [tariffHistory, currentUnitPrice]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 sm:pl-[calc(var(--sidebar-width)+1.5rem)] overflow-y-auto animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={`bg-card border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
                isMaximized
                    ? "w-full max-w-7xl h-[94vh]"
                    : "w-full max-w-2xl max-h-[90vh]"
            }`}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400">
                            <LineChartIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">
                                Histórico do Preço Unitário da Tarifa
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Evolução da tarifa efetiva em R$/kWh (inclui TE, TUSD, tributos e bandeiras)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsMaximized((prev) => !prev)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={isMaximized ? "Restaurar" : "Maximizar"}
                            aria-label={isMaximized ? "Restaurar" : "Maximizar"}
                        >
                            {isMaximized ? (
                                <Minimize2 className="w-4 h-4" />
                            ) : (
                                <Maximize2 className="w-4 h-4" />
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Fechar"
                            aria-label="Fechar modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Summary KPI Cards inside modal */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* Current/Latest Tariff */}
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Tarifa Vigente
                            </span>
                            <p className="text-lg font-black font-mono text-foreground">
                                R$ {formatNumber(stats.latest, 4)}
                            </p>
                            <span className="text-[10px] text-muted-foreground">Último ciclo faturado</span>
                        </div>

                        {/* Average Tariff */}
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Tarifa Média
                            </span>
                            <p className="text-lg font-bold font-mono text-foreground">
                                R$ {formatNumber(stats.avg, 4)}
                            </p>
                            <span className="text-[10px] text-muted-foreground">Média do período</span>
                        </div>

                        {/* Minimum Tariff */}
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                Mínima
                            </span>
                            <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300">
                                R$ {formatNumber(stats.min, 4)}
                            </p>
                            <span className="text-[10px] text-muted-foreground">Menor valor registrado</span>
                        </div>

                        {/* Maximum Tariff */}
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                Máxima
                            </span>
                            <p className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">
                                R$ {formatNumber(stats.max, 4)}
                            </p>
                            <span className="text-[10px] text-muted-foreground">Maior valor registrado</span>
                        </div>
                    </div>

                    {/* Chart Container */}
                    <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                    <TrendingUp className="w-4 h-4 text-blue-500" />
                                    Curva de Variação Tarifária (R$/kWh)
                                </h4>
                                {stats.deltaPercent !== 0 && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${
                                        stats.deltaPercent > 0
                                            ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950"
                                            : "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950"
                                    }`}>
                                        {stats.deltaPercent > 0 ? (
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                        ) : (
                                            <ArrowDownRight className="w-3.5 h-3.5" />
                                        )}
                                        {stats.deltaPercent > 0 ? "+" : ""}{stats.deltaPercent.toFixed(2)}%
                                    </span>
                                )}
                            </div>

                            {/* Range Filters */}
                            <div className="flex items-center bg-muted/70 p-1 rounded-xl gap-0.5 text-xs overflow-x-auto scrollbar-none max-w-full">
                                {RANGE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setRangeFilter(opt.key)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                                            rangeFilter === opt.key
                                                ? "bg-background text-foreground shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {tariffHistory.length > 0 ? (
                            <div style={{ width: "100%", height: isMaximized ? 380 : 260 }}>
                                <ResponsiveContainer>
                                    <AreaChart
                                        data={tariffHistory}
                                        margin={{ top: 15, right: 15, left: 5, bottom: 5 }}
                                    >
                                        <defs>
                                            <linearGradient id="tariffGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                                                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                        <XAxis
                                            dataKey="label"
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="hsl(var(--muted-foreground))"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[
                                                (dataMin: number) => Math.max(0, Number((dataMin * 0.96).toFixed(2))),
                                                (dataMax: number) => Number((dataMax * 1.04).toFixed(2)),
                                            ]}
                                            tickFormatter={(v) => `R$${v.toFixed(2)}`}
                                        />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const item = payload[0].payload;
                                                return (
                                                    <div className="bg-card border border-border p-3 rounded-xl shadow-lg text-xs space-y-1.5">
                                                        <p className="font-semibold text-foreground text-sm border-b border-border pb-1">
                                                            {label}
                                                        </p>
                                                        <div className="flex items-center justify-between gap-4 text-sky-600 dark:text-sky-400">
                                                            <span className="font-medium">Preço Unitário:</span>
                                                            <span className="font-bold font-mono text-sm">
                                                                R$ {Number(item.unit_price).toFixed(4)} / kWh
                                                            </span>
                                                        </div>
                                                        {item.flag_type && (
                                                            <div className="flex items-center justify-between gap-4 text-muted-foreground">
                                                                <span>Bandeira:</span>
                                                                <span className="font-medium text-foreground">
                                                                    {item.flag_type}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {item.grid_consumption_kwh > 0 && (
                                                            <div className="flex items-center justify-between gap-4 text-muted-foreground">
                                                                <span>Consumo da Rede:</span>
                                                                <span>{item.grid_consumption_kwh} kWh</span>
                                                            </div>
                                                        )}
                                                        {item.total_amount > 0 && (
                                                            <div className="flex items-center justify-between gap-4 text-muted-foreground">
                                                                <span>Valor da Fatura:</span>
                                                                <span className="font-medium text-foreground">
                                                                    {formatCurrency(item.total_amount)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="unit_price"
                                            name="Preço Unitário"
                                            stroke="#0284c7"
                                            strokeWidth={2.5}
                                            fill="url(#tariffGradient)"
                                            dot={{ r: 4, fill: "#0284c7", strokeWidth: 2, stroke: "#fff" }}
                                            activeDot={{ r: 6, fill: "#0284c7" }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-44 flex items-center justify-center border border-dashed border-border rounded-xl text-xs text-muted-foreground text-center p-4">
                                Envie uma fatura recente completa para renderizar o gráfico histórico de tarifas.
                            </div>
                        )}
                    </div>

                    {/* Historical Table */}
                    {tariffHistory.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Registros Faturados ({tariffHistory.length})
                            </h4>
                            <div className="overflow-auto max-h-[340px] border border-border rounded-xl relative shadow-2xs">
                                <table className="w-full text-xs text-left border-separate border-spacing-0">
                                    <thead>
                                        <tr>
                                            <th className="sticky top-0 left-0 z-30 bg-muted border-b border-r border-border py-2.5 px-3.5 font-semibold text-muted-foreground min-w-[95px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                                                Mês/Ano
                                            </th>
                                            <th className="sticky top-0 z-20 bg-muted border-b border-border py-2.5 px-3.5 font-semibold text-muted-foreground text-right whitespace-nowrap">
                                                Tarifa Efetiva
                                            </th>
                                            <th className="sticky top-0 z-20 bg-muted border-b border-border py-2.5 px-3.5 font-semibold text-muted-foreground text-center whitespace-nowrap">
                                                Bandeira
                                            </th>
                                            <th className="sticky top-0 z-20 bg-muted border-b border-border py-2.5 px-3.5 font-semibold text-muted-foreground text-right whitespace-nowrap">
                                                Consumo
                                            </th>
                                            <th className="sticky top-0 z-20 bg-muted border-b border-border py-2.5 px-3.5 font-semibold text-muted-foreground text-right whitespace-nowrap">
                                                Valor Pago
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...tariffHistory].reverse().map((item) => (
                                            <tr key={item.reference_month} className="group hover:bg-muted/20 transition-colors">
                                                <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 border-b border-r border-border py-2.5 px-3.5 font-bold text-foreground min-w-[95px] whitespace-nowrap shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                                                    {item.label}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right font-mono font-bold text-sky-700 dark:text-sky-300 border-b border-border whitespace-nowrap">
                                                    R$ {formatNumber(item.unit_price, 4)}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-center border-b border-border whitespace-nowrap">
                                                    {getFlagBadge(item.flag_type)}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right text-muted-foreground border-b border-border whitespace-nowrap">
                                                    {item.grid_consumption_kwh > 0 ? `${item.grid_consumption_kwh} kWh` : "-"}
                                                </td>
                                                <td className="py-2.5 px-3.5 text-right font-medium text-foreground border-b border-border whitespace-nowrap">
                                                    {item.total_amount > 0 ? formatCurrency(item.total_amount) : "-"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Explanatory note */}
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p>
                            O <strong className="text-foreground">Preço Unitário (R$/kWh)</strong> representa o custo real médio da energia consumida na distribuidora, integrando a Tarifa de Energia (TE), Tarifa de Uso do Sistema de Distribuição (TUSD), impostos (ICMS, PIS/COFINS) e eventuais adicionais de bandeiras tarifárias. É esta mesma tarifa evitada que baliza o cálculo monetário da economia gerada pelos créditos solares compensados.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
