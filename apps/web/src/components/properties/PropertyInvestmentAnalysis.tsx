"use client";

/**
 * Análise do investimento — payback, forecast, yields and IRR computed from the
 * three ledgers (investment, income, taxes) with `computeInvestmentMetrics`.
 */
import React, { useMemo, useState } from "react";
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Activity, CalendarClock, Gauge, Percent, PiggyBank, Target, TrendingUp, Wallet } from "lucide-react";
import Tile from "./Tile";
import { computeInvestmentMetrics, type InvestmentMetrics } from "@/lib/investment-metrics";
import { formatMonthKey, type PropertyIncomeRow } from "@/lib/property-income";
import { formatDateBR, type PropertyInvestment, type PropertyTransaction } from "@/lib/property-investment";
import type { PropertyTax } from "@/lib/property-taxes";

interface Props {
    investment: PropertyInvestment | null;
    transactions: PropertyTransaction[];
    incomeRows: PropertyIncomeRow[];
    taxes: PropertyTax[];
    loading?: boolean;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatK = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : `R$ ${v.toFixed(0)}`);
const pctLabel = (v: number | null, digits = 1) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`);
const monthsLabel = (n: number) => (n === 1 ? "1 mês" : `${n} meses`);
const yearsLabel = (months: number) => {
    const y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return monthsLabel(m);
    return `${y} ${y === 1 ? "ano" : "anos"}${m ? ` e ${monthsLabel(m)}` : ""}`;
};

interface ChartPoint {
    month: string;
    label: string;
    investido: number | null;
    recuperado: number | null;
    projecao: number | null;
    projecaoInvestido: number | null;
}

function buildChart(m: InvestmentMetrics): ChartPoint[] {
    const pts: ChartPoint[] = m.series.map(p => ({
        month: p.month, label: formatMonthKey(p.month), investido: p.cumInvested, recuperado: p.cumNoi, projecao: null, projecaoInvestido: null,
    }));
    // the projection starts at asOf so the dashed line continues from the last real point
    m.projection.forEach((p, i) => {
        if (i === 0) {
            const last = pts[pts.length - 1];
            if (last && last.month === p.month) { last.projecao = p.cumNoi; last.projecaoInvestido = p.cumInvested; return; }
        }
        pts.push({ month: p.month, label: formatMonthKey(p.month), investido: null, recuperado: null, projecao: p.cumNoi, projecaoInvestido: p.cumInvested });
    });
    return pts;
}

export default function PropertyInvestmentAnalysis({ investment, transactions, incomeRows, taxes, loading }: Props) {
    const [includeExpected, setIncludeExpected] = useState(false);
    const metrics = useMemo(
        () => computeInvestmentMetrics({ investment, transactions, incomeRows, taxes, includeExpected }),
        [investment, transactions, incomeRows, taxes, includeExpected]
    );
    const chart = useMemo(() => buildChart(metrics), [metrics]);
    const hasData = metrics.cashInvested > 0;
    const paidBack = metrics.remaining <= 0 && hasData;
    const financed = investment?.financing_status === "ACTIVE";

    const paybackHint = paidBack
        ? `Investimento recuperado em ${metrics.paybackReachedOn ? formatMonthKey(metrics.paybackReachedOn) : "—"}`
        : `Falta ${formatBRL(metrics.remaining)}`;
    const forecastValue = paidBack
        ? "Concluído"
        : metrics.paybackForecastMonth
            ? formatMonthKey(metrics.paybackForecastMonth)
            : "—";
    const forecastHint = paidBack
        ? `Renda líquida acumulada supera o investido desde ${metrics.paybackReachedOn ? formatMonthKey(metrics.paybackReachedOn) : "—"}`
        : metrics.monthsToPayback !== null
            ? `Em ~${yearsLabel(metrics.monthsToPayback)} ao ritmo de ${formatBRL(metrics.monthlyNoiPace)}/mês (média dos últimos 12 meses)${metrics.remainingInstallments > 0 ? ` · ${metrics.remainingInstallments} prestações restantes de ${formatBRL(metrics.monthlyDebtServicePace)}` : ""}`
            : metrics.monthlyNoiPace <= 0
                ? "Sem renda líquida positiva nos últimos 12 meses"
                : "Cadastre a aquisição para calcular";

    const irrHint = metrics.irrRealized === null
        ? "Precisa de entradas e saídas registradas"
        : metrics.irrRealized < 0
            ? "Fluxos realizados até hoje, sem venda: fica negativa até o payback e sobe depois"
            : "Fluxos realizados até hoje, sem venda nem valorização";

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                        <Target className="w-4 h-4 text-emerald-600" />
                        Análise do investimento
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Payback, previsão e rentabilidade a partir dos lançamentos de investimento, das receitas reais e dos tributos.
                        {" "}Renda líquida = aluguel líquido − despesas e custos do imóvel; a energia paga primeiro o sistema solar e o excedente conta para o imóvel.
                        {investment?.purchase_price ? ` Valor de compra ${formatBRL(investment.purchase_price)}${investment.acquired_on ? ` em ${formatDateBR(investment.acquired_on)}` : ""}.` : ""}
                    </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground shrink-0 cursor-pointer select-none">
                    <input type="checkbox" className="accent-emerald-600" checked={includeExpected} onChange={e => setIncludeExpected(e.target.checked)} />
                    Incluir meses previstos
                    {metrics.expectedMonthsExcluded > 0 && !includeExpected && <span className="text-amber-600">({metrics.expectedMonthsExcluded} fora)</span>}
                </label>
            </div>

            {loading ? (
                <div className="text-sm text-muted-foreground text-center py-8">Carregando…</div>
            ) : !hasData ? (
                <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                    Cadastre a aquisição e os lançamentos em <span className="font-semibold text-foreground">Investimento no imóvel</span> para ver payback, previsão e rentabilidade.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        <Tile label="Total investido" value={formatBRL(metrics.cashInvested)} tone="emerald" icon={<PiggyBank className="w-4 h-4" />}
                            hint={`Desde ${metrics.firstMonth ? formatMonthKey(metrics.firstMonth) : "—"} · ${monthsLabel(metrics.monthsTracked)} acompanhados`} />
                        <Tile label="Renda líquida acumulada" value={formatBRL(metrics.netIncomeToDate)} tone="blue" icon={<Wallet className="w-4 h-4" />}
                            hint={<>
                                {monthsLabel(metrics.incomeMonths)} com receita · últimos 12 meses {formatBRL(metrics.noi12m)}
                                {metrics.registerIptuUsed > 0 && <><br />inclui IPTU do registro {formatBRL(metrics.registerIptuUsed)}</>}
                            </>} />
                        <Tile label="Payback até hoje" value={pctLabel(metrics.paybackPct)} tone={paidBack ? "emerald" : "amber"} icon={<Gauge className="w-4 h-4" />}
                            hint={<>
                                {paybackHint}
                                <span className="block mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <span className={`block h-full ${paidBack ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, Math.max(0, metrics.paybackPct))}%` }} />
                                </span>
                            </>} />
                        <Tile label="Payback previsto" value={forecastValue} tone={paidBack ? "emerald" : "violet"} icon={<CalendarClock className="w-4 h-4" />} hint={forecastHint} />
                        <Tile label="Yield bruto / sobre custo" value={<>{pctLabel(metrics.grossYieldOnPrice)} <span className="text-muted-foreground font-medium">/ {pctLabel(metrics.netYieldOnCost)}</span></>} tone="blue" icon={<Percent className="w-4 h-4" />}
                            hint={<>
                                Bruto = 12 × aluguel bruto atual{metrics.currentGrossRent ? ` (${formatBRL(metrics.currentGrossRent)})` : ""} ÷ valor de compra
                                <br />Sobre custo = renda líquida anualizada ÷ total investido
                                {metrics.priceToRent !== null && <><br />Preço ÷ aluguel anual: {metrics.priceToRent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×</>}
                            </>} />
                        <Tile label={financed ? "Cash-on-cash / TIR" : "TIR realizada"} tone={metrics.irrRealized !== null && metrics.irrRealized >= 0 ? "emerald" : "slate"} icon={<TrendingUp className="w-4 h-4" />}
                            value={financed ? <>{pctLabel(metrics.cashOnCash)} <span className="text-muted-foreground font-medium">/ {pctLabel(metrics.irrRealized)}</span></> : `${pctLabel(metrics.irrRealized)} a.a.`}
                            hint={financed
                                ? <>Cash-on-cash = fluxo após prestações (12 m) ÷ investido{metrics.dscr !== null && <> · DSCR {metrics.dscr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</>}<br />{irrHint}</>
                                : irrHint} />
                    </div>

                    {/* Payback curve */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Activity className="w-3.5 h-3.5" />
                            Curva de payback · investido acumulado vs. renda líquida acumulada
                            {metrics.projection.length > 0 && <> · projeção tracejada até {formatMonthKey(metrics.paybackForecastMonth!)}</>}
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="payback-invested" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={64} tickFormatter={(v: number) => formatK(v)} />
                                    <RechartsTooltip
                                        formatter={(value: number | string | undefined, name: string | undefined) => [formatBRL(Number(value ?? 0)), name ?? ""]}
                                        labelFormatter={(l: React.ReactNode) => String(l)}
                                        contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 12 }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }} />
                                    <Area type="stepAfter" dataKey="investido" name="Investido acumulado" stroke="#10b981" strokeWidth={2} fill="url(#payback-invested)" dot={false} connectNulls={false} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="recuperado" name="Renda líquida acumulada" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                                    {metrics.projection.length > 0 && (
                                        <>
                                            <Line type="stepAfter" dataKey="projecaoInvestido" name="Investido (projeção)" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
                                            <Line type="monotone" dataKey="projecao" name="Renda líquida (projeção)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
                                            <ReferenceLine x={formatMonthKey(metrics.paybackForecastMonth!)} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: "Payback previsto", position: "insideTopRight", fontSize: 11, fill: "#8b5cf6" }} />
                                        </>
                                    )}
                                    {metrics.paybackReachedOn && (
                                        <ReferenceLine x={formatMonthKey(metrics.paybackReachedOn)} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Payback", position: "insideTopRight", fontSize: 11, fill: "#10b981" }} />
                                    )}
                                    {metrics.series.filter(p => p.event === "QUITACAO").map(p => (
                                        <ReferenceLine key={p.month} x={formatMonthKey(p.month)} stroke="#f59e0b" strokeDasharray="2 4" label={{ value: "Quitação", position: "insideTopLeft", fontSize: 11, fill: "#f59e0b" }} />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Base de caixa: entrada, custos de aquisição, prestações, amortizações, quitação e reformas. A projeção repete a renda líquida média dos últimos 12 meses
                            {financed ? " e as prestações restantes do contrato" : ""}; não considera valorização do imóvel nem inflação (fase seguinte).
                            {metrics.expectedMonthsExcluded > 0 && !includeExpected && ` ${metrics.expectedMonthsExcluded} ${metrics.expectedMonthsExcluded === 1 ? "mês previsto ficou" : "meses previstos ficaram"} de fora; marque "Incluir meses previstos" para contá-los.`}
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
