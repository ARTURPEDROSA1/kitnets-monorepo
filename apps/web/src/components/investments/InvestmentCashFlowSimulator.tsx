"use client";

/**
 * Cash-flow simulator of a project.
 *
 * Below the axis, what leaves the pocket: the instalments already paid (solid), the ones the
 * contract still owes (hollow) and, in the keys month, what the handover itself costs. Above it,
 * what comes back: for a project meant to be let, the rent the unit is expected to produce once
 * the keys arrive, growing by one adjustment a year; for a project meant to be sold, the expected
 * delivery value as one inflow at the keys. The vertical marker is the completion; the line is
 * the running total, and where it crosses zero is when the investment has paid itself back.
 *
 * The valorização lives here too — it is a premise-driven projection like the rent, not a fact
 * like the KPIs on top: "worth X% more at delivery" is typed with the other premises and the
 * result tile shows what that means in reais (the pencil's area × R$/m² or typed value win over
 * the percentage when they exist).
 *
 * The TIR of the whole flow sits next to the CDI of the last twelve months: that pair is the
 * answer to "should I anticipate instalments or leave the money invested".
 *
 * The assumptions are stored on the investment and saved as they are typed, like a cell of the
 * ledger: there is no button to remember. A field changes, the chart moves, and half a second
 * later the row is written. Leaving the page flushes whatever is still pending.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Bar,
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
import { AlertCircle, Check, Gem, HelpCircle, KeyRound, Loader2, Percent, TrendingUp } from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    assumptionsOf,
    formatMonthLabel,
    simulateCashFlow,
    type CashFlowAssumptions,
} from "@/lib/new-investment-cashflow";
import { deliveryValueOf, type InvestmentBenchmarks, type InvestmentMetrics } from "@/lib/new-investment-metrics";
import { COMPLETION_LABELS, formatBRL, formatBRLShort, type InvestmentPayment, type InvestmentSchedule, type NewInvestment } from "@/lib/new-investments";

interface Props {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
    metrics: InvestmentMetrics;
    benchmarks: InvestmentBenchmarks;
    onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

const HORIZONS = [
    { months: 60, label: "5 anos" },
    { months: 120, label: "10 anos" },
    { months: 180, label: "15 anos" },
    { months: 240, label: "20 anos" },
    { months: 360, label: "30 anos" },
];

const SAVE_DELAY_MS = 500;

const inputCls = "w-full h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums";
const labelCls = "text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap";
const tileCls = "rounded-lg border border-border/70 bg-muted/20 px-3 py-2";
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatBRL(v, 0)}`;

/** FipeZap's 12-month sale variation compounded until the keys: a starting point for "valorização", not a forecast. */
function suggestedAppreciation(fipezap12mPct: number | null, monthsToKeys: number | null): number | null {
    if (fipezap12mPct === null || monthsToKeys === null || monthsToKeys <= 0) return null;
    return Math.round((Math.pow(1 + fipezap12mPct / 100, monthsToKeys / 12) - 1) * 1000) / 10;
}

/** The columns a set of assumptions writes. */
const toPatch = (a: CashFlowAssumptions): Record<string, unknown> => ({
    estimated_rent: a.monthlyRent,
    rent_start_on: a.rentStart ? `${a.rentStart}-01` : null,
    rent_adjustment_pct: a.rentAdjustmentPct,
    rent_vacancy_pct: a.vacancyPct,
    rent_costs_pct: a.costsPct,
    sim_horizon_months: a.horizonMonths,
    sim_delivery_costs_pct: a.deliveryCostsPct,
    expected_appreciation_pct: a.expectedAppreciationPct,
});

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** The "?" next to a premise: opens a small dialog, so it works on a phone where there is no hover. */
function PremiseHelp({ label, children }: { label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={e => { e.preventDefault(); setOpen(true); }}
                aria-label={`O que é ${label}`}
                title={`O que é ${label}`}
                className="inline-flex align-middle ml-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
                <HelpCircle className="w-3.5 h-3.5" />
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{label}</DialogTitle>
                        <DialogDescription asChild>
                            <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function InvestmentCashFlowSimulator({ investment, schedules, payments, metrics, benchmarks, onSave }: Props) {
    // Seeded once from the server; the component is keyed by the dashboard on the dates that would
    // change the defaults, so a stale seed remounts instead of being synced back by an effect.
    const [assumptions, setAssumptions] = useState<CashFlowAssumptions>(() => assumptionsOf(investment));
    const [status, setStatus] = useState<SaveStatus>("idle");
    /** The running-total line drowns the monthly bars at this scale, so it starts off; its legend entry toggles it. */
    const [showCumulative, setShowCumulative] = useState(false);

    // The latest save callback, read at flush time: the dashboard recreates it on every render and
    // a stale one would write through a refresh that has already happened.
    const onSaveRef = useRef(onSave);
    useEffect(() => { onSaveRef.current = onSave; });

    const pending = useRef<CashFlowAssumptions | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(true);

    /** Writes whatever is pending. Safe after unmount: it only touches state while mounted. */
    const flush = useCallback(async () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const next = pending.current;
        pending.current = null;
        if (!next) return;
        if (mounted.current) setStatus("saving");
        const ok = await onSaveRef.current(toPatch(next));
        if (mounted.current) setStatus(ok ? "saved" : "error");
    }, []);

    // Leaving the page must not lose the last edit: flush on unmount.
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; void flush(); };
    }, [flush]);

    const update = (patch: Partial<CashFlowAssumptions>) => {
        const next = { ...assumptions, ...patch };
        setAssumptions(next);
        pending.current = next;
        setStatus("pending");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void flush(); }, SAVE_DELAY_MS);
    };
    const num = (key: "monthlyRent" | "rentAdjustmentPct" | "vacancyPct" | "costsPct" | "deliveryCostsPct") =>
        (e: React.ChangeEvent<HTMLInputElement>) => update({ [key]: Number(e.target.value.replace(",", ".")) || 0 });

    // What the unit should be worth at delivery, live as the percentage is typed; the sale model
    // uses it as the inflow when the project is meant to be sold.
    const delivery = deliveryValueOf(investment, metrics.committed, assumptions.expectedAppreciationPct);
    const gain = delivery.value !== null && metrics.committed > 0 ? delivery.value - metrics.committed : null;
    // Sold: the chart is the realized flow — paid instalments closed by the net sale — and the
    // premises no longer matter. Meant to be sold: the expected delivery value is the inflow.
    const sold = metrics.sold && Boolean(investment.sold_on) && metrics.saleNet !== null;
    const realizedSale = sold ? { month: (investment.sold_on as string).slice(0, 7), net: metrics.saleNet as number } : null;
    const sellMode = sold || investment.exit_plan === "VENDER";
    const suggested = suggestedAppreciation(benchmarks.fipezapSale12mPct, metrics.monthsToKeys);

    const result = useMemo(
        () => simulateCashFlow(investment, schedules, payments, {
            ...assumptions,
            sale: realizedSale,
            saleAtDelivery: !realizedSale && sellMode ? delivery.value : null,
        }),
        [investment, schedules, payments, assumptions, sellMode, delivery.value, realizedSale]
    );

    const chart = useMemo(
        () =>
            result.points.map(p => ({
                label: p.label,
                month: p.month,
                pago: p.outflowPaid > 0 ? -p.outflowPaid : null,
                previsto: p.outflowForecast > 0 ? -p.outflowForecast : null,
                entrega: p.outflowDelivery > 0 ? -p.outflowDelivery : null,
                aluguel: p.rent > 0 ? p.rent : null,
                venda: p.sale > 0 ? p.sale : null,
                acumulado: p.cumulative,
            })),
        [result]
    );

    const completion = COMPLETION_LABELS[investment.strategy] ?? "Chaves";
    const keysLabel = result.keysMonth ? formatMonthLabel(result.keysMonth) : null;
    const irr = result.irrAnnualPct;
    const cdi = benchmarks.cdi12mPct;
    const beatsCdi = irr !== null && cdi !== null ? irr >= cdi : null;

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-violet-600" /> Simulador de fluxo de caixa
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {sold
                            ? "Projeto vendido: o gráfico é o realizado — as parcelas pagas e a venda líquida no mês em que aconteceu. Nada mais é projetado."
                            : sellMode
                              ? `Parcelas abaixo do eixo, a venda estimada acima, no mês da ${completion.toLowerCase()}. As premissas são salvas conforme você digita.`
                              : `Parcelas abaixo do eixo, aluguel estimado acima. A linha vertical marca a ${completion.toLowerCase()}. As premissas são salvas conforme você digita.`}
                    </p>
                </div>
                <span
                    className={
                        status === "error"
                            ? "inline-flex items-center gap-1 text-xs text-rose-600"
                            : "inline-flex items-center gap-1 text-xs text-muted-foreground"
                    }
                    aria-live="polite"
                >
                    {(status === "pending" || status === "saving") && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</>}
                    {status === "saved" && <><Check className="w-3.5 h-3.5 text-emerald-600" /> Premissas salvas</>}
                    {status === "error" && <><AlertCircle className="w-3.5 h-3.5" /> Não foi possível salvar — tente alterar de novo</>}
                </span>
            </header>

            <div className="p-4 space-y-4">
                {/* the premises stay editable until the project is sold; after that they have nothing left to drive */}
                <div className={sold ? "hidden" : "grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3"}>
                    <label className="space-y-1">
                        <span className={labelCls}>Aluguel (R$)</span>
                        <input type="number" step="50" min="0" value={assumptions.monthlyRent || ""} onChange={num("monthlyRent")} className={inputCls} placeholder="0" title="Aluguel mensal bruto estimado para a unidade pronta" />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>1º aluguel</span>
                        <DateInput
                            mode="month"
                            variant="bare"
                            value={assumptions.rentStart}
                            onChange={ym => update({ rentStart: ym || null })}
                            className={inputCls}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>Reajuste (% a.a.)</span>
                        <input type="number" step="0.5" min="0" value={assumptions.rentAdjustmentPct} onChange={num("rentAdjustmentPct")} className={inputCls} title="Reajuste do aluguel a cada doze meses" />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>Vacância (%)</span>
                        <input type="number" step="1" min="0" max="90" value={assumptions.vacancyPct} onChange={num("vacancyPct")} className={inputCls} title="Parte do ano em que a unidade fica vazia" />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>
                            Custos (% do aluguel)
                            <PremiseHelp label="Custos sobre o aluguel">
                                <p>A parte do aluguel que não chega ao seu bolso, como percentual do aluguel bruto: condomínio e IPTU quando ficam por sua conta (vazio ou por contrato), taxa de administração da imobiliária (em geral 8–10%), pequenas manutenções.</p>
                                <p>Exemplo: aluguel de R$ 2.000 com 12% de custos → R$ 1.760 líquidos antes da vacância. É o que o simulador usa como renda mensal.</p>
                            </PremiseHelp>
                        </span>
                        <input
                            type="number"
                            step="1"
                            min="0"
                            max="90"
                            value={assumptions.costsPct}
                            onChange={num("costsPct")}
                            className={inputCls}
                            title="Condomínio, IPTU e administração, como percentual do aluguel"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>
                            Entrega (% do custo)
                            <PremiseHelp label="Custos na entrega">
                                <p>O que a escritura da unidade custa quando as chaves chegam, como percentual do custo total (parcelas pagas + previstas): ITBI de 2% a 3% conforme o município, mais escritura e registro em cartório, em torno de 1%. Mobília, se quiser, entra aqui também.</p>
                                <p>Exemplo: custo total de R$ 250.000 com 4% → R$ 10.000 lançados de uma vez no mês das chaves, contados no total desembolsado, no payback e na TIR.</p>
                            </PremiseHelp>
                        </span>
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={assumptions.deliveryCostsPct}
                            onChange={num("deliveryCostsPct")}
                            className={inputCls}
                            placeholder="4"
                            title="ITBI (2–3%) mais escritura e registro (~1%), como % do custo total — pagos de uma vez no mês das chaves"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>
                            Valorização (%)
                            <PremiseHelp label="Valorização esperada">
                                <p>Quanto a unidade deve valer a mais na entrega, como percentual do custo total. Quem compra na planta costuma esperar de 20% a 40% até as chaves; a tendência do FipeZap (índice nacional de venda) capitalizada até a sua entrega aparece como sugestão no campo.</p>
                                <p>Se no lápis você informou área e R$/m² de mercado, ou um valor na entrega, eles valem no lugar deste percentual. Num projeto para vender, esse valor é a venda estimada do gráfico.</p>
                            </PremiseHelp>
                        </span>
                        <input
                            type="number"
                            step="1"
                            min="0"
                            max="1000"
                            value={assumptions.expectedAppreciationPct ?? ""}
                            onChange={e => update({ expectedAppreciationPct: e.target.value === "" ? null : Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })}
                            className={inputCls}
                            placeholder={suggested !== null ? String(suggested).replace(".", ",") : "30"}
                            title={`Quanto a unidade deve valer a mais na entrega, sobre o custo total.${suggested !== null ? ` Pela tendência FipeZap (índice nacional de venda) até a entrega seriam +${pct(suggested)}.` : ""} Área × R$/m² ou um valor na entrega informados no lápis prevalecem.`}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className={labelCls}>Horizonte</span>
                        <select
                            value={assumptions.horizonMonths}
                            onChange={e => update({ horizonMonths: Number(e.target.value) })}
                            className={inputCls}
                        >
                            {HORIZONS.map(h => <option key={h.months} value={h.months}>{h.label}</option>)}
                        </select>
                    </label>
                </div>

                {chart.length > 1 ? (
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chart} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} stackOffset="sign">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} width={70} tickFormatter={(v: number) => formatBRLShort(v)} />
                                <RechartsTooltip
                                    formatter={(value, name) => [formatBRL(Math.abs(Number(value ?? 0))), name ?? ""]}
                                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                                />
                                <Legend
                                    wrapperStyle={{ paddingTop: "6px", fontSize: "12px" }}
                                    onClick={entry => { if (entry.dataKey === "acumulado") setShowCumulative(v => !v); }}
                                    formatter={(value, entry) =>
                                        entry.dataKey === "acumulado" ? (
                                            <span
                                                role="button"
                                                title={showCumulative ? "Ocultar a linha do resultado acumulado" : "Mostrar a linha do resultado acumulado"}
                                                style={{ cursor: "pointer", textDecoration: showCumulative ? "none" : "line-through", opacity: showCumulative ? 1 : 0.55 }}
                                            >
                                                {value}
                                            </span>
                                        ) : (
                                            value
                                        )
                                    }
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                <Bar dataKey="pago" name="Pago" stackId="cash" fill="#f43f5e" isAnimationActive={false} />
                                <Bar dataKey="previsto" name="Previsto" stackId="cash" fill="#fda4af" isAnimationActive={false} />
                                <Bar dataKey="entrega" name="Custos na entrega" stackId="cash" fill="#f59e0b" isAnimationActive={false} />
                                {sellMode
                                    ? <Bar dataKey="venda" name={sold ? "Venda líquida" : "Venda estimada"} stackId="cash" fill="#059669" isAnimationActive={false} />
                                    : <Bar dataKey="aluguel" name="Aluguel estimado" stackId="cash" fill="#10b981" isAnimationActive={false} />}
                                <Line type="monotone" dataKey="acumulado" name="Resultado acumulado" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} hide={!showCumulative} />
                                {keysLabel && (
                                    <ReferenceLine
                                        x={keysLabel}
                                        stroke="#0ea5e9"
                                        strokeDasharray="4 3"
                                        // text to the left of its line; the payback label goes to the right of its own, so the two never meet
                                        label={{ value: completion, position: "insideTopRight", fontSize: 11, fill: "#0ea5e9" }}
                                    />
                                )}
                                {result.breakEvenMonth && result.breakEvenMonth !== result.keysMonth && (
                                    <ReferenceLine
                                        x={formatMonthLabel(result.breakEvenMonth)}
                                        stroke="#10b981"
                                        strokeDasharray="4 3"
                                        // to the right of its line, unless the line is the chart's last month (a sale) and the text would be clipped
                                        label={{ value: "Payback", position: result.breakEvenMonth === result.points[result.points.length - 1]?.month ? "insideTopRight" : "insideTopLeft", fontSize: 11, fill: "#10b981" }}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        Cadastre o plano de pagamento ou lance um pagamento para ver o fluxo de caixa.
                    </p>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
                    <div className={tileCls}>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Total desembolsado</span>
                        <span className="block text-base font-bold tabular-nums text-foreground">{formatBRL(result.totalOutflow, 0)}</span>
                        <span className="text-muted-foreground">
                            {sold ? "pago até a venda" : `pago + previsto no contrato${result.totalDelivery > 0 ? ` + ${formatBRL(result.totalDelivery, 0)} na entrega` : ""}`}
                        </span>
                    </div>
                    {sold && realizedSale ? (
                        <div className={tileCls}>
                            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Venda líquida</span>
                            <span className="block text-base font-bold tabular-nums text-emerald-600">{formatBRL(realizedSale.net, 0)}</span>
                            <span className="text-muted-foreground">em {formatMonthLabel(realizedSale.month)}{investment.sale_costs_pct > 0 ? ` · após ${pct(investment.sale_costs_pct)} de custos` : ""}</span>
                        </div>
                    ) : sellMode ? (
                        <div className={tileCls}>
                            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Venda na {completion.toLowerCase()}</span>
                            <span className="block text-base font-bold tabular-nums text-emerald-600">{result.totalSale > 0 ? formatBRL(result.totalSale, 0) : "—"}</span>
                            <span className="text-muted-foreground">{result.totalSale > 0 && keysLabel ? `em ${keysLabel}` : "informe a valorização"}</span>
                        </div>
                    ) : (
                        <div className={tileCls}>
                            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Aluguel no horizonte</span>
                            <span className="block text-base font-bold tabular-nums text-emerald-600">{formatBRL(result.totalRent, 0)}</span>
                            <span className="text-muted-foreground">
                                {result.rentStart ? `a partir de ${formatMonthLabel(result.rentStart)}` : "informe o primeiro aluguel"}
                            </span>
                        </div>
                    )}
                    {sold && metrics.realizedGain !== null ? (
                        <div
                            className={metrics.realizedGain >= 0 ? "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2" : "rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2"}
                            title="Venda líquida menos o que foi de fato pago. As parcelas em aberto passaram ao comprador e não contam."
                        >
                            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                                <Gem className="w-3 h-3" /> Ganho realizado
                            </span>
                            <span className={`block text-base font-bold tabular-nums ${metrics.realizedGain >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                                {signed(metrics.realizedGain)}
                            </span>
                            <span className="text-muted-foreground">
                                {metrics.realizedGainPct !== null ? `${metrics.realizedGainPct > 0 ? "+" : ""}${pct(metrics.realizedGainPct)} sobre ${formatBRL(metrics.paidToDate, 0)} pagos` : ""}
                            </span>
                        </div>
                    ) : (
                    <div
                        className={gain === null ? tileCls : gain >= 0 ? "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2" : "rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2"}
                        title={`Quanto a unidade deve valer na ${completion.toLowerCase()} além do que ela custou. Valor na entrega = o informado no lápis, senão área × R$/m², senão custo × (1 + valorização %). O FipeZap deste painel é o índice nacional de venda — tendência, não o preço da sua rua.`}
                    >
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                            <Gem className="w-3 h-3" /> Valorização
                        </span>
                        <span className={`block text-base font-bold tabular-nums ${gain === null ? "text-foreground" : gain >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                            {gain !== null ? signed(gain) : "—"}
                        </span>
                        <span className="text-muted-foreground">
                            {delivery.value !== null && gain !== null
                                ? `${gain > 0 ? "+" : ""}${pct((gain / metrics.committed) * 100)} · vale ${formatBRL(delivery.value, 0)}${delivery.source === "m2" ? " (área × R$/m²)" : delivery.source === "typed" ? " (valor informado)" : ""}`
                                : "digite a valorização esperada (%)"}
                            {benchmarks.fipezapSale12mPct !== null && ` · FipeZap 12 m ${benchmarks.fipezapSale12mPct > 0 ? "+" : ""}${pct(benchmarks.fipezapSale12mPct)}`}
                        </span>
                    </div>
                    )}
                    <div className={tileCls}>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Payback</span>
                        <span className="block text-base font-bold tabular-nums text-foreground">
                            {result.breakEvenMonth ? formatMonthLabel(result.breakEvenMonth) : "—"}
                        </span>
                        <span className="text-muted-foreground">
                            {result.breakEvenMonths !== null
                                ? sold
                                    ? "na venda"
                                    : sellMode
                                      ? `na venda, ${completion.toLowerCase()} em ${keysLabel ?? "—"}`
                                      : `${Math.floor(result.breakEvenMonths / 12)} anos e ${result.breakEvenMonths % 12} meses de aluguel`
                                : sold ? "a venda não cobriu o pago" : "fora do horizonte escolhido"}
                        </span>
                    </div>
                    <div
                        className={
                            beatsCdi === null
                                ? tileCls
                                : beatsCdi
                                  ? "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2"
                                  : "rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2"
                        }
                        title="Taxa interna de retorno de todo o fluxo: parcelas pagas e previstas, custos na entrega e o que volta — aluguel líquido no horizonte, ou a venda na entrega. É a taxa que se compara com o CDI."
                    >
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                            <Percent className="w-3 h-3" /> TIR {sold ? "realizada" : sellMode ? "da venda" : "no horizonte"}
                        </span>
                        <span className={`block text-base font-bold tabular-nums ${beatsCdi === false ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                            {irr !== null ? `${pct(irr)} a.a.` : "—"}
                        </span>
                        <span className="text-muted-foreground">
                            {cdi !== null
                                ? `CDI 12 meses: ${pct(cdi)} a.a.${beatsCdi === null ? "" : beatsCdi ? " · acima do CDI" : " · abaixo do CDI"}`
                                : irr !== null ? "CDI ainda não sincronizado" : sellMode ? "informe a valorização" : "informe o aluguel estimado"}
                        </span>
                    </div>
                    <div className={tileCls}>
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                            <KeyRound className="w-3 h-3" /> {completion}
                        </span>
                        <span className="block text-base font-bold text-foreground">{keysLabel ?? "—"}</span>
                        <span className="text-muted-foreground">
                            {investment.keys_delivered_on ? "entregue" : "previsão do contrato"}
                        </span>
                    </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    {sold ? (
                        <>
                            Fluxo realizado: só o que foi pago, fechado pela venda líquida no mês em que aconteceu. As parcelas em
                            aberto passaram ao comprador. A TIR anualiza o ganho pelo tempo em que o dinheiro ficou parado — num
                            projeto vendido cedo ela fica alta porque o prazo foi curto; compare também o ganho em reais.
                        </>
                    ) : (
                        <>
                            {sellMode
                                ? "A venda estimada é o valor na entrega (lápis: valor informado ou área × R$/m²; senão custo × valorização). "
                                : "O aluguel é líquido de vacância e custos e recebe um reajuste a cada doze meses. "}
                            As parcelas previstas saem do quadro resumo do contrato, cada uma pelo último valor pago do seu tipo — a
                            parcela carrega a correção acumulada e não cai, então a previsão sobe a cada pagamento lançado. A TIR
                            junta tudo isso numa taxa anual: acima do CDI, antecipar parcelas rende menos que deixar o dinheiro
                            aplicado; abaixo, antecipar é o melhor uso dele. Estimativas, não previsões.
                        </>
                    )}
                </p>
            </div>
        </section>
    );
}
