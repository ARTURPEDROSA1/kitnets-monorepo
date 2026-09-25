"use client";

/**
 * The Água hub: every rental property whose main water meter the landlord pays, with what the newest
 * bills add up to (consumption, amounts due, the cost per m³), what deserves a look (overdue or
 * imminent bills, properties without a recent bill, consumption spikes, bills kept without their
 * PDF), then one card each with the water utility's logo as the cover.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building2, ChevronDown, ChevronUp, DollarSign, Droplets, FileText, Gauge, Search, Sparkles, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/lease-extract";
import { WATER_VIEWS, inWaterView, waterAttention, waterHubTotals, type WaterUnitRow, type WaterView } from "@/lib/water-hub";
import WaterUnitCard from "./WaterUnitCard";

interface Props {
    lang: string;
    rows: WaterUnitRow[];
    view: WaterView;
    onViewChange: (view: WaterView) => void;
    onOpen: (row: WaterUnitRow) => void;
    onViewPdf: (row: WaterUnitRow) => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const brl = (v: number, digits = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
const m3 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m³`;

function Item({ icon, label, value, hint, tone, valueTone, onClick, title }: { icon: React.ReactNode; label: string; value: string; hint: React.ReactNode; tone: string; valueTone?: string; onClick?: () => void; title?: string }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={title}
            className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border border-border/80 bg-card px-4 py-3 text-left", onClick && "cursor-pointer transition-colors hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500")}
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

export default function WaterHub({ lang, rows, view, onViewChange, onOpen, onViewPdf }: Props) {
    const [search, setSearch] = useState("");
    const [city, setCity] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => waterHubTotals(rows), [rows]);
    const attention = useMemo(() => waterAttention(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(WATER_VIEWS.map(v => [v.key, rows.filter(r => inWaterView(r.hasBills, v.key)).length])) as Record<WaterView, number>, [rows]);
    const cities = useMemo(() => [...new Set(rows.map(r => r.place).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

    const visible = useMemo(() => {
        const q = normalizeText(search);
        return rows.filter(r => {
            if (!inWaterView(r.hasBills, view)) return false;
            if (city && r.place !== city) return false;
            if (q && !r.haystack.includes(q)) return false;
            return true;
        });
    }, [rows, view, city, search]);

    const filtered = Boolean(search || city);
    const viewMeta = WATER_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);
    const billsHint = totals.overdue > 0
        ? `${plural(totals.overdue, "vencida", "vencidas")}${totals.dueSoon > 0 ? ` · ${plural(totals.dueSoon, "vence", "vencem")} em 7 dias` : ""}`
        : totals.dueSoon > 0
            ? `${plural(totals.dueSoon, "vence", "vencem")} em até 7 dias`
            : totals.paid12 > 0 ? `12 meses: ${brl(totals.paid12)}` : "contas mais recentes de cada imóvel";

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Droplets className="h-6 w-6 text-blue-600" /> Água
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        As contas de água dos imóveis cujo hidrômetro principal você paga: consumo, valor, custo por m³ e a conta vigente em PDF.
                    </p>
                </div>
                <Link href={`/${lang}/imoveis`}>
                    <Button variant="outline"><Building2 className="mr-1 h-4 w-4" /> Meus imóveis</Button>
                </Link>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<Building2 className="h-3.5 w-3.5" />} tone="text-blue-600" label="Imóveis com água"
                        value={String(totals.units)}
                        hint={totals.withBills > 0 ? `${plural(totals.withBills, "com contas importadas", "com contas importadas")}` : "nenhuma conta importada ainda"}
                        onClick={() => onViewChange("todos")}
                    />
                    <Item
                        icon={<Droplets className="h-3.5 w-3.5" />} tone="text-blue-600" label="Consumo do mês"
                        value={totals.withBills > 0 ? m3(totals.consumptionLatest) : "—"}
                        hint={totals.consumption12 > 0 ? `12 meses: ${m3(totals.consumption12)}` : "consumo da conta mais recente de cada imóvel"}
                        title="Consumo medido na conta mais recente de cada imóvel"
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone={totals.overdue > 0 ? "text-rose-600" : totals.dueSoon > 0 ? "text-amber-600" : "text-emerald-600"} label="Contas do mês"
                        value={totals.withBills > 0 ? brl(totals.billsLatest) : "—"}
                        hint={billsHint}
                        valueTone={totals.overdue > 0 ? "text-rose-600" : undefined}
                        title="Valor a pagar na conta mais recente de cada imóvel"
                    />
                    <Item
                        icon={<Gauge className="h-3.5 w-3.5" />} tone="text-violet-600" label="Custo por m³"
                        value={totals.rateLatest != null ? `R$ ${totals.rateLatest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                        hint={totals.rate12 != null ? `12 meses: R$ ${totals.rate12.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m³` : "valor ÷ consumo das contas do mês"}
                        title="Valor pago dividido pelo consumo, nas contas mais recentes"
                    />
                    <Item
                        icon={<Sparkles className="h-3.5 w-3.5" />} tone={totals.spikes > 0 ? "text-amber-600" : "text-emerald-600"} label="Picos de consumo"
                        value={String(totals.spikes)}
                        hint={totals.spikes > 0 ? "acima de 30% da média de 12 meses: confira vazamentos" : totals.stale > 0 ? `${plural(totals.stale, "imóvel sem conta recente", "imóveis sem conta recente")}` : "nenhum consumo fora do padrão"}
                        valueTone={totals.spikes > 0 ? "text-amber-600" : undefined}
                    />
                    <Item
                        icon={<FileText className="h-3.5 w-3.5" />} tone="text-blue-600" label="PDF da conta vigente"
                        value={`${totals.withPdf} de ${totals.units}`}
                        hint={totals.withLogo > 0 ? `${plural(totals.withLogo, "logo de concessionária lido", "logos de concessionária lidos")}` : "envie o PDF: o logo da concessionária vira a capa"}
                        title="Imóveis com o PDF da conta vigente guardado"
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

            {rows.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais imóveis mostrar">
                        {WATER_VIEWS.map(v => (
                            <button
                                key={v.key}
                                type="button"
                                role="tab"
                                aria-selected={view === v.key}
                                onClick={() => onViewChange(v.key)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    view === v.key
                                        ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                                        : "border-border bg-background text-muted-foreground hover:border-blue-300 hover:text-foreground"
                                )}
                            >
                                {v.label} ({counts[v.key]})
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-9 pl-9" placeholder="Buscar por nome, ligação, hidrômetro ou endereço…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {cities.length > 1 && (
                                <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={city} onChange={e => setCity(e.target.value)} aria-label="Cidade">
                                    <option value="">Todas as cidades</option>
                                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            )}
                            {filtered && (
                                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCity(""); }}>
                                    <X className="mr-1 h-4 w-4" /> Limpar
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Droplets className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum imóvel com água principal</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Em Imóveis → Dados do Imóvel, marque <span className="font-semibold text-foreground">Água</span> em &quot;Medidores Principais do Imóvel&quot; para o imóvel aparecer aqui com as contas da concessionária.
                    </p>
                    <Link href={`/${lang}/imoveis`}><Button variant="outline"><Building2 className="mr-1 h-4 w-4" /> Ir para Imóveis</Button></Link>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhum imóvel com esses filtros." : viewMeta.empty}</p>
                    {view !== "todos" && (
                        <button type="button" onClick={() => onViewChange("todos")} className="text-sm text-blue-700 underline underline-offset-2 dark:text-blue-400">
                            Ver todos os {counts.todos} imóveis
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <WaterUnitCard
                            key={row.unit.id}
                            row={row}
                            lang={lang}
                            onSelect={() => onOpen(row)}
                            onViewPdf={e => { e.stopPropagation(); onViewPdf(row); }}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                    Em cada imóvel, envie a conta da concessionária: a IA lê consumo, tarifas e vencimento, o PDF fica guardado como conta vigente e o logo do cabeçalho vira a capa do card.
                </p>
            )}
        </div>
    );
}
