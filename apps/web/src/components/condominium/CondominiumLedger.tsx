"use client";

/**
 * Condomínio ledger — one row per month: the condominium charged to the units (revenue, read from
 * Receitas de Aluguel), the costs entered here (energy, internet, water, IPTU, maintenance), the total
 * and the result. Excel-like: sort and filter from the header, right-click to hide columns, click cells
 * to add them up. Above it, the period's totals and the DRE chart.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Building, ExternalLink, Loader2, Percent, Receipt, Trash2, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { CONDO_COST_KEYS, CONDO_COST_LABELS, isAutoCostKey, summarizeCondominium, type CondoAutoKey, type CondoCostKey, type CondominiumCostInput, type CondominiumMonth } from "@/lib/condominium";
import { formatMonthKey } from "@/lib/property-income";
import { groupMonthly, periodLabel, periodRange, type ChartGroup, type PeriodFilterValue } from "@/lib/period-filter";
import { columnTableKey } from "@/lib/ui-preferences";
import PeriodFilter, { GroupSelect } from "@/components/properties/PeriodFilter";
import Tile, { type TileInfo } from "@/components/properties/Tile";
import MoneyInput from "@/components/properties/MoneyInput";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COLLAPSED_ROWS = 24;

type DraftField = CondoCostKey | "notes";

export default function CondominiumLedger({ propertyId, lang = "pt" }: { propertyId: string; lang?: string }) {
    /** Where the derived columns are fed from: the energy bills, the water bills and the property's taxes register. */
    const source = useMemo((): Record<CondoAutoKey, { href: string; label: string; title: string }> => ({
        energy_cost: { href: `/${lang}/dashboard/energy/${propertyId}`, label: "faturas de energia", title: "Vem de Gestão de Energia Solar & Consumo: o “Valor a pagar” da fatura do mês. Envie a fatura lá e o valor entra aqui sozinho." },
        water_cost: { href: `/${lang}/dashboard/billing/${propertyId}`, label: "contas de água", title: "Vem de Água › Histórico de Contas: o “Valor” da conta do mês. Envie a conta lá e o valor entra aqui sozinho." },
        iptu_amount: { href: `/${lang}/imoveis?id=${propertyId}`, label: "Tributos do imóvel", title: "Vem de Tributos do imóvel: o IPTU pago por você, no mês do pagamento, a partir de jan/2025 (antes disso o IPTU fica com o imóvel). Registre o carnê lá e o valor entra aqui sozinho." },
    }), [lang, propertyId]);
    const endpoint = `/api/properties/${propertyId}/condominium`;
    const [months, setMonths] = useState<CondominiumMonth[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Record<string, Partial<Record<DraftField, string>>>>({});
    const [period, setPeriod] = useState<PeriodFilterValue>({ kind: "ytd" });
    const [chartGroup, setChartGroup] = useState<ChartGroup>("month");
    const [showAll, setShowAll] = useState(false);
    const sel = useCellSum();
    const vis = useColumnVisibility(columnTableKey("condominium-ledger"), { locked: ["month"] });

    useEffect(() => {
        let alive = true;
        fetch(endpoint)
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!alive) return;
                if (!res.ok) { setError(data.error || "Erro ao carregar o condomínio"); setMonths([]); return; }
                setMonths(data.months ?? []);
            })
            .catch(() => { if (alive) { setError("Erro ao carregar o condomínio"); setMonths([]); } });
        return () => { alive = false; };
    }, [endpoint]);

    // ── Persist ─────────────────────────────────────────────────────────
    const putRows = useCallback(async (rows: CondominiumCostInput[]) => {
        const keys = rows.map(r => r.month);
        setSaving(prev => new Set([...prev, ...keys]));
        setError(null);
        try {
            const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Erro ao salvar");
            setMonths(data.months ?? []);
            setDrafts(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
        }
    }, [endpoint]);

    const deleteCosts = useCallback(async (month: string) => {
        if (!window.confirm(`Remover os custos de ${formatMonthKey(month)}? A receita do condomínio continua vindo de Receitas de Aluguel.`)) return;
        setSaving(prev => new Set([...prev, month]));
        setError(null);
        try {
            const res = await fetch(`${endpoint}?month=${month}`, { method: "DELETE" });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao remover o mês");
            const fresh = await fetch(endpoint);
            const data = await fresh.json().catch(() => ({}));
            if (fresh.ok) setMonths(data.months ?? []);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(prev => { const n = new Set(prev); n.delete(month); return n; });
        }
    }, [endpoint]);

    // ── Inline editing ──────────────────────────────────────────────────
    const setDraft = (month: string, field: DraftField, value: string) => setDrafts(prev => ({ ...prev, [month]: { ...prev[month], [field]: value } }));
    const cancelDraft = (month: string, field: DraftField) => setDrafts(prev => { const n = { ...prev, [month]: { ...prev[month] } }; delete n[month][field]; return n; });
    const commitDraft = (row: CondominiumMonth, field: DraftField) => {
        const raw = drafts[row.month]?.[field];
        if (raw === undefined) return;
        if (field === "notes") {
            const notes = raw.trim() ? raw.trim().slice(0, 500) : null;
            if (notes === (row.notes ?? null)) return cancelDraft(row.month, field);
            return void putRows([{ month: row.month, notes }]);
        }
        const value = parseInput(raw);
        if (value === null || value === row[field]) return cancelDraft(row.month, field);
        void putRows([{ month: row.month, [field]: value }]);
    };

    // ── Derived ─────────────────────────────────────────────────────────
    const all = useMemo(() => months ?? [], [months]);
    const range = useMemo(() => periodRange(period), [period]);
    const filtered = useMemo(() => all.filter(m => (!range.start || m.month >= range.start) && (!range.end || m.month <= range.end)), [all, range]);
    const summary = useMemo(() => summarizeCondominium(filtered), [filtered]);

    const chartPoints = useMemo(() => groupMonthly(
        [...filtered].sort((a, b) => (a.month < b.month ? -1 : 1)).map(m => ({ key: m.month, month: formatMonthKey(m.month), receita: m.revenue, custos: m.totalCost, resultado: m.result, previsto: m.expected })),
        chartGroup
    ), [filtered, chartGroup]);

    const columns = useMemo<ColumnDef<CondominiumMonth>[]>(() => [
        { key: "month", label: "Mês", kind: "month", get: r => r.month },
        { key: "revenue", label: "Receita", kind: "number", align: "right", title: "Condomínio cobrado das unidades no mês (soma da coluna Condomínio de Receitas de Aluguel)", get: r => r.revenue },
        ...CONDO_COST_KEYS.map(k => ({ key: k, label: CONDO_COST_LABELS[k], kind: "number" as const, align: "right" as const, title: isAutoCostKey(k) ? source[k].title : undefined, get: (r: CondominiumMonth) => r[k] })),
        { key: "totalCost", label: "Total de custos", kind: "number", align: "right", get: r => r.totalCost },
        { key: "result", label: "Resultado", kind: "number", align: "right", title: "Receita − custos", get: r => r.result },
        { key: "notes", label: "Descrição", kind: "text", get: r => r.notes ?? "" },
    ], [source]);
    const cf = useColumnFilters(filtered, columns, { key: "month", dir: "desc" }, { storageKey: columnTableKey("condominium-ledger") });
    const visible = showAll ? cf.rows : cf.rows.slice(0, COLLAPSED_ROWS);
    const show = (key: string) => !vis.isHidden(key);

    const info: Record<"revenue" | "cost" | "result" | "margin", TileInfo> = {
        revenue: {
            what: "O condomínio cobrado de todas as unidades nos meses do período. Vem da coluna Condomínio de Receitas de Aluguel: cada unidade, alugada ou vaga, deve o condomínio do mês.",
            formula: <>Receita do mês = Σ condomínio das unidades<br />No período = Σ dos meses</>,
            example: summary.months ? <>{formatBRL(summary.revenue)} em {summary.months} {summary.months === 1 ? "mês" : "meses"} · {periodLabel(period)}</> : undefined,
        },
        cost: {
            what: "O que o condomínio gastou no período. Energia vem das faturas de energia do imóvel (Valor a pagar), água das contas de água (Valor) e IPTU de Tributos do imóvel, lançados uma vez só; internet e manutenção são digitados na tabela abaixo.",
            formula: "Custos = energia + internet + água + IPTU + manutenção",
            example: summary.months ? <>{CONDO_COST_KEYS.map(k => `${CONDO_COST_LABELS[k]} ${formatBRL(summary.byCost[k])}`).join(" · ")}</> : undefined,
        },
        result: {
            what: "O que sobra (ou falta) depois de o condomínio pagar o que está incluído nele. Positivo, é lucro do condomínio; negativo, o proprietário cobre a diferença.",
            formula: "Resultado = receita − custos",
            example: summary.months ? <>{formatBRL(summary.revenue)} − {formatBRL(summary.totalCost)} = {formatBRL(summary.result)}</> : undefined,
        },
        margin: {
            what: "Quanto da receita do condomínio vira resultado.",
            formula: "Margem = resultado ÷ receita",
            example: summary.marginPct !== null ? <>{formatBRL(summary.result)} ÷ {formatBRL(summary.revenue)} = {summary.marginPct}%</> : undefined,
        },
    };

    if (months === null) {
        return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o condomínio…</div>;
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}

            {/* KPIs of the period */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="Receita do condomínio" value={formatBRL(summary.revenue)} hint={summary.months ? `${summary.months} ${summary.months === 1 ? "mês" : "meses"} · ${periodLabel(period)}` : `Nenhum mês · ${periodLabel(period)}`} icon={<Wallet className="w-4 h-4" />} tone="emerald" info={info.revenue} />
                <Tile label="Custos" value={formatBRL(summary.totalCost)} hint={summary.revenue > 0 ? `${Math.round((summary.totalCost / summary.revenue) * 100)}% da receita` : "—"} icon={<Receipt className="w-4 h-4" />} tone="rose" info={info.cost} />
                <Tile label="Resultado" value={<span className={summary.result < 0 ? "text-rose-600" : undefined}>{formatBRL(summary.result)}</span>} hint={summary.months ? `Média ${formatBRL(summary.result / summary.months)}/mês` : "—"} icon={<TrendingUp className="w-4 h-4" />} tone="blue" info={info.result} />
                <Tile label="Margem" value={summary.marginPct !== null ? `${summary.marginPct}%` : "—"} hint="Resultado ÷ receita" icon={<Percent className="w-4 h-4" />} tone="violet" info={info.margin} />
            </div>

            {/* DRE */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <h3 className="font-bold text-base text-foreground flex items-center gap-2"><Building className="w-4 h-4 text-emerald-600" /> Demonstrativo de Resultados do condomínio</h3>
                        <p className="text-xs text-muted-foreground">Receita (condomínio das unidades), custos e resultado por mês · {periodLabel(period)}{filtered.some(m => m.expected) ? " · meses previstos em tom claro" : ""}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <PeriodFilter value={period} onChange={setPeriod} variant="compact" />
                        <GroupSelect value={chartGroup} onChange={setChartGroup} />
                    </div>
                </div>
                {chartPoints.length > 0 ? (
                    <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartPoints} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={v => `R$ ${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                                <RechartsTooltip
                                    formatter={(value, name) => [formatBRL(Number(value)), String(name ?? "")]}
                                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                                />
                                <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                    {chartPoints.map((d, i) => <Cell key={`r-${i}`} fill="#10b981" fillOpacity={d.previsto ? 0.35 : 1} />)}
                                </Bar>
                                <Bar dataKey="custos" name="Custos" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                    {chartPoints.map((d, i) => <Cell key={`c-${i}`} fill="#f43f5e" fillOpacity={d.previsto ? 0.35 : 1} />)}
                                </Bar>
                                <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#3b82f6" strokeWidth={3} dot={chartPoints.length > 24 ? false : { r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhum mês no período. Os meses vêm de Receitas de Aluguel: um mês aparece aqui assim que uma unidade do imóvel tem aluguel ou condomínio registrado.</p>
                )}
            </div>

            {/* Ledger */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-base text-foreground flex items-center gap-2"><Receipt className="w-4 h-4 text-rose-600" /> Custos do condomínio</h3>
                    <p className="text-xs text-muted-foreground">
                        Um mês por linha, criado sozinho para cada mês em que alguma unidade do imóvel tem aluguel em Receitas de Aluguel. A receita vem de lá;
                        Energia vem das <Link href={source.energy_cost.href} className="text-emerald-700 dark:text-emerald-400 hover:underline">faturas de energia</Link> (Valor a pagar), água das <Link href={source.water_cost.href} className="text-emerald-700 dark:text-emerald-400 hover:underline">contas de água</Link> (Valor) e IPTU de <Link href={source.iptu_amount.href} className="text-emerald-700 dark:text-emerald-400 hover:underline">Tributos do imóvel</Link>, uma entrada só.
                        Internet e manutenção você digita nas células (Enter ou Tab para salvar). Clique no cabeçalho para ordenar e filtrar, com o botão direito para ocultar colunas; clique nas células para somá-las.
                    </p>
                </div>

                <span className="text-xs text-muted-foreground">
                    {periodLabel(period)} · {filtered.length} {filtered.length === 1 ? "mês" : "meses"}{cf.anyFilter && ` · ${cf.rows.length} de ${filtered.length}`}
                </span>
                <FilterChips columns={columns} ctl={cf} />

                {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhum mês no período.</p>
                ) : (
                    <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-xs" style={{ minWidth: `${Math.max(480, columns.filter(c => !vis.isHidden(c.key)).length * 104)}px` }}>
                            <thead>
                                <ColumnHeaders columns={columns} ctl={cf} visibility={vis} trailing={<th className="px-2 py-2" />} />
                            </thead>
                            <tbody>
                                {visible.map(row => {
                                    const d = drafts[row.month] ?? {};
                                    const busy = saving.has(row.month);
                                    const cell = (field: CondoCostKey) => (
                                        <MoneyInput value={row[field]} draft={d[field]} disabled={busy} onDraft={t => setDraft(row.month, field, t)} onCommit={() => commitDraft(row, field)} />
                                    );
                                    return (
                                        <tr key={row.month} className={cn("border-b border-border/60 hover:bg-muted/30", row.expected && "opacity-70")}>
                                            <td {...sel.cellProps("month", row.month, null, "px-2 py-1 font-semibold text-foreground whitespace-nowrap")}>
                                                {formatMonthKey(row.month)}
                                                {row.expected && <span className="ml-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">previsto</span>}
                                                {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-muted-foreground" />}
                                            </td>
                                            {show("revenue") && <td {...sel.cellProps("revenue", row.month, row.revenue, "px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums")} title={row.units ? `${row.units} ${row.units === 1 ? "unidade" : "unidades"} com condomínio no mês` : "Nenhuma unidade com condomínio neste mês em Receitas de Aluguel"}>{formatBRL(row.revenue)}</td>}
                                            {CONDO_COST_KEYS.map(k => show(k) && (isAutoCostKey(k) ? (
                                                <td key={k} {...sel.cellProps(k, row.month, row[k], "px-2 py-1 text-right tabular-nums text-muted-foreground")} title={source[k].title}>
                                                    {row[k] > 0 ? formatBRL(row[k]) : (
                                                        <Link href={source[k].href} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline" title={`Sem valor neste mês · abrir ${source[k].label}`}>
                                                            — <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                    )}
                                                </td>
                                            ) : (
                                                <td key={k} {...sel.cellProps(k, row.month, row[k], "px-2 py-1 text-right", () => cancelDraft(row.month, k))}>{cell(k)}</td>
                                            )))}
                                            {show("totalCost") && <td {...sel.cellProps("totalCost", row.month, row.totalCost, "px-2 py-1 text-right font-semibold text-rose-600 tabular-nums")}>{formatBRL(row.totalCost)}</td>}
                                            {show("result") && <td {...sel.cellProps("result", row.month, row.result, cn("px-2 py-1 text-right font-semibold tabular-nums", row.result < 0 ? "text-rose-600" : "text-foreground"))}>{formatBRL(row.result)}</td>}
                                            {show("notes") && <td {...sel.cellProps("notes", row.month, null, "px-2 py-1", () => cancelDraft(row.month, "notes"))}>
                                                <input
                                                    type="text" disabled={busy} value={d.notes ?? (row.notes ?? "")} placeholder="—"
                                                    onChange={e => setDraft(row.month, "notes", e.target.value)} onBlur={() => commitDraft(row, "notes")}
                                                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                    className="bg-transparent border border-transparent hover:border-border focus:border-emerald-500 focus:bg-background rounded-none w-full min-w-[10rem] px-1.5 py-1 outline-none"
                                                />
                                            </td>}
                                            <td className="px-2 py-1 text-center">
                                                {row.hasCosts && (
                                                    <button type="button" disabled={busy} onClick={() => void deleteCosts(row.month)} title="Remover os custos deste mês" className="text-muted-foreground hover:text-rose-600 disabled:opacity-40">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {cf.rows.length > COLLAPSED_ROWS && (
                            <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                                {showAll ? "Mostrar menos" : `Mostrar todos os ${cf.rows.length} meses`}
                            </button>
                        )}
                    </div>
                )}
                <ColumnMenu columns={columns} ctl={cf} />
                <ColumnVisibilityMenu columns={columns} ctl={vis} />
                <CellSumBar ctl={sel} />
            </div>
        </div>
    );
}

/** "1.234,56", "1234.56", "R$ 80" → number; null for blank or junk. */
function parseInput(raw: string): number | null {
    const s = raw.replace(/[R$\s]/g, "");
    if (!s) return null;
    const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
