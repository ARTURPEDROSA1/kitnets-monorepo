"use client";

/**
 * Cash-flow simulator of a Novo Investimento.
 *
 * Below the axis, what leaves the pocket: the instalments already paid (solid), the ones the
 * contract still owes (hollow) and, in the keys month, what the handover itself costs. Above it,
 * the rent the unit is expected to produce once the keys arrive, growing by one adjustment a year.
 * The vertical marker is the key handover; the line is the running total, and where it crosses
 * zero is when the investment has paid itself back.
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
import { AlertCircle, Check, KeyRound, Loader2, Percent, TrendingUp } from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";
import {
    assumptionsOf,
    formatMonthLabel,
    simulateCashFlow,
    type CashFlowAssumptions,
} from "@/lib/new-investment-cashflow";
import type { InvestmentBenchmarks } from "@/lib/new-investment-metrics";
import { formatBRL, formatBRLShort, type InvestmentPayment, type InvestmentSchedule, type NewInvestment } from "@/lib/new-investments";

interface Props {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
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
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** The columns a set of assumptions writes. */
const toPatch = (a: CashFlowAssumptions): Record<string, unknown> => ({
    estimated_rent: a.monthlyRent,
    rent_start_on: a.rentStart ? `${a.rentStart}-01` : null,
    rent_adjustment_pct: a.rentAdjustmentPct,
    rent_vacancy_pct: a.vacancyPct,
    rent_costs_pct: a.costsPct,
    sim_horizon_months: a.horizonMonths,
    sim_delivery_costs: a.deliveryCosts,
});

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export default function InvestmentCashFlowSimulator({ investment, schedules, payments, benchmarks, onSave }: Props) {
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
    const num = (key: "monthlyRent" | "rentAdjustmentPct" | "vacancyPct" | "costsPct" | "deliveryCosts") =>
        (e: React.ChangeEvent<HTMLInputElement>) => update({ [key]: Number(e.target.value.replace(",", ".")) || 0 });

    const result = useMemo(
        () => simulateCashFlow(investment, schedules, payments, assumptions),
        [investment, schedules, payments, assumptions]
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
                acumulado: p.cumulative,
            })),
        [result]
    );

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
                        Parcelas abaixo do eixo, aluguel estimado acima. A linha vertical marca a entrega das chaves.
                        As premissas são salvas conforme você digita.
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
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Aluguel estimado (R$)</span>
                        <input type="number" step="50" min="0" value={assumptions.monthlyRent || ""} onChange={num("monthlyRent")} className={inputCls} placeholder="0" />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Primeiro aluguel</span>
                        <DateInput
                            mode="month"
                            variant="bare"
                            value={assumptions.rentStart}
                            onChange={ym => update({ rentStart: ym || null })}
                            className={inputCls}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Reajuste anual (%)</span>
                        <input type="number" step="0.5" min="0" value={assumptions.rentAdjustmentPct} onChange={num("rentAdjustmentPct")} className={inputCls} />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Vacância (%)</span>
                        <input type="number" step="1" min="0" max="90" value={assumptions.vacancyPct} onChange={num("vacancyPct")} className={inputCls} />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custos sobre o aluguel (%)</span>
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
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custos na entrega (R$)</span>
                        <input
                            type="number"
                            step="500"
                            min="0"
                            value={assumptions.deliveryCosts || ""}
                            onChange={num("deliveryCosts")}
                            className={inputCls}
                            placeholder="0"
                            title="ITBI, escritura, registro e mobília — pagos de uma vez no mês das chaves"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Horizonte</span>
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
                                <Bar dataKey="aluguel" name="Aluguel estimado" stackId="cash" fill="#10b981" isAnimationActive={false} />
                                <Line type="monotone" dataKey="acumulado" name="Resultado acumulado" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} hide={!showCumulative} />
                                {keysLabel && (
                                    <ReferenceLine
                                        x={keysLabel}
                                        stroke="#0ea5e9"
                                        strokeDasharray="4 3"
                                        label={{ value: "Chaves", position: "insideTopLeft", fontSize: 11, fill: "#0ea5e9" }}
                                    />
                                )}
                                {result.breakEvenMonth && (
                                    <ReferenceLine
                                        x={formatMonthLabel(result.breakEvenMonth)}
                                        stroke="#10b981"
                                        strokeDasharray="4 3"
                                        label={{ value: "Payback", position: "insideTopRight", fontSize: 11, fill: "#10b981" }}
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

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Total desembolsado</span>
                        <span className="block text-base font-bold tabular-nums text-foreground">{formatBRL(result.totalOutflow, 0)}</span>
                        <span className="text-muted-foreground">
                            pago + previsto no contrato{result.totalDelivery > 0 ? ` + ${formatBRL(result.totalDelivery, 0)} na entrega` : ""}
                        </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Aluguel no horizonte</span>
                        <span className="block text-base font-bold tabular-nums text-emerald-600">{formatBRL(result.totalRent, 0)}</span>
                        <span className="text-muted-foreground">
                            {result.rentStart ? `a partir de ${formatMonthLabel(result.rentStart)}` : "informe o primeiro aluguel"}
                        </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Payback</span>
                        <span className="block text-base font-bold tabular-nums text-foreground">
                            {result.breakEvenMonth ? formatMonthLabel(result.breakEvenMonth) : "—"}
                        </span>
                        <span className="text-muted-foreground">
                            {result.breakEvenMonths !== null
                                ? `${Math.floor(result.breakEvenMonths / 12)} anos e ${result.breakEvenMonths % 12} meses de aluguel`
                                : "fora do horizonte escolhido"}
                        </span>
                    </div>
                    <div
                        className={
                            beatsCdi === null
                                ? "rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                                : beatsCdi
                                  ? "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2"
                                  : "rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2"
                        }
                        title="Taxa interna de retorno de todo o fluxo no horizonte: parcelas pagas e previstas, custos na entrega e o aluguel líquido. É a taxa que se compara com o CDI."
                    >
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                            <Percent className="w-3 h-3" /> TIR no horizonte
                        </span>
                        <span className={`block text-base font-bold tabular-nums ${beatsCdi === false ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                            {irr !== null ? `${pct(irr)} a.a.` : "—"}
                        </span>
                        <span className="text-muted-foreground">
                            {cdi !== null
                                ? `CDI 12 meses: ${pct(cdi)} a.a.${beatsCdi === null ? "" : beatsCdi ? " · acima do CDI" : " · abaixo do CDI"}`
                                : irr !== null ? "CDI ainda não sincronizado" : "informe o aluguel estimado"}
                        </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                            <KeyRound className="w-3 h-3" /> Entrega
                        </span>
                        <span className="block text-base font-bold text-foreground">{keysLabel ?? "—"}</span>
                        <span className="text-muted-foreground">
                            {investment.keys_delivered_on ? "chaves entregues" : "previsão do contrato"}
                        </span>
                    </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    O aluguel é líquido de vacância e custos e recebe um reajuste a cada doze meses. As parcelas previstas
                    saem do quadro resumo do contrato, cada uma pelo último valor pago do seu tipo — a parcela carrega a
                    correção acumulada e não cai, então a previsão sobe a cada pagamento lançado. A TIR junta tudo isso
                    numa taxa anual: acima do CDI, antecipar parcelas rende menos que deixar o dinheiro aplicado; abaixo,
                    antecipar é o melhor uso dele. Estimativas, não previsões.
                </p>
            </div>
        </section>
    );
}
