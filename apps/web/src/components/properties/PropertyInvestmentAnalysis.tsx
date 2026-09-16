"use client";

/**
 * Análise do investimento — payback, forecast, yields, IRR, market value and
 * real (IPCA) payback computed from the ledgers with `computeInvestmentMetrics`.
 * Also owns the property's valuations (manual, appraisal, FipeZap, listings).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
    Activity, AlertCircle, BadgeDollarSign, CalendarClock, FileSpreadsheet, Gauge, Landmark, Loader2, Percent, PiggyBank, Plus, Scale, Sparkles, Target, Trash2, TrendingUp, Wallet,
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Tile from "./Tile";
import InvestmentScenarios from "./InvestmentScenarios";
import { computeInvestmentMetrics, type InvestmentMetrics } from "@/lib/investment-metrics";
import { formatMonthKey, type PropertyIncomeRow } from "@/lib/property-income";
import { formatDateBR, type PropertyInvestment, type PropertyTransaction } from "@/lib/property-investment";
import type { PropertyTax } from "@/lib/property-taxes";
import {
    latestValuation,
    VALUATION_SOURCE_LABELS,
    VALUATION_SOURCES,
    type MonthlyIndexPoint,
    type PropertyValuation,
    type ValuationSource,
} from "@/lib/property-valuations";

interface Props {
    propertyId?: string;
    /** bedrooms from the property details (FipeZap bucket) */
    bedrooms?: string;
    investment: PropertyInvestment | null;
    transactions: PropertyTransaction[];
    incomeRows: PropertyIncomeRow[];
    taxes: PropertyTax[];
    loading?: boolean;
    /** Valuations loaded by the parent (overview): undefined = fetch here. */
    preloadedValuations?: PropertyValuation[] | null;
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
const todayIso = () => new Date().toISOString().slice(0, 10);
const endOfMonth = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

interface ChartPoint {
    month: string;
    label: string;
    investido: number | null;
    recuperado: number | null;
    projecao: number | null;
    projecaoInvestido: number | null;
}

function buildChart(m: InvestmentMetrics, real: boolean): ChartPoint[] {
    const pts: ChartPoint[] = m.series.map(p => ({
        month: p.month, label: formatMonthKey(p.month),
        investido: real ? p.cumInvestedReal : p.cumInvested, recuperado: real ? p.cumNoiReal : p.cumNoi,
        projecao: null, projecaoInvestido: null,
    }));
    if (real) return pts;   // the projection is nominal; not shown in today's money
    m.projection.forEach((p, i) => {
        if (i === 0) {
            const last = pts[pts.length - 1];
            if (last && last.month === p.month) { last.projecao = p.cumNoi; last.projecaoInvestido = p.cumInvested; return; }
        }
        pts.push({ month: p.month, label: formatMonthKey(p.month), investido: null, recuperado: null, projecao: p.cumNoi, projecaoInvestido: p.cumInvested });
    });
    return pts;
}

type Draft = { valued_on: string; amount: string; source: ValuationSource; note: string };
const emptyDraft = (): Draft => ({ valued_on: todayIso(), amount: "", source: "MANUAL", note: "" });

export default function PropertyInvestmentAnalysis({ propertyId, bedrooms, investment, transactions, incomeRows, taxes, loading, preloadedValuations }: Props) {
    const [includeExpected, setIncludeExpected] = useState(false);
    const [realMode, setRealMode] = useState(false);

    // ── valuations + IPCA ───────────────────────────────────────────────
    const endpoint = propertyId ? `/api/properties/${propertyId}/valuations` : null;
    const [valuations, setValuations] = useState<PropertyValuation[]>([]);
    const [ipca, setIpca] = useState<MonthlyIndexPoint[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [busy, setBusy] = useState<"save" | "fipezap" | string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fipezapNote, setFipezapNote] = useState<string | null>(null);

    useEffect(() => {
        if (!endpoint) return;
        let cancelled = false;
        if (preloadedValuations !== undefined) {
            if (preloadedValuations) setValuations(preloadedValuations);
        } else {
            fetch(endpoint)
                .then(async res => { const d = await res.json().catch(() => ({})); if (res.ok && !cancelled) setValuations(d.rows ?? []); })
                .catch(() => { /* tiles show the empty state */ });
        }
        fetch("/api/indices/ipca/calculator-data")
            .then(async res => { const d = await res.json().catch(() => []); if (res.ok && Array.isArray(d) && !cancelled) setIpca(d as MonthlyIndexPoint[]); })
            .catch(() => { /* real payback stays unavailable */ });
        return () => { cancelled = true; };
    }, [endpoint, preloadedValuations]);

    const latest = useMemo(() => latestValuation(valuations), [valuations]);
    const metrics = useMemo(
        () => computeInvestmentMetrics({
            investment, transactions, incomeRows, taxes, includeExpected, ipca,
            marketValue: latest ? { amount: latest.amount, valuedOn: latest.valued_on, source: latest.source } : null,
        }),
        [investment, transactions, incomeRows, taxes, includeExpected, ipca, latest]
    );
    const real = realMode && metrics.ipcaAvailable;
    const chart = useMemo(() => buildChart(metrics, real), [metrics, real]);
    const hasData = metrics.cashInvested > 0;
    const paidBack = metrics.remaining <= 0 && hasData;
    const financed = investment?.financing_status === "ACTIVE";

    const saveDraft = useCallback(async () => {
        if (!endpoint) return;
        const amount = Number(draft.amount.replace(/\./g, "").replace(",", "."));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.valued_on)) { setError("Informe a data da avaliação"); return; }
        if (!Number.isFinite(amount) || amount <= 0) { setError("Informe o valor avaliado"); return; }
        setBusy("save"); setError(null);
        try {
            const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [{ valued_on: draft.valued_on, amount, source: draft.source, note: draft.note.trim() || null }] }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao salvar");
            setValuations(d.rows ?? []);
            setDraft(emptyDraft());
            setFipezapNote(null);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    }, [endpoint, draft]);

    const removeValuation = useCallback(async (row: PropertyValuation) => {
        if (!endpoint) return;
        if (!window.confirm(`Excluir a avaliação de ${formatDateBR(row.valued_on)} (${formatBRL(row.amount)})?`)) return;
        setBusy(row.id); setError(null);
        try {
            const res = await fetch(`${endpoint}?id=${row.id}`, { method: "DELETE" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao excluir");
            setValuations(prev => prev.filter(v => v.id !== row.id));
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    }, [endpoint]);

    const estimateFipezap = useCallback(async () => {
        if (!endpoint) return;
        setBusy("fipezap"); setError(null);
        try {
            const res = await fetch(`${endpoint}/fipezap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bedrooms }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || "Erro ao consultar o FipeZap");
            const e = d.estimate as { amount: number; factor: number; from: string; to: string; months: number };
            const pct = ((e.factor - 1) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
            const bucket = d.bucket === "total" ? "todos os dormitórios" : `${d.bucket} dorm.`;
            const note = `FipeZap venda (${bucket}): ${pct}% de ${formatMonthKey(e.from)} a ${formatMonthKey(e.to)} sobre ${formatBRL(d.purchasePrice)}`;
            setDraft({ valued_on: endOfMonth(e.to), amount: e.amount.toFixed(2).replace(".", ","), source: "FIPEZAP", note });
            setFipezapNote(`Estimativa preenchida: ${formatBRL(e.amount)} (${e.months} meses de índice). Confira e clique em Salvar.`);
        } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
    }, [endpoint, bedrooms]);

    // ── labels ──────────────────────────────────────────────────────────
    const paybackHint = paidBack
        ? `Investimento recuperado em ${metrics.paybackReachedOn ? formatMonthKey(metrics.paybackReachedOn) : "—"}`
        : `Falta ${formatBRL(metrics.remaining)}`;
    const forecastValue = paidBack ? "Concluído" : metrics.paybackForecastMonth ? formatMonthKey(metrics.paybackForecastMonth) : "—";
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
    const valueSourceLabel = metrics.marketValueSource ? (VALUATION_SOURCE_LABELS[metrics.marketValueSource as ValuationSource] ?? metrics.marketValueSource) : null;
    const needValue = <>Cadastre uma avaliação em <button type="button" onClick={() => setDialogOpen(true)} className="underline underline-offset-2 text-foreground">Valor de mercado</button></>;

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
                        {" "}Investido = tudo o que você pagou (inclusive custos, tributos e energia solar); renda líquida = aluguel líquido + energia líquida − outras despesas.
                        {investment?.purchase_price ? ` Valor de compra ${formatBRL(investment.purchase_price)}${investment.acquired_on ? ` em ${formatDateBR(investment.acquired_on)}` : ""}.` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input type="checkbox" className="accent-emerald-600" checked={includeExpected} onChange={e => setIncludeExpected(e.target.checked)} />
                        Incluir meses previstos
                        {metrics.expectedMonthsExcluded > 0 && !includeExpected && <span className="text-amber-600">({metrics.expectedMonthsExcluded} fora)</span>}
                    </label>
                    {propertyId && (
                        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5 text-xs">
                            <BadgeDollarSign className="w-3.5 h-3.5" /> Valor de mercado{valuations.length ? ` (${valuations.length})` : ""}
                        </Button>
                    )}
                    {propertyId && hasData && (
                        <a href={`/api/properties/${propertyId}/report`} download className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors" title="Excel com resumo, série mensal, receitas, investimento, tributos e avaliações">
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar relatório
                        </a>
                    )}
                </div>
            </div>

            {error && !dialogOpen && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}

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
                            hint={<>
                                Desde {metrics.firstMonth ? formatMonthKey(metrics.firstMonth) : "—"} · {monthsLabel(metrics.monthsTracked)} acompanhados
                                {metrics.registerIptuUsed > 0 && <><br />Tributos pagos por você: {formatBRL(metrics.registerIptuUsed)}</>}
                            </>} />
                        <Tile label="Renda líquida acumulada" value={formatBRL(metrics.netIncomeToDate)} tone="blue" icon={<Wallet className="w-4 h-4" />}
                            hint={<>
                                Aluguel líquido + energia líquida − outras despesas
                                <br />{monthsLabel(metrics.incomeMonths)} com receita · últimos 12 meses {formatBRL(metrics.noi12m)}
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

                    {/* Value and returns */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        <Tile label="Valor de mercado" value={metrics.marketValue !== null ? formatBRL(metrics.marketValue) : "—"} tone="emerald" icon={<BadgeDollarSign className="w-4 h-4" />}
                            hint={metrics.marketValue !== null
                                ? <>{valueSourceLabel} · {formatDateBR(metrics.marketValueOn)} · <button type="button" onClick={() => setDialogOpen(true)} className="underline underline-offset-2 hover:text-foreground">avaliações</button>{metrics.capRate !== null && <><br />Cap rate {pctLabel(metrics.capRate)} · yield bruto sobre valor {pctLabel(metrics.grossYieldOnValue)}</>}</>
                                : needValue} />
                        <Tile label="Valorização" value={metrics.appreciationPct !== null ? pctLabel(metrics.appreciationPct) : "—"} tone={metrics.appreciationPct !== null && metrics.appreciationPct < 0 ? "rose" : "emerald"} icon={<TrendingUp className="w-4 h-4" />}
                            hint={metrics.appreciationGain !== null
                                ? `${metrics.appreciationGain >= 0 ? "+" : ""}${formatBRL(metrics.appreciationGain)} sobre o valor de compra${investment?.acquired_on ? ` (${formatDateBR(investment.acquired_on)})` : ""}`
                                : investment?.purchase_price ? needValue : "Informe o valor de compra em Aquisição & financiamento"} />
                        <Tile label="Patrimônio no imóvel" value={metrics.equity !== null ? formatBRL(metrics.equity) : "—"} tone="violet" icon={<Landmark className="w-4 h-4" />}
                            hint={metrics.equity !== null
                                ? <>Valor de mercado − saldo devedor{metrics.outstandingBalance ? ` (${formatBRL(metrics.outstandingBalance)})` : ""}{metrics.equityMultiple !== null && <><br />Múltiplo: (renda + patrimônio) ÷ investido = {metrics.equityMultiple.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×</>}</>
                                : metrics.marketValue !== null ? "Saldo devedor desconhecido: calcule juros e amortização das prestações" : needValue} />
                        <Tile label="TIR com valorização" value={metrics.irrWithValue !== null ? `${pctLabel(metrics.irrWithValue)} a.a.` : "—"} tone={metrics.irrWithValue !== null && metrics.irrWithValue >= 0 ? "emerald" : "slate"} icon={<Scale className="w-4 h-4" />}
                            hint={metrics.irrWithValue !== null ? "Fluxos realizados + patrimônio no imóvel como saída hoje (valor estimado)" : needValue} />
                        <Tile label="Retorno total" value={metrics.totalReturn !== null ? formatBRL(metrics.totalReturn) : "—"} tone="blue" icon={<Wallet className="w-4 h-4" />}
                            hint={metrics.totalReturn !== null ? `Renda líquida acumulada + valorização = ${pctLabel(metrics.totalReturnPct)} do investido` : needValue} />
                        <Tile label="Payback real (IPCA)" value={metrics.paybackPctReal !== null ? pctLabel(metrics.paybackPctReal) : "—"} tone="amber" icon={<Gauge className="w-4 h-4" />}
                            hint={metrics.paybackPctReal !== null
                                ? <>Em valores de hoje: investido {formatK(metrics.cashInvestedReal ?? 0)} · renda {formatK(metrics.netIncomeToDateReal ?? 0)}{metrics.remainingReal ? <><br />Falta {formatBRL(metrics.remainingReal)}</> : <><br />Recuperado</>}</>
                                : "Série IPCA indisponível no momento"} />
                    </div>

                    {/* Payback curve */}
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5" />
                                Curva de payback · investido acumulado vs. renda líquida acumulada
                                {!real && metrics.projection.length > 0 && <> · projeção tracejada até {formatMonthKey(metrics.paybackForecastMonth!)}</>}
                                {real && <> · em valores de {formatMonthKey(metrics.asOf)} (IPCA)</>}
                            </span>
                            {metrics.ipcaAvailable && (
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="accent-emerald-600" checked={realMode} onChange={e => setRealMode(e.target.checked)} />
                                    Valores de hoje (IPCA)
                                </label>
                            )}
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
                                    <Area type="stepAfter" dataKey="investido" name={real ? "Investido acumulado (hoje)" : "Investido acumulado"} stroke="#10b981" strokeWidth={2} fill="url(#payback-invested)" dot={false} connectNulls={false} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="recuperado" name={real ? "Renda líquida acumulada (hoje)" : "Renda líquida acumulada"} stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                                    {!real && metrics.projection.length > 0 && (
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
                            Base de caixa: tudo o que foi pago (entrada, custos de aquisição, prestações, amortizações, quitação, tarifas, reformas, custos, tributos e energia solar). A projeção repete a renda líquida média dos últimos 12 meses
                            {financed ? " e as prestações restantes do contrato" : ""}; não considera valorização do imóvel. Em “valores de hoje” cada mês é corrigido pelo IPCA até {formatMonthKey(metrics.asOf)}.
                            {metrics.expectedMonthsExcluded > 0 && !includeExpected && ` ${metrics.expectedMonthsExcluded} ${metrics.expectedMonthsExcluded === 1 ? "mês previsto ficou" : "meses previstos ficaram"} de fora; marque "Incluir meses previstos" para contá-los.`}
                        </p>
                    </div>

                    <InvestmentScenarios metrics={metrics} investment={investment} />
                </>
            )}

            {/* Valuations dialog */}
            <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) { setError(null); setFipezapNote(null); } }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Valor de mercado do imóvel</DialogTitle>
                        <DialogDescription>
                            Registre quanto o imóvel vale ao longo do tempo. A avaliação mais recente alimenta valorização, patrimônio e TIR com valorização. Todo valor de mercado é uma estimativa.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {valuations.length > 0 ? (
                            <div className="rounded-xl border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                                            <th className="text-left px-2 py-1.5 font-semibold">Data</th>
                                            <th className="text-right px-2 py-1.5 font-semibold">Valor</th>
                                            <th className="text-left px-2 py-1.5 font-semibold">Fonte</th>
                                            <th className="px-2 py-1.5" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {valuations.map(v => (
                                            <tr key={v.id} className="border-b border-border/60 last:border-0 align-top">
                                                <td className="px-2 py-1.5 whitespace-nowrap">{formatDateBR(v.valued_on)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatBRL(v.amount)}</td>
                                                <td className="px-2 py-1.5">
                                                    {VALUATION_SOURCE_LABELS[v.source] ?? v.source}
                                                    {v.note && <span className="block text-[11px] text-muted-foreground">{v.note}</span>}
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <button type="button" disabled={busy === v.id} onClick={() => removeValuation(v)} className="text-muted-foreground hover:text-rose-600" title="Excluir">
                                                        {busy === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
                        )}

                        <div className="rounded-xl border border-dashed border-border p-3 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova avaliação</span>
                                <Button size="sm" variant="outline" onClick={estimateFipezap} disabled={busy !== null} className="gap-1.5 text-xs" title="Corrige o valor de compra pelo índice FipeZap de venda desde a aquisição">
                                    {busy === "fipezap" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Estimar pelo FipeZap
                                </Button>
                            </div>
                            {fipezapNote && <p className="text-[11px] text-emerald-700 dark:text-emerald-400">{fipezapNote}</p>}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="val-date" className="text-xs">Data</Label>
                                    <Input id="val-date" type="date" value={draft.valued_on} onChange={e => setDraft(d => ({ ...d, valued_on: e.target.value }))} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="val-amount" className="text-xs">Valor (R$)</Label>
                                    <Input id="val-amount" inputMode="decimal" placeholder="450000,00" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label htmlFor="val-source" className="text-xs">Fonte</Label>
                                    <select id="val-source" value={draft.source} onChange={e => setDraft(d => ({ ...d, source: e.target.value as ValuationSource }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                                        {VALUATION_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label htmlFor="val-note" className="text-xs">Observação</Label>
                                    <Input id="val-note" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} placeholder="Ex.: laudo Caixa, anúncio do vizinho…" className="h-8 text-xs" />
                                </div>
                            </div>
                            {error && <p className="text-xs text-rose-600 inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Fechar</Button>
                        <Button size="sm" onClick={saveDraft} disabled={busy !== null} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                            {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar avaliação
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
