"use client";

/**
 * The Imobiliárias hub: who administers the account's contracts at a glance — how many agencies,
 * how many contracts in force they run and what that rent adds up to, what their fees cost every
 * month (the money self-management would keep), how many tenants they look after, how their
 * service agreements stand — then what deserves a look, then one card each.
 * A lease agreement can be imported here too: the AI reads it and creates the contract, the
 * tenants and the agency when they are not registered yet.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Building2, ChevronDown, ChevronUp, DollarSign, FileSignature, FileText, Loader2, Percent, Plus, Search, Sparkles, Users, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/lease-extract";
import { AGENCY_VIEWS, agencyAttention, agencyHubTotals, brl, inAgencyView, type AgencyRow, type AgencyView } from "@/lib/agency-dashboard";
import AgencySquareCard from "./AgencySquareCard";

interface Props {
    rows: AgencyRow[];
    loading: boolean;
    error: string | null;
    view: AgencyView;
    onViewChange: (view: AgencyView) => void;
    onOpen: (row: AgencyRow) => void;
    onDelete: (row: AgencyRow) => void;
    deletingId: string | null;
    onNew: () => void;
    onImport: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

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

export default function ImobiliariasHub({ rows, loading, error, view, onViewChange, onOpen, onDelete, deletingId, onNew, onImport }: Props) {
    const [search, setSearch] = useState("");
    const [city, setCity] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => agencyHubTotals(rows), [rows]);
    const attention = useMemo(() => agencyAttention(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(AGENCY_VIEWS.map(v => [v.key, rows.filter(r => inAgencyView(r.status, v.key)).length])) as Record<AgencyView, number>, [rows]);

    const cities = useMemo(() => {
        const set = new Set(rows.map(r => r.place).filter(Boolean));
        return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }, [rows]);

    const visible = useMemo(() => {
        const q = normalizeText(search);
        return rows.filter(r => {
            if (!inAgencyView(r.status, view)) return false;
            if (city && r.place !== city) return false;
            if (q && !r.haystack.includes(q)) return false;
            return true;
        });
    }, [rows, view, city, search]);

    const filtered = Boolean(search || city);
    const viewMeta = AGENCY_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);
    const agreementsHint = totals.agreementsExpired > 0
        ? `${plural(totals.agreementsExpired, "vencido", "vencidos")}${totals.agreementsExpiring > 0 ? ` · ${plural(totals.agreementsExpiring, "vencendo", "vencendo")}` : ""}`
        : totals.agreementsExpiring > 0
            ? `${plural(totals.agreementsExpiring, "vence", "vencem")} em até 90 dias`
            : totals.withAgreement > 0 ? "todos dentro da vigência" : "nenhum contrato anexado";

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Building2 className="h-6 w-6 text-emerald-600" /> Imobiliárias
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Quem administra os seus contratos: o que cada imobiliária responde, o que a taxa dela custa por mês e como falar com ela.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={onImport} title="A IA lê o contrato de locação e cria o contrato, os inquilinos e a imobiliária que ainda não estiverem cadastrados">
                        <Sparkles className="mr-1 h-4 w-4 text-amber-500" /> Importar contrato
                    </Button>
                    <Button onClick={onNew}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar imobiliária
                    </Button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<Building2 className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Imobiliárias ativas"
                        value={String(totals.active)}
                        hint={totals.inactive > 0 ? plural(totals.inactive, "em rascunho ou suspensa", "em rascunho ou suspensas") : "nenhuma suspensa"}
                        onClick={() => onViewChange("ativas")}
                    />
                    <Item
                        icon={<FileSignature className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Contratos em vigor"
                        value={String(totals.leasesInForce)}
                        hint={totals.leasesTotal > totals.leasesInForce ? `de ${plural(totals.leasesTotal, "contrato com imobiliária", "contratos com imobiliária")}` : totals.leasesInForce > 0 ? "administrados por imobiliária" : "nenhum contrato nomeia uma imobiliária"}
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Aluguel sob gestão"
                        value={totals.leasesInForce > 0 ? `${brl(totals.rentManaged, 0)}/mês` : "—"}
                        hint={totals.leasesInForce > 0 ? `${brl(totals.rentManaged * 12, 0)} por ano · valor de contrato` : "soma dos contratos em vigor com imobiliária"}
                        title="Soma do aluguel de contrato (bruto) dos contratos em vigor administrados por uma imobiliária"
                    />
                    <Item
                        icon={<Percent className="h-3.5 w-3.5" />} tone="text-amber-600" label="Taxas de administração"
                        value={totals.leasesInForce > 0 && totals.feeUnknownLeases < totals.leasesInForce ? `${brl(totals.monthlyFees, 0)}/mês` : "—"}
                        hint={totals.feeUnknownLeases > 0
                            ? `${plural(totals.feeUnknownLeases, "contrato sem taxa informada", "contratos sem taxa informada")}`
                            : totals.monthlyFees > 0 ? `${brl(totals.monthlyFees * 12, 0)} por ano: a economia potencial com autogestão` : "informe a taxa no cadastro de cada imobiliária"}
                        valueTone={totals.monthlyFees > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
                        title="Aluguel em vigor × taxa de administração de cada imobiliária: o que a gestão terceirizada custa por mês"
                    />
                    <Item
                        icon={<Users className="h-3.5 w-3.5" />} tone="text-violet-600" label="Inquilinos atendidos"
                        value={String(totals.tenantsServed)}
                        hint={totals.agentsLinked > 0 ? `${plural(totals.agentsLinked, "corretor vinculado", "corretores vinculados")}` : "morando hoje, com imobiliária"}
                    />
                    <Item
                        icon={<FileText className="h-3.5 w-3.5" />} tone={totals.agreementsExpired > 0 ? "text-rose-600" : totals.agreementsExpiring > 0 ? "text-amber-600" : "text-blue-600"} label="Prestação de serviços"
                        value={`${totals.withAgreement} de ${totals.total}`}
                        hint={agreementsHint}
                        valueTone={totals.agreementsExpired > 0 ? "text-rose-600" : totals.agreementsExpiring > 0 ? "text-amber-600" : undefined}
                        title="Imobiliárias com o contrato de prestação de serviços anexado"
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
                            <li key={`${item.kind}-${item.row.agency.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => onOpen(item.row)} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.row.displayName}</button>
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
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais imobiliárias mostrar">
                        {AGENCY_VIEWS.map(v => (
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
                            <Input className="h-9 pl-9" placeholder="Buscar por nome, CNPJ, CRECI, responsável, cidade, imóvel ou inquilino…" value={search} onChange={e => setSearch(e.target.value)} />
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

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Building2 className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhuma imobiliária ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Cadastre quem administra os seus contratos — ou envie um contrato de locação: a IA lê a imobiliária que o assina (com CNPJ, CRECI e logo) e cria o contrato, os inquilinos e a imobiliária de uma vez.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="outline" onClick={onImport}><Sparkles className="mr-1 h-4 w-4 text-amber-500" /> Importar contrato de locação</Button>
                        <Button onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Cadastrar a primeira</Button>
                    </div>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhuma imobiliária com esses filtros." : viewMeta.empty}</p>
                    {view !== "todas" && (
                        <button type="button" onClick={() => onViewChange("todas")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todas as {counts.todas} imobiliárias
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <AgencySquareCard
                            key={row.agency.id}
                            row={row}
                            onSelect={() => onOpen(row)}
                            onDelete={e => { e.stopPropagation(); onDelete(row); }}
                            isDeleting={deletingId === row.agency.id}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Ao enviar um contrato de locação — aqui ou em Contratos — a IA lê a imobiliária que o assina, com o logo do cabeçalho, e oferece cadastrá-la junto com o contrato e os inquilinos.
                </p>
            )}
        </div>
    );
}
