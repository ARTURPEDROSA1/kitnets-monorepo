"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Maximize2, Minimize2, Receipt, TrendingUp, X } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { effectiveTax, iptuByMonth, iptuSeries, type PropertyTax } from "@/lib/property-taxes";
import { groupMonthly, inPeriod, periodLabel, periodRange, type ChartGroup, type PeriodFilterValue } from "@/lib/period-filter";
import PeriodFilter, { GroupSelect } from "./PeriodFilter";

interface IptuHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: PropertyTax[];
}

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

const GROUP_TITLE: Record<ChartGroup, string> = {
    month: "IPTU pago por mês", quarter: "IPTU pago por trimestre", year: "IPTU pago por ano",
    q1: "IPTU pago no 1º trimestre", q2: "IPTU pago no 2º trimestre", q3: "IPTU pago no 3º trimestre", q4: "IPTU pago no 4º trimestre",
};

/** Year-by-year IPTU history: amount, who paid, taxable value and rate. Same shell as the tariff-history modal. */
export function IptuHistoryModal({ isOpen, onClose, rows }: IptuHistoryModalProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: "all" });
    const [group, setGroup] = useState<ChartGroup>("year");
    const range = useMemo(() => periodRange(period), [period]);

    // Reset the view when closing (not in an effect, to avoid a cascading render on open/close)
    const close = () => { setIsMaximized(false); setPeriod({ kind: "all" }); setGroup("year"); onClose(); };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        if (isOpen) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, onClose]);

    const allSeries = useMemo(() => iptuSeries(rows), [rows]);
    /** Exercícios that overlap the period (KPIs and the table). */
    const series = useMemo(
        () => allSeries.filter(p => (!range.start || `${p.year}-12` >= range.start) && (!range.end || `${p.year}-01` <= range.end)),
        [allSeries, range]
    );
    /** Chart: IPTU by payment month inside the period, grouped like the DRE (cash basis). */
    const chartPoints = useMemo(() => groupMonthly(iptuByMonth(rows).filter(p => inPeriod(p.key, range)), group), [rows, range, group]);

    /** Assessment details per year (taxable value, rate), from the row with the most data. */
    const detailsByYear = useMemo(() => {
        const m = new Map<number, PropertyTax>();
        for (const r of rows) {
            if (r.kind !== "IPTU") continue;
            const cur = m.get(r.year);
            if (!cur || (r.valor_venal_imovel && !cur.valor_venal_imovel)) m.set(r.year, r);
        }
        return m;
    }, [rows]);

    const stats = useMemo(() => {
        if (series.length === 0) return null;
        const amounts = series.map(p => p.amount);
        const first = series[0], latest = series[series.length - 1];
        const span = latest.year - first.year;
        return {
            latest,
            avg: amounts.reduce((a, v) => a + v, 0) / amounts.length,
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            delta: first.amount > 0 ? ((latest.amount - first.amount) / first.amount) * 100 : 0,
            cagr: span > 0 && first.amount > 0 ? (Math.pow(latest.amount / first.amount, 1 / span) - 1) * 100 : null,
            years: series.length,
            firstYear: first.year,
        };
    }, [series]);

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
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600 dark:text-amber-400">
                            <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Histórico do IPTU</h3>
                            <p className="text-xs text-muted-foreground">Evolução do IPTU por exercício, quem pagou, valor venal e alíquota</p>
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
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">IPTU atual</span>
                            <p className="text-lg font-black font-mono text-foreground">{stats ? formatCurrency(stats.latest.amount) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{stats ? `Exercício ${stats.latest.year} · ${pct(stats.latest.growthPct)} vs anterior` : "Sem dados"}</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Média</span>
                            <p className="text-lg font-bold font-mono text-foreground">{stats ? formatCurrency(stats.avg) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">{stats ? `${stats.years} exercícios` : ""}</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Mínimo</span>
                            <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300">{stats ? formatCurrency(stats.min) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">Menor exercício do período</span>
                        </div>
                        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Máximo</span>
                            <p className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">{stats ? formatCurrency(stats.max) : "—"}</p>
                            <span className="text-[10px] text-muted-foreground">Maior exercício do período</span>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5" title={`Cada parcela no mês em que foi paga · ${periodLabel(period)}`}>
                                    <TrendingUp className="w-4 h-4 text-amber-500" /> {GROUP_TITLE[group]}
                                </h4>
                                {stats && stats.delta !== 0 && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${stats.delta > 0 ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950" : "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950"}`}>
                                        {stats.delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                        {pct(Math.round(stats.delta * 10) / 10)} desde {stats.firstYear}
                                        {stats.cagr !== null && <span className="font-normal opacity-80"> · {pct(Math.round(stats.cagr * 10) / 10)} a.a.</span>}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                                <GroupSelect value={group} onChange={setGroup} title="Agrupar o IPTU pago" />
                            </div>
                        </div>
                        <div className={isMaximized ? "h-[380px]" : "h-[260px]"}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartPoints} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(v: number) => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                                    <Tooltip
                                        formatter={(value, name) => [formatCurrency(Number(value)), name === "total" ? "Total" : name === "inquilino" ? "Inquilino" : "Proprietário"]}
                                        labelFormatter={l => (group === "year" ? `Pago em ${l}` : String(l))}
                                        contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px" }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }} formatter={v => (v === "inquilino" ? "Pago pelo inquilino" : v === "proprietario" ? "Pago pelo proprietário" : "Total")} />
                                    <Bar dataKey="inquilino" stackId="a" fill="#f59e0b" fillOpacity={0.6} maxBarSize={40} />
                                    <Bar dataKey="proprietario" stackId="a" fill="#f43f5e" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Line type="monotone" dataKey="total" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Records */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exercícios ({series.length})</h4>
                        <div className="overflow-x-auto border border-border rounded-xl">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                                    <tr>
                                        <th className="text-left px-3 py-2">Exercício</th>
                                        <th className="text-right px-3 py-2">IPTU</th>
                                        <th className="text-right px-3 py-2">Variação</th>
                                        <th className="text-left px-3 py-2">Pago por</th>
                                        <th className="text-right px-3 py-2">Valor venal</th>
                                        <th className="text-right px-3 py-2">Alíquota</th>
                                        <th className="text-right px-3 py-2" title="Valor do imposto (valor venal × alíquota)">Imposto</th>
                                        <th className="text-right px-3 py-2">Lixo</th>
                                        <th className="text-right px-3 py-2">Desconto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...series].reverse().map(p => {
                                        const d = detailsByYear.get(p.year);
                                        const e = d ? effectiveTax(d) : null;
                                        const payer = e?.payer === "MIXED" ? `Misto · inquilino ${Math.round((e.byTenant / e.amount) * 100)}%` : e?.payer === "LANDLORD" ? "Proprietário" : "Inquilino";
                                        return (
                                            <tr key={p.year} className="border-t border-border/60">
                                                <td className="px-3 py-2 font-semibold">{p.year}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(p.amount)}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums ${p.growthPct === null ? "text-muted-foreground" : p.growthPct > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{pct(p.growthPct)}</td>
                                                <td className="px-3 py-2">{payer}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{d?.valor_venal_imovel ? formatCurrency(Number(d.valor_venal_imovel)) : "—"}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{d?.aliquota_pct ? `${Number(d.aliquota_pct).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%` : "—"}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{d?.valor_imposto ? formatCurrency(Number(d.valor_imposto)) : "—"}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{d?.coleta_lixo ? formatCurrency(Number(d.coleta_lixo)) : "—"}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{d?.desconto ? formatCurrency(Number(d.desconto)) : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Valor venal, alíquota, imposto, lixo e desconto aparecem para os exercícios importados a partir da guia (DAM). IPTU = imposto + lixo + TSA − desconto.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
