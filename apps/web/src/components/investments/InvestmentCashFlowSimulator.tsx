"use client";

/**
 * Cash-flow simulator of a Novo Investimento.
 *
 * Below the axis, what leaves the pocket: the instalments already paid (solid) and the ones the
 * contract still owes (hollow). Above it, the rent the unit is expected to produce once the keys
 * arrive, growing by one adjustment a year. The vertical marker is the key handover; the line is
 * the running total, and where it crosses zero is when the investment has paid itself back.
 *
 * The assumptions are stored on the investment, so the chart is the same for everyone who opens it.
 */
import React, { useMemo, useState } from "react";
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
import { KeyRound, Loader2, RotateCcw, Save, TrendingUp } from "lucide-react";
import { Button } from "@kitnets/ui";
import {
    assumptionsOf,
    formatMonthLabel,
    simulateCashFlow,
    type CashFlowAssumptions,
} from "@/lib/new-investment-cashflow";
import { formatBRL, formatBRLShort, type InvestmentPayment, type InvestmentSchedule, type NewInvestment } from "@/lib/new-investments";

interface Props {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
    onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

const HORIZONS = [
    { months: 60, label: "5 anos" },
    { months: 120, label: "10 anos" },
    { months: 180, label: "15 anos" },
    { months: 240, label: "20 anos" },
];

const inputCls = "w-full h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums";

/** `YYYY-MM` ↔ the month input's value (they are the same string; this only guards nulls). */
const monthValue = (v: string | null) => v ?? "";

export default function InvestmentCashFlowSimulator({ investment, schedules, payments, onSave }: Props) {
    const stored = useMemo(() => assumptionsOf(investment), [investment]);
    const [draft, setDraft] = useState<CashFlowAssumptions>(stored);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    /** The running-total line drowns the monthly bars at this scale, so it starts off; its legend entry toggles it. */
    const [showCumulative, setShowCumulative] = useState(false);

    const assumptions = dirty ? draft : stored;
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
                aluguel: p.rent > 0 ? p.rent : null,
                acumulado: p.cumulative,
            })),
        [result]
    );

    const set = <K extends keyof CashFlowAssumptions>(key: K) => (value: CashFlowAssumptions[K]) => {
        setDraft(prev => ({ ...(dirty ? prev : stored), [key]: value }));
        setDirty(true);
    };
    const num = (key: "monthlyRent" | "rentAdjustmentPct" | "vacancyPct" | "costsPct") =>
        (e: React.ChangeEvent<HTMLInputElement>) => set(key)(Number(e.target.value.replace(",", ".")) || 0);

    const save = async () => {
        setSaving(true);
        const ok = await onSave({
            estimated_rent: draft.monthlyRent,
            rent_start_on: draft.rentStart ? `${draft.rentStart}-01` : null,
            rent_adjustment_pct: draft.rentAdjustmentPct,
            rent_vacancy_pct: draft.vacancyPct,
            rent_costs_pct: draft.costsPct,
        });
        setSaving(false);
        if (ok) setDirty(false);
    };

    const keysLabel = result.keysMonth ? formatMonthLabel(result.keysMonth) : null;

    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div>
                    <h2 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-violet-600" /> Simulador de fluxo de caixa
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Parcelas abaixo do eixo, aluguel estimado acima. A linha vertical marca a entrega das chaves.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {dirty && (
                        <Button size="sm" variant="ghost" onClick={() => { setDraft(stored); setDirty(false); }}>
                            <RotateCcw className="w-4 h-4 mr-1" /> Desfazer
                        </Button>
                    )}
                    <Button size="sm" onClick={save} disabled={!dirty || saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar premissas
                    </Button>
                </div>
            </header>

            <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Aluguel estimado (R$)</span>
                        <input type="number" step="50" min="0" value={assumptions.monthlyRent || ""} onChange={num("monthlyRent")} className={inputCls} placeholder="0" />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Primeiro aluguel</span>
                        <input
                            type="month"
                            value={monthValue(assumptions.rentStart)}
                            onChange={e => set("rentStart")(e.target.value || null)}
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
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Horizonte</span>
                        <select
                            value={assumptions.horizonMonths}
                            onChange={e => set("horizonMonths")(Number(e.target.value))}
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

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Total desembolsado</span>
                        <span className="block text-base font-bold tabular-nums text-foreground">{formatBRL(result.totalOutflow, 0)}</span>
                        <span className="text-muted-foreground">pago + previsto no contrato</span>
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
                    correção acumulada e não cai, então a previsão sobe a cada pagamento lançado. Estimativas, não previsões.
                </p>
            </div>
        </section>
    );
}
