"use client";

/** "E se…" panel: rent growth, vacancy, extra amortisation, appreciation and a sale year on top of the metrics. */
import React, { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp, FlaskConical, RotateCcw } from "lucide-react";
import Tile, { type TileInfo } from "./Tile";
import { projectScenario } from "@/lib/investment-scenarios";
import type { InvestmentMetrics } from "@/lib/investment-metrics";
import { formatMonthKey } from "@/lib/property-income";
import type { PropertyInvestment } from "@/lib/property-investment";

interface Props {
    metrics: InvestmentMetrics;
    investment: PropertyInvestment | null;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatK = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : `R$ ${v.toFixed(0)}`);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const yearsLabel = (months: number) => {
    const y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return `${m} ${m === 1 ? "mês" : "meses"}`;
    return `${y} ${y === 1 ? "ano" : "anos"}${m ? ` e ${m} ${m === 1 ? "mês" : "meses"}` : ""}`;
};

const DEFAULTS = { rentGrowthPctYear: 4.5, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 4, saleYear: 0, sellingCostPct: 6 };

export default function InvestmentScenarios({ metrics, investment }: Props) {
    const [open, setOpen] = useState(false);
    // rent growth opens on the property's own historical rate (the same the Payback previsto card uses) until the user types one
    const [raw, setS] = useState<Omit<typeof DEFAULTS, "rentGrowthPctYear"> & { rentGrowthPctYear: number | null }>({ ...DEFAULTS, rentGrowthPctYear: null });
    const defaultGrowth = metrics.rentGrowthPctYear !== null ? metrics.forecastGrowthPctYear : DEFAULTS.rentGrowthPctYear;
    const s = useMemo(() => ({ ...raw, rentGrowthPctYear: raw.rentGrowthPctYear ?? defaultGrowth }), [raw, defaultGrowth]);
    const financed = investment?.financing_status === "ACTIVE";

    const result = useMemo(() => projectScenario({
        metrics, investment,
        rentGrowthPctYear: s.rentGrowthPctYear, vacancyPct: s.vacancyPct, prepayNow: financed ? s.prepayNow : 0,
        appreciationPctYear: s.appreciationPctYear, saleYear: s.saleYear > 0 ? s.saleYear : null, sellingCostPct: s.sellingCostPct,
    }), [metrics, investment, s, financed]);
    // baseline = the Payback previsto forecast: 12-month pace growing by the historical rent adjustment
    const baseline = useMemo(() => projectScenario({ metrics, investment, rentGrowthPctYear: metrics.forecastGrowthPctYear, vacancyPct: 0, prepayNow: 0, appreciationPctYear: 0, saleYear: null, sellingCostPct: 0 }), [metrics, investment]);

    const chart = useMemo(() => {
        const byMonth = new Map<string, { label: string; base?: number; cen?: number; inv?: number }>();
        for (const p of baseline.projection) byMonth.set(p.month, { label: formatMonthKey(p.month), base: p.cumNoi, inv: p.cumInvested });
        for (const p of result.projection) {
            const cur = byMonth.get(p.month) ?? { label: formatMonthKey(p.month) };
            byMonth.set(p.month, { ...cur, cen: p.cumNoi, inv: p.cumInvested });
        }
        return [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
    }, [baseline, result]);

    const num = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS(prev => ({ ...prev, [k]: Number(e.target.value.replace(",", ".")) || 0 }));
    const inputCls = "w-full h-8 rounded-md border border-input bg-background px-2 text-xs tabular-nums";
    // explanations for the four tiles (icon popup)
    const scenarioInfo: Record<"payback" | "middle" | "sale" | "irr", TileInfo> = {
        payback: {
            what: "Mês em que a renda líquida acumulada alcança o capital investido com as premissas escolhidas: reajuste do aluguel, vacância e, se houver financiamento, a amortização extra.",
            formula: <>Renda do mês n = renda média mensal × (1 + reajuste)^(n ÷ 12) × (1 − vacância)<br />Payback = primeiro mês em que Σ renda ≥ capital investido</>,
            note: "A linha cinza do gráfico é o Payback previsto da análise (reajuste histórico, sem vacância); a diferença em meses aparece no card.",
        },
        middle: financed ? {
            what: "As prestações que ainda faltam no cronograma e o efeito de amortizar hoje: quantas prestações e quanto de juros deixam de existir.",
            formula: <>Juros economizados = juros do cronograma atual − juros do cronograma com a amortização<br />Prestações a menos = prestações atuais − prestações após a amortização</>,
        } : {
            what: "A renda líquida projetada do mês atual até o mês da venda, com o reajuste e a vacância escolhidos.",
            formula: "Σ renda líquida projetada até o mês da venda",
        },
        sale: {
            what: "O valor de venda projetado: o valor de mercado atual (ou o de compra, sem avaliação) valorizado pela taxa escolhida até o ano da venda. O líquido desconta os custos de venda e o saldo devedor.",
            formula: <>Venda = valor base × (1 + valorização)^anos<br />Líquido = venda − custos de venda − saldo devedor</>,
        },
        irr: {
            what: "Taxa interna de retorno do cenário completo: os fluxos já realizados, a renda projetada até a venda e a venda líquida como último recebimento. É a taxa comparável com CDI ou Tesouro.",
            formula: <>Taxa r que zera Σ fluxo ÷ (1 + r)^(anos desde o primeiro fluxo)<br />Múltiplo = (renda acumulada + venda líquida) ÷ capital investido</>,
        },
    };
    const paybackDelta = result.monthsToPayback !== null && baseline.monthsToPayback !== null ? result.monthsToPayback - baseline.monthsToPayback : null;

    return (
        <div className="rounded-xl border border-border/80 bg-muted/10">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-violet-600" /> Cenários: e se…
                    <span className="text-xs font-normal text-muted-foreground hidden sm:inline">reajuste do aluguel, vacância{financed ? ", amortização extra" : ""}, valorização e venda</span>
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-4">
                    <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 text-xs ${financed ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
                        <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Reajuste do aluguel (% a.a.)</span>
                            <input type="number" step="0.1" value={s.rentGrowthPctYear} onChange={num("rentGrowthPctYear")} className={inputCls} />
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Vacância (% do tempo)</span>
                            <input type="number" step="1" min="0" max="90" value={s.vacancyPct} onChange={num("vacancyPct")} className={inputCls} />
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Valorização (% a.a.)</span>
                            <input type="number" step="0.5" value={s.appreciationPctYear} onChange={num("appreciationPctYear")} className={inputCls} />
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Vender em</span>
                            <select value={s.saleYear} onChange={num("saleYear")} className={inputCls}>
                                <option value={0}>não vender</option>
                                {[1, 2, 3, 5, 7, 10, 15, 20, 25, 30].map(y => <option key={y} value={y}>{y} {y === 1 ? "ano" : "anos"}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custos de venda (%)</span>
                            <input type="number" step="0.5" min="0" max="50" value={s.sellingCostPct} onChange={num("sellingCostPct")} className={inputCls} />
                        </label>
                        {/* last in the row, and only while the financing is still running */}
                        {financed && (
                            <label className="space-y-1">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Amortização extra hoje (R$)</span>
                                <input type="number" step="1000" min="0" value={s.prepayNow} onChange={num("prepayNow")} className={inputCls} />
                            </label>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Tile label="Payback no cenário" tone="violet" icon={<FlaskConical className="w-4 h-4" />} info={scenarioInfo.payback}
                            value={result.monthsToPayback === null ? "—" : result.monthsToPayback === 0 ? "Concluído" : formatMonthKey(result.paybackMonth!)}
                            hint={result.monthsToPayback === null
                                ? "Renda líquida não cobre o investimento nesse cenário"
                                : result.monthsToPayback === 0 ? "Já recuperado" : `Em ~${yearsLabel(result.monthsToPayback)}${paybackDelta !== null && paybackDelta !== 0 ? ` · ${paybackDelta > 0 ? `${paybackDelta} meses depois` : `${-paybackDelta} meses antes`} do previsto` : ""}`} />
                        <Tile label={financed ? "Financiamento" : "Renda até a venda"} tone="blue" icon={<FlaskConical className="w-4 h-4" />} info={scenarioInfo.middle}
                            value={financed
                                ? `${result.remainingInstalments} prestações`
                                : result.noiUntilSale !== null ? formatBRL(result.noiUntilSale) : "—"}
                            hint={financed
                                ? result.interestSaved !== null ? `Amortizando ${formatBRL(s.prepayNow)} hoje: ${result.instalmentsSaved} prestações a menos e ${formatBRL(result.interestSaved)} de juros economizados` : result.remainingInterest !== null ? `Juros restantes ${formatBRL(result.remainingInterest)}` : "Informe juros, prazo e sistema em Aquisição & financiamento para simular"
                                : result.saleMonth ? `Renda líquida projetada até ${formatMonthKey(result.saleMonth)}` : "Escolha um ano de venda"} />
                        <Tile label="Venda" tone="emerald" icon={<FlaskConical className="w-4 h-4" />} info={scenarioInfo.sale}
                            value={result.saleValue !== null ? formatBRL(result.saleValue) : "—"}
                            hint={result.saleValue !== null
                                ? `Em ${formatMonthKey(result.saleMonth!)} · líquido ${formatBRL(result.saleProceeds ?? 0)} após custos${result.balanceAtSale ? ` e saldo devedor ${formatBRL(result.balanceAtSale)}` : ""} · base ${result.valueBaseSource === "VALUATION" ? "avaliação" : "valor de compra"}`
                                : result.valueBaseSource === "NONE" ? "Informe o valor de compra ou uma avaliação" : "Escolha um ano de venda"} />
                        <Tile label="TIR com venda" tone={result.irrAtSale !== null && result.irrAtSale >= 0 ? "emerald" : "slate"} icon={<FlaskConical className="w-4 h-4" />} info={scenarioInfo.irr}
                            value={result.irrAtSale !== null ? `${pct(result.irrAtSale)} a.a.` : "—"}
                            hint={result.irrAtSale !== null ? `Fluxos realizados + projetados + venda · múltiplo ${result.multipleAtSale?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"}×` : "Escolha um ano de venda"} />
                    </div>

                    {chart.length > 1 && (
                        <div className="h-[220px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={64} tickFormatter={(v: number) => formatK(v)} />
                                    <RechartsTooltip formatter={(value: number | string | undefined, name: string | undefined) => [formatBRL(Number(value ?? 0)), name ?? ""]} contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} />
                                    <Legend wrapperStyle={{ paddingTop: "6px", fontSize: "12px" }} />
                                    <Line type="stepAfter" dataKey="inv" name="Investido acumulado" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
                                    <Line type="monotone" dataKey="base" name="Renda acumulada (ritmo atual)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
                                    <Line type="monotone" dataKey="cen" name="Renda acumulada (cenário)" stroke="#8b5cf6" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                                    {result.paybackMonth && result.monthsToPayback! > 0 && <ReferenceLine x={formatMonthKey(result.paybackMonth)} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: "Payback (cenário)", position: "insideTopRight", fontSize: 11, fill: "#8b5cf6" }} />}
                                    {result.saleMonth && <ReferenceLine x={formatMonthKey(result.saleMonth)} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Venda", position: "insideTopLeft", fontSize: 11, fill: "#10b981" }} />}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>O cenário parte da renda líquida média dos últimos 12 meses ({formatBRL(metrics.monthlyNoiPace)}/mês){metrics.rentGrowthPctYear !== null ? `, com o reajuste histórico do aluguel (${metrics.forecastGrowthPctYear.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.) como padrão` : ""} e do valor de mercado atual{metrics.marketValue === null ? " (sem avaliação: usa o valor de compra)" : ""}. Estimativas, não previsões.</span>
                        <button type="button" onClick={() => setS({ ...DEFAULTS, rentGrowthPctYear: null })} className="inline-flex items-center gap-1 hover:text-foreground shrink-0"><RotateCcw className="w-3 h-3" /> Padrões</button>
                    </div>
                </div>
            )}
        </div>
    );
}
