"use client";

/**
 * The Corretores hub: who runs the contracts at a glance — how many corretores, how many contracts
 * in force carry one and what that rent adds up to, how many tenants they look after, which
 * agencies they work for, who cannot be reached — then what deserves a look, then one card each.
 * Corretores also come in from the contracts: the AI import in Contratos reads the agency's
 * representative (or the autonomous broker) and offers to register them.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Building2, ChevronDown, ChevronUp, DollarSign, FileSignature, Loader2, Phone, Plus, Search, Sparkles, UserCheck, Users, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGENT_VIEWS, agentAttention, agentHubTotals, brl, inAgentView, type AgentRow, type AgentView } from "@/lib/agent-dashboard";
import AgentSquareCard from "./AgentSquareCard";

interface Props {
    rows: AgentRow[];
    loading: boolean;
    error: string | null;
    view: AgentView;
    onViewChange: (view: AgentView) => void;
    onOpen: (row: AgentRow) => void;
    onDelete: (row: AgentRow) => void;
    deletingId: string | null;
    onNew: () => void;
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

export default function CorretoresHub({ rows, loading, error, view, onViewChange, onOpen, onDelete, deletingId, onNew }: Props) {
    const [search, setSearch] = useState("");
    const [affiliation, setAffiliation] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => agentHubTotals(rows), [rows]);
    const attention = useMemo(() => agentAttention(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(AGENT_VIEWS.map(v => [v.key, rows.filter(r => inAgentView(r.status, v.key)).length])) as Record<AgentView, number>, [rows]);

    const affiliations = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of rows) {
            if (r.agent.agent_type === "AUTONOMO") map.set("__autonomo__", "Corretores autônomos");
            else if (r.agent.agency_id) map.set(r.agent.agency_id, r.agent.agency_name ?? "Imobiliária");
        }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const visible = useMemo(() => {
        const q = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return rows.filter(r => {
            if (!inAgentView(r.status, view)) return false;
            if (affiliation === "__autonomo__" && r.agent.agent_type !== "AUTONOMO") return false;
            if (affiliation && affiliation !== "__autonomo__" && r.agent.agency_id !== affiliation) return false;
            if (q && !r.haystack.includes(q)) return false;
            return true;
        });
    }, [rows, view, affiliation, search]);

    const filtered = Boolean(search || affiliation);
    const viewMeta = AGENT_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <UserCheck className="h-6 w-6 text-emerald-600" /> Corretores
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Quem intermedeia os seus contratos: os contratos que cada corretor responde, os inquilinos que atende e como falar com ele.
                    </p>
                </div>
                <Button onClick={onNew}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar corretor
                </Button>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<UserCheck className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Corretores ativos"
                        value={String(totals.active)}
                        hint={totals.inactive > 0 ? `${plural(totals.inactive, "inativo", "inativos")}` : "nenhum inativo"}
                        onClick={() => onViewChange("ativos")}
                    />
                    <Item
                        icon={<FileSignature className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Contratos em vigor"
                        value={String(totals.leasesInForce)}
                        hint={totals.leasesTotal > totals.leasesInForce ? `de ${plural(totals.leasesTotal, "contrato com corretor", "contratos com corretor")}` : totals.leasesInForce > 0 ? "com um corretor responsável" : "nenhum contrato nomeia um corretor"}
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Aluguel sob gestão"
                        value={totals.leasesInForce > 0 ? `${brl(totals.rentManaged, 0)}/mês` : "—"}
                        hint={totals.leasesInForce > 0 ? `${brl(totals.rentManaged * 12, 0)} por ano` : "soma dos contratos em vigor com corretor"}
                        title="Soma do aluguel de contrato (bruto) dos contratos em vigor que nomeiam um corretor"
                    />
                    <Item
                        icon={<Users className="h-3.5 w-3.5" />} tone="text-violet-600" label="Inquilinos atendidos"
                        value={String(totals.tenantsServed)}
                        hint="morando hoje, com corretor"
                    />
                    <Item
                        icon={<Building2 className="h-3.5 w-3.5" />} tone="text-blue-600" label="Imobiliárias"
                        value={String(totals.agencies)}
                        hint={totals.autonomous > 0 ? `${plural(totals.autonomous, "corretor autônomo", "corretores autônomos")}` : "nenhum corretor autônomo"}
                    />
                    <Item
                        icon={<Phone className="h-3.5 w-3.5" />} tone={totals.withoutContact > 0 ? "text-amber-600" : "text-emerald-600"} label="Sem contato"
                        value={String(totals.withoutContact)}
                        hint={totals.withoutContact > 0 ? "ativos sem telefone nem e-mail" : "todos com telefone ou e-mail"}
                        valueTone={totals.withoutContact > 0 ? "text-amber-600" : undefined}
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
                            <li key={`${item.kind}-${item.row.agent.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => onOpen(item.row)} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.row.agent.full_name}</button>
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
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais corretores mostrar">
                        {AGENT_VIEWS.map(v => (
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
                            <Input className="h-9 pl-9" placeholder="Buscar por nome, CRECI, imobiliária, imóvel ou inquilino…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={affiliation} onChange={e => setAffiliation(e.target.value)} aria-label="Atuação">
                                <option value="">Todas as atuações</option>
                                {affiliations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                            {filtered && (
                                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAffiliation(""); }}>
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
                    <UserCheck className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum corretor ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Cadastre quem intermedeia os seus contratos — ou envie o contrato de locação em Contratos: a IA lê o corretor (o representante da imobiliária, com o CRECI) e oferece cadastrá-lo.
                    </p>
                    <Button onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Cadastrar o primeiro</Button>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhum corretor com esses filtros." : viewMeta.empty}</p>
                    {view !== "todos" && (
                        <button type="button" onClick={() => onViewChange("todos")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todos os {counts.todos} corretores
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <AgentSquareCard
                            key={row.agent.id}
                            row={row}
                            onSelect={() => onOpen(row)}
                            onDelete={e => { e.stopPropagation(); onDelete(row); }}
                            isDeleting={deletingId === row.agent.id}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Ao enviar um contrato em Contratos, a IA lê o corretor que assina pela imobiliária (com o CRECI dele) ou o corretor autônomo e oferece cadastrá-lo aqui.
                </p>
            )}
        </div>
    );
}
