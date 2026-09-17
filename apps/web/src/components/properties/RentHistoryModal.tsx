"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Maximize2, Minimize2, TrendingUp, X } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { rentHistory, type PropertyIncomeRow } from "@/lib/property-income";
import { historicalRentGrowth } from "@/lib/investment-metrics";
import { inPeriod, monthLabel, periodLabel, periodRange, shiftMonthKey, type PeriodFilterValue } from "@/lib/period-filter";
import PeriodFilter from "./PeriodFilter";

interface RentHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: PropertyIncomeRow[];
    /** built area in m² (Aquisição & financiamento, else the IPTU guide); null when unknown */
    areaM2: number | null;
}

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const growth = (from: number, to: number) => (from > 0 ? Math.round((to / from - 1) * 1000) / 10 : null);

/** Rent history: monthly gross/net rent, each adjustment and the growth per year. Same shell as the IPTU history modal. */
export function RentHistoryModal({ isOpen, onClose, rows, areaM2 }: RentHistoryModalProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: "all" });
    const range = useMemo(() => periodRange(period), [period]);

    const close = () => { setIsMaximized(false); setPeriod({ kind: "all" }); onClose(); };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        if (isOpen) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, onClose]);

    const all = useMemo(() => rentHistory(rows), [rows]);
    const points = useMemo(() => all.points.filter(p => inPeriod(p.key, range)), [all, range]);
    const adjustments = useMemo(() => all.adjustments.filter(a => inPeriod(a.month, range)), [all, range]);
    const years = useMemo(
        () => all.years.filter(y => (!range.start || `${y.year}-12` >= range.start) && (!range.end || `${y.year}-01` <= range.end)),
        [all, range]
    );

    const stats = useMemo(() => {
        if (points.length === 0) return null;
        const first = points[0], latest = points[points.length - 1];
        const yearAgoKey = shiftMonthKey(latest.key, -12);
        const yearAgo = [...all.points].reverse().find(p => p.key <= yearAgoKey) ?? null;
        return {
            first, latest,
            total: growth(first.bruto, latest.bruto),
            vsYearAgo: yearAgo ? growth(yearAgo.bruto, latest.bruto) : null,
            perYear: historicalRentGrowth(points.map(p => ({ month: p.key, grossRent: p.bruto }))),
            perM2: areaM2 && areaM2 > 0 ? latest.bruto / areaM2 : null,
        };
    }, [points, all, areaM2]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 sm:pl-[calc(var(--sidebar-width)+1.5rem)] overflow-y-auto animate-in fade-in duration-200"
            onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
            <div className={`bg-card border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${isMaximized ? "w-full max-w-7xl h-[94vh]" : "w-full max-w-3xl max-h-[90vh]"}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Histórico do aluguel</h3>
                            <p className="text-xs text-muted-foreground">Evolução do aluguel bruto (valor de contrato), reajustes e crescimento por ano</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsMaximized(v => !v)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={isMaximized ? "Restaurar" : "Maximizar"}>
                            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button onClick={close} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Fechar" aria-label="Fechar">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aluguel bruto atual</span>
                            <p className="text-lg font-black font-mono text-foreground">{stats ? formatCurrency(stats.latest.bruto) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{stats ? `${stats.latest.month} · ${pct(stats.vsYearAgo)} em 12 meses` : "Sem dados"}</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Crescimento total</span>
                            <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300">{stats ? pct(stats.total) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{stats ? `Desde ${stats.first.month} (${formatCurrency(stats.first.bruto)})` : ""}</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Crescimento ao ano</span>
                            <p className="text-lg font-bold font-mono text-foreground">{stats && stats.perYear !== null ? `${pct(stats.perYear)} a.a.` : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{stats && stats.perYear !== null ? "Taxa composta; é a usada no Payback previsto" : "Precisa de 12 meses de histórico"}</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Valor m²</span>
                            <p className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">{stats?.perM2 ? formatCurrency(stats.perM2) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{areaM2 ? `Aluguel bruto ÷ ${areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : "Informe a área em Aquisição & financiamento"}</span>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                    <TrendingUp className="w-4 h-4 text-emerald-500" /> Aluguel por mês
                                </h4>
                                {stats && stats.total !== null && stats.total !== 0 && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${stats.total > 0 ? "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950" : "text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950"}`}>
                                        {stats.total > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                        {pct(stats.total)} · {periodLabel(period)}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                            </div>
                        </div>
                        <div className={isMaximized ? "h-[380px]" : "h-[260px]"}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                                    <Tooltip
                                        formatter={(value, name) => [formatCurrency(Number(value)), name === "bruto" ? "Aluguel bruto" : "Aluguel líquido"]}
                                        contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px" }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }} formatter={v => (v === "bruto" ? "Aluguel bruto (contrato)" : "Aluguel líquido (após a taxa)")} />
                                    <Line type="stepAfter" dataKey="bruto" stroke="#10b981" strokeWidth={2.5} dot={false} />
                                    <Line type="stepAfter" dataKey="liquido" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Adjustments */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reajustes ({adjustments.length})</h4>
                        {adjustments.length === 0 ? (
                            <p className="text-xs text-muted-foreground border border-dashed border-border rounded-xl px-3 py-4 text-center">Nenhuma mudança no valor do aluguel neste período.</p>
                        ) : (
                            <div className="overflow-x-auto border border-border rounded-xl">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                        <tr>
                                            <th className="text-left px-3 py-2">Mês</th>
                                            <th className="text-right px-3 py-2">De</th>
                                            <th className="text-right px-3 py-2">Para</th>
                                            <th className="text-right px-3 py-2">Variação</th>
                                            <th className="text-right px-3 py-2">Diferença</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...adjustments].reverse().map(a => (
                                            <tr key={a.month} className="border-t border-border/60">
                                                <td className="px-3 py-2 font-semibold">{monthLabel(a.month)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(a.from)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(a.to)}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${a.pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{pct(a.pct)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{a.to - a.from > 0 ? "+" : ""}{formatCurrency(a.to - a.from)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Years */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por ano ({years.length})</h4>
                        <div className="overflow-x-auto border border-border rounded-xl">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                    <tr>
                                        <th className="text-left px-3 py-2">Ano</th>
                                        <th className="text-right px-3 py-2" title="Aluguel bruto do último mês registrado no ano">Aluguel no fim do ano</th>
                                        <th className="text-right px-3 py-2" title="Contra o fim do ano anterior">Variação</th>
                                        <th className="text-right px-3 py-2">Aluguel médio</th>
                                        <th className="text-right px-3 py-2">Valor m²</th>
                                        <th className="text-right px-3 py-2">Meses</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...years].reverse().map(y => (
                                        <tr key={y.year} className="border-t border-border/60">
                                            <td className="px-3 py-2 font-semibold">{y.year}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(y.lastGross)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${y.growthPct === null || y.growthPct === 0 ? "text-muted-foreground" : y.growthPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{pct(y.growthPct)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(y.avgGross)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{areaM2 && areaM2 > 0 ? formatCurrency(y.lastGross / areaM2) : "—"}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{y.months}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Meses confirmados com aluguel. Aluguel bruto é o valor de contrato (recebido − energia, antes da taxa da administradora). Meses sem aluguel (vacância) ficam fora da série.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
