"use client";

/**
 * The Energia hub: every consumer unit the account follows — the rental properties and the
 * standalone UCs (own home, a relative's house, beneficiary units) — with what the newest bills add
 * up to (consumption, amounts due, solar savings, credits, injected energy), what deserves a look
 * (overdue or imminent bills, units without a recent bill, consumption spikes), then one card each
 * with the distributor's logo as the cover.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BatteryCharging, Building2, ChevronDown, ChevronUp, DollarSign, Loader2, Plus, Search, Sparkles, Sun, Zap, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/lease-extract";
import { ENERGY_VIEWS, energyAttention, energyHubTotals, inEnergyView, type EnergyUnitRow, type EnergyView } from "@/lib/energy-hub";
import EnergyUnitCard from "./EnergyUnitCard";

interface Props {
    lang: string;
    rows: EnergyUnitRow[];
    loading: boolean;
    error: string | null;
    view: EnergyView;
    onViewChange: (view: EnergyView) => void;
    onOpen: (row: EnergyUnitRow) => void;
    onDelete: (row: EnergyUnitRow) => void;
    onViewPdf: (row: EnergyUnitRow) => void;
    deletingId: string | null;
    onAddUc: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const brl = (v: number, digits = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const kwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;

function Item({ icon, label, value, hint, tone, valueTone, onClick, title }: { icon: React.ReactNode; label: string; value: string; hint: React.ReactNode; tone: string; valueTone?: string; onClick?: () => void; title?: string }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={title}
            className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border border-border/80 bg-card px-4 py-3 text-left", onClick && "cursor-pointer transition-colors hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500")}
        >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={tone}>{icon}</span>{label}
            </span>
            <span className={cn("block break-words text-xl font-bold leading-tight", valueTone ?? "text-foreground")}>{value}</span>
            <span className="block break-words text-xs leading-snug text-muted-foreground">{hint}</span>
        </Tag>
    );
}

const DOT: Record<string, string> = { rose: "bg-rose-500", amber: "bg-amber-500", slate: "bg-slate-400" };

export default function EnergyHub({ lang, rows, loading, error, view, onViewChange, onOpen, onDelete, onViewPdf, deletingId, onAddUc }: Props) {
    const [search, setSearch] = useState("");
    const [distributor, setDistributor] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => energyHubTotals(rows), [rows]);
    const attention = useMemo(() => energyAttention(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(ENERGY_VIEWS.map(v => [v.key, rows.filter(r => inEnergyView(r.kind, v.key)).length])) as Record<EnergyView, number>, [rows]);
    const distributors = useMemo(() => [...new Set(rows.map(r => r.distributor))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

    const visible = useMemo(() => {
        const q = normalizeText(search);
        return rows.filter(r => {
            if (!inEnergyView(r.kind, view)) return false;
            if (distributor && r.distributor !== distributor) return false;
            if (q && !r.haystack.includes(q)) return false;
            return true;
        });
    }, [rows, view, distributor, search]);

    const filtered = Boolean(search || distributor);
    const viewMeta = ENERGY_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);
    const billsHint = totals.overdue > 0
        ? `${plural(totals.overdue, "vencida", "vencidas")}${totals.dueSoon > 0 ? ` · ${plural(totals.dueSoon, "vence", "vencem")} em 7 dias` : ""}`
        : totals.dueSoon > 0
            ? `${plural(totals.dueSoon, "vence", "vencem")} em até 7 dias`
            : totals.paid12 > 0 ? `12 meses: ${brl(totals.paid12)}` : "faturas mais recentes de cada unidade";

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Zap className="h-6 w-6 text-amber-500" /> Energia
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        As contas de luz de cada imóvel e UC avulsa: consumo, valor a pagar, geração solar, créditos e a economia que a compensação traz.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href={`/${lang}/imoveis`}>
                        <Button variant="outline"><Building2 className="mr-1 h-4 w-4" /> Meus imóveis</Button>
                    </Link>
                    <Button onClick={onAddUc}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar UC avulsa
                    </Button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<Building2 className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Unidades"
                        value={String(totals.units)}
                        hint={[totals.rental > 0 ? plural(totals.rental, "de aluguel", "de aluguel") : null, totals.standalone > 0 ? plural(totals.standalone, "avulsa", "avulsas") : null, totals.orphaned > 0 ? plural(totals.orphaned, "desvinculada", "desvinculadas") : null].filter(Boolean).join(" · ") || "nenhuma"}
                        onClick={() => onViewChange("todas")}
                    />
                    <Item
                        icon={<Zap className="h-3.5 w-3.5" />} tone="text-blue-600" label="Consumo do mês"
                        value={totals.withBills > 0 ? kwh(totals.consumptionLatest) : "—"}
                        hint={totals.withBills > 0 ? `${plural(totals.withBills, "unidade com fatura", "unidades com fatura")} · 12 meses: ${kwh(totals.consumption12)}` : "importe a conta de luz de cada unidade"}
                        title="Consumo da rede na fatura mais recente de cada unidade"
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone={totals.overdue > 0 ? "text-rose-600" : totals.dueSoon > 0 ? "text-amber-600" : "text-emerald-600"} label="Faturas do mês"
                        value={totals.withBills > 0 ? brl(totals.billsLatest) : "—"}
                        hint={billsHint}
                        valueTone={totals.overdue > 0 ? "text-rose-600" : undefined}
                        title="Valor a pagar na fatura mais recente de cada unidade"
                    />
                    <Item
                        icon={<Sparkles className="h-3.5 w-3.5" />} tone="text-amber-600" label="Economia solar"
                        value={totals.savingsLatest > 0 ? brl(totals.savingsLatest) : "—"}
                        hint={totals.savings12 > 0 ? `12 meses: ${brl(totals.savings12)}` : "o que a compensação abateu das faturas"}
                        valueTone={totals.savingsLatest > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
                        title="Energia compensada creditada na fatura mais recente de cada unidade"
                    />
                    <Item
                        icon={<BatteryCharging className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Saldo de créditos"
                        value={totals.balanceKwh > 0 ? kwh(totals.balanceKwh) : "—"}
                        hint={totals.unitsWithBalance > 0 ? `em ${plural(totals.unitsWithBalance, "unidade", "unidades")} · válidos por 60 meses` : "nenhum crédito acumulado"}
                        valueTone={totals.balanceKwh > 0 ? "text-emerald-700 dark:text-emerald-400" : undefined}
                        title="Saldo atual de geração junto à concessionária, somado"
                    />
                    <Item
                        icon={<Sun className="h-3.5 w-3.5" />} tone="text-amber-500" label="Energia injetada"
                        value={totals.injectedLatest > 0 ? kwh(totals.injectedLatest) : "—"}
                        hint={totals.injected12 > 0 ? `12 meses: ${kwh(totals.injected12)} · ${plural(totals.solarUnits, "unidade com geração", "unidades com geração")}` : totals.solarUnits > 0 ? plural(totals.solarUnits, "unidade com geração", "unidades com geração") : "nenhuma geração nas faturas"}
                        title="Energia gerada e enviada à rede na fatura mais recente de cada unidade"
                    />
                </div>
            )}

            {attention.length > 0 && (
                <section className="rounded-xl border border-border/80 bg-card">
                    <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <AlertCircle className="h-4 w-4 text-amber-600" /> Atenção
                            <span className="text-xs font-normal text-muted-foreground">({attention.length})</span>
                        </h2>
                        {attention.length > 4 && (
                            <button type="button" onClick={() => setAllAttention(v => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                {allAttention ? <>menos <ChevronUp className="h-3.5 w-3.5" /></> : <>ver todos <ChevronDown className="h-3.5 w-3.5" /></>}
                            </button>
                        )}
                    </header>
                    <ul className="divide-y divide-border/50">
                        {shownAttention.map((item, i) => (
                            <li key={`${item.kind}-${item.row.unit.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => onOpen(item.row)} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.row.unit.name}</button>
                                    <span className="text-muted-foreground"> — {item.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {error && (
                <p className="flex items-start gap-2 text-sm text-rose-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
            )}

            {rows.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais unidades mostrar">
                        {ENERGY_VIEWS.map(v => (
                            <button
                                key={v.key}
                                type="button"
                                role="tab"
                                aria-selected={view === v.key}
                                onClick={() => onViewChange(v.key)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    view === v.key
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : "border-border bg-background text-muted-foreground hover:border-emerald-300 hover:text-foreground"
                                )}
                            >
                                {v.label} ({counts[v.key]})
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-9 pl-9" placeholder="Buscar por nome, UC, endereço ou concessionária…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {distributors.length > 1 && (
                                <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={distributor} onChange={e => setDistributor(e.target.value)} aria-label="Concessionária">
                                    <option value="">Todas as concessionárias</option>
                                    {distributors.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            )}
                            {filtered && (
                                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDistributor(""); }}>
                                    <X className="mr-1 h-4 w-4" /> Limpar
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Zap className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhuma unidade ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Os imóveis de aluguel entram aqui sozinhos; cadastre uma UC avulsa para a sua casa, a de um parente ou uma unidade beneficiária. Em cada unidade, envie a conta de luz e a IA lê consumo, injeção, saldo e 13 meses de histórico.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Link href={`/${lang}/imoveis`}><Button variant="outline"><Building2 className="mr-1 h-4 w-4" /> Cadastrar imóvel de aluguel</Button></Link>
                        <Button onClick={onAddUc}><Plus className="mr-1 h-4 w-4" /> Adicionar UC avulsa</Button>
                    </div>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhuma unidade com esses filtros." : viewMeta.empty}</p>
                    {view !== "todas" && (
                        <button type="button" onClick={() => onViewChange("todas")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todas as {counts.todas} unidades
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <EnergyUnitCard
                            key={row.unit.id}
                            row={row}
                            lang={lang}
                            onSelect={() => onOpen(row)}
                            onDelete={e => { e.stopPropagation(); onDelete(row); }}
                            onViewPdf={e => { e.stopPropagation(); onViewPdf(row); }}
                            isDeleting={deletingId === row.unit.id}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Em cada unidade, envie a conta de luz: a IA lê consumo, energia injetada, saldo de créditos e os 13 meses de histórico impressos na fatura.
                </p>
            )}
        </div>
    );
}
