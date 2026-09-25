"use client";

/**
 * The Condomínio hub: every condominium the owner runs, with what the newest months add up to
 * (condominium charged, costs, result), the year to date, the months whose costs were never entered,
 * what deserves a look, then one card each with the property's photos as the cover.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Building, ChevronDown, ChevronUp, DollarSign, Loader2, Percent, Plus, Receipt, Search, Sparkles, Sun, TrendingUp, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/lease-extract";
import { CONDO_VIEWS, condoAttention, condoHubTotals, inCondoView, type CondoRow, type CondoView } from "@/lib/condominium-hub";
import CondominiumSquareCard from "./CondominiumSquareCard";

interface Props {
    rows: CondoRow[];
    loading: boolean;
    error: string | null;
    view: CondoView;
    onViewChange: (view: CondoView) => void;
    onOpen: (row: CondoRow) => void;
    onDelete: (row: CondoRow) => void;
    deletingId: string | null;
    onNew: () => void;
    /** properties with units and no condominium yet: what "Novo condomínio" can pick */
    availableCount: number | null;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const brl = (v: number, digits = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });

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

export default function CondominioHub({ rows, loading, error, view, onViewChange, onOpen, onDelete, deletingId, onNew, availableCount }: Props) {
    const [search, setSearch] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => condoHubTotals(rows), [rows]);
    const attention = useMemo(() => condoAttention(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(CONDO_VIEWS.map(v => [v.key, rows.filter(r => inCondoView(r.ytdResult, v.key)).length])) as Record<CondoView, number>, [rows]);

    const visible = useMemo(() => {
        const q = normalizeText(search);
        return rows.filter(r => inCondoView(r.ytdResult, view) && (!q || r.haystack.includes(q)));
    }, [rows, view, search]);

    const viewMeta = CONDO_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);
    const newDisabled = availableCount === null || availableCount === 0;

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Building className="h-6 w-6 text-emerald-600" /> Condomínio
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Cada imóvel com várias unidades tem o seu condomínio, um centro de custos: a receita é o condomínio cobrado das unidades em Receitas de Aluguel; os custos (energia das áreas comuns, internet, água, IPTU, manutenção) entram aqui.
                    </p>
                </div>
                <Button
                    onClick={onNew}
                    disabled={newDisabled}
                    title={availableCount === 0 ? "Todo imóvel com unidades já tem o seu condomínio. Cadastre as unidades de um imóvel em Imóveis para criar outro." : undefined}
                >
                    <Plus className="mr-1 h-4 w-4" /> Novo condomínio
                </Button>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<Building className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Condomínios"
                        value={String(totals.condos)}
                        hint={`${plural(totals.units, "unidade", "unidades")}${totals.solarPayback > 0 ? ` · ${plural(totals.solarPayback, "conta como retorno solar", "contam como retorno solar")}` : ""}`}
                        onClick={() => onViewChange("todos")}
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Receita do mês"
                        value={totals.revenueLatest > 0 ? brl(totals.revenueLatest) : "—"}
                        hint={totals.revenueYtd > 0 ? `${totals.year}: ${brl(totals.revenueYtd)}` : "condomínio cobrado das unidades no mês mais recente"}
                        title="Condomínio cobrado das unidades no mês mais recente de cada condomínio (Receitas de Aluguel)"
                    />
                    <Item
                        icon={<Receipt className="h-3.5 w-3.5" />} tone="text-rose-600" label="Custos do mês"
                        value={totals.costLatest > 0 ? brl(totals.costLatest) : "—"}
                        hint={totals.costYtd > 0 ? `${totals.year}: ${brl(totals.costYtd)}` : "energia, internet, água, IPTU e manutenção"}
                        title="Custos do mês mais recente de cada condomínio"
                    />
                    <Item
                        icon={<TrendingUp className="h-3.5 w-3.5" />} tone={totals.resultLatest < 0 ? "text-rose-600" : "text-blue-600"} label="Resultado do mês"
                        value={totals.revenueLatest > 0 || totals.costLatest > 0 ? brl(totals.resultLatest) : "—"}
                        hint={totals.negativeCondos > 0 ? `${plural(totals.negativeCondos, "condomínio no vermelho", "condomínios no vermelho")} no ano` : "receita − custos"}
                        valueTone={totals.resultLatest < 0 ? "text-rose-600" : undefined}
                    />
                    <Item
                        icon={<Percent className="h-3.5 w-3.5" />} tone={totals.resultYtd < 0 ? "text-rose-600" : "text-violet-600"} label={`Resultado ${totals.year}`}
                        value={totals.revenueYtd > 0 || totals.costYtd > 0 ? brl(totals.resultYtd) : "—"}
                        hint={totals.marginYtd !== null ? `margem ${totals.marginYtd.toLocaleString("pt-BR")}% da receita` : "resultado ÷ receita"}
                        valueTone={totals.resultYtd < 0 ? "text-rose-600" : undefined}
                        title="Receita menos custos de todos os condomínios no ano até aqui"
                    />
                    <Item
                        icon={<Sparkles className="h-3.5 w-3.5" />} tone={totals.monthsWithoutCosts > 0 ? "text-amber-600" : "text-emerald-600"} label="Custos a lançar"
                        value={String(totals.monthsWithoutCosts)}
                        hint={totals.monthsWithoutCosts > 0 ? `meses de ${totals.year} com receita e sem custos` : `todos os meses de ${totals.year} com custos lançados`}
                        valueTone={totals.monthsWithoutCosts > 0 ? "text-amber-600" : undefined}
                        title="Meses do ano em que alguma unidade pagou condomínio mas nenhum custo foi lançado"
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
                            <li key={`${item.kind}-${item.row.condo.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => onOpen(item.row)} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.row.condo.name}</button>
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
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais condomínios mostrar">
                        {CONDO_VIEWS.map(v => (
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
                            <Input className="h-9 pl-9" placeholder="Buscar por condomínio, imóvel ou endereço…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        {search && (
                            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                                <X className="mr-1 h-4 w-4" /> Limpar
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Building className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum condomínio ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {availableCount && availableCount > 0
                            ? "Clique em “Novo condomínio” e escolha o imóvel com unidades cujo condomínio você administra. As fotos do imóvel viram a capa do card."
                            : "O condomínio existe para imóveis com várias unidades (kitnets, apartamentos). Cadastre as unidades do imóvel em Imóveis; depois volte aqui e crie o condomínio dele."}
                    </p>
                    <Button onClick={onNew} disabled={newDisabled}><Plus className="mr-1 h-4 w-4" /> Novo condomínio</Button>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{search ? "Nenhum condomínio com essa busca." : viewMeta.empty}</p>
                    {view !== "todos" && (
                        <button type="button" onClick={() => onViewChange("todos")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todos os {counts.todos} condomínios
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <CondominiumSquareCard
                            key={row.condo.id}
                            row={row}
                            onSelect={() => onOpen(row)}
                            onDelete={e => { e.stopPropagation(); onDelete(row); }}
                            isDeleting={deletingId === row.condo.id}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    Energia, água e IPTU entram nos custos sozinhos, das faturas e do registro de tributos de cada imóvel; internet e manutenção você lança no condomínio.
                </p>
            )}
        </div>
    );
}
