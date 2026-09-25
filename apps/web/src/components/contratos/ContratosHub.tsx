"use client";

/**
 * The Contratos hub: the portfolio of leases at a glance — how many are in force and what they
 * bring in, what ends or adjusts next, the deposits held, which contracts still lack their file —
 * then what needs a decision, then the contracts themselves as a table or on a calendar.
 * The view (Vigentes · Vencendo · Encerrados · Rascunhos · Todos) lives in the URL.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Archive, CalendarClock, ChevronDown, ChevronUp, DollarSign, FileSignature, FileText, GanttChart, List, Loader2, PiggyBank, Plus, Search, TrendingUp, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { LEASE_VIEWS, MANAGEMENT_LABELS, attentionItems, brl, hubTotals, inView, type LeaseRow, type LeaseView } from "@/lib/lease-dashboard";
import LeaseTable, { type LeaseTableActions } from "./LeaseTable";
import LeaseTimeline from "./LeaseTimeline";

interface Props {
    rows: LeaseRow[];
    today: string;
    loading: boolean;
    error: string | null;
    view: LeaseView;
    onViewChange: (view: LeaseView) => void;
    actions: LeaseTableActions;
    onNew: () => void;
    onImportOld: () => void;
}

type Mode = "lista" | "linha";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function Item({ icon, label, value, hint, tone, valueTone, onClick, title }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: string; valueTone?: string; onClick?: () => void; title?: string }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={title}
            className={cn("min-w-0 space-y-0.5 rounded-xl border border-border/80 bg-card px-4 py-3 text-left", onClick && "cursor-pointer transition-colors hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500")}
        >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={tone}>{icon}</span>{label}
            </span>
            <span className={cn("block truncate text-xl font-bold", valueTone ?? "text-foreground")}>{value}</span>
            <span className="block truncate text-xs text-muted-foreground" title={hint}>{hint}</span>
        </Tag>
    );
}

const DOT: Record<string, string> = { rose: "bg-rose-500", amber: "bg-amber-500", sky: "bg-sky-500", slate: "bg-slate-400" };

export default function ContratosHub({ rows, today, loading, error, view, onViewChange, actions, onNew, onImportOld }: Props) {
    const [mode, setMode] = useState<Mode>("lista");
    const [search, setSearch] = useState("");
    const [property, setProperty] = useState("");
    const [management, setManagement] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => hubTotals(rows, today), [rows, today]);
    const attention = useMemo(() => attentionItems(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(LEASE_VIEWS.map(v => [v.key, rows.filter(r => inView(r, v.key)).length])) as Record<LeaseView, number>, [rows]);

    const properties = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of rows) if (r.lease.property_name) map.set(r.lease.property_id, r.lease.property_name);
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (!inView(r, view)) return false;
            if (property && r.lease.property_id !== property) return false;
            if (management && r.lease.management_type !== management) return false;
            if (q) {
                const hay = [r.title, r.place, r.lease.primary_tenant_name, r.lease.agency_name, r.lease.agent_name].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [rows, view, property, management, search]);

    const filtered = Boolean(search || property || management);
    const viewMeta = LEASE_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <FileSignature className="h-6 w-6 text-emerald-600" /> Contratos
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Os contratos de locação da carteira: o que está em vigor, o que vence, o que reajusta e os arquivos de cada um.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={onImportOld} title="Envie os PDFs de contratos anteriores: a IA lê cada um e registra o contrato no histórico">
                        <Archive className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Importar contratos antigos</span>
                    </Button>
                    <Button onClick={onNew}>
                        <Plus className="mr-1 h-4 w-4" /> Novo Contrato
                    </Button>
                </div>
            </div>

            {/* KPI strip */}
            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<FileSignature className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Contratos em vigor"
                        value={String(totals.inForce)}
                        hint={totals.overdueTerm > 0 ? `${plural(totals.overdueTerm, "com o prazo vencido", "com o prazo vencido")}` : totals.ending90 > 0 ? `${plural(totals.ending90, "vence", "vencem")} em 90 dias` : `${totals.total} no total · nenhum vencendo`}
                        valueTone={totals.overdueTerm > 0 ? "text-rose-600" : undefined}
                        onClick={() => onViewChange(totals.overdueTerm > 0 || totals.ending90 > 0 ? "vencendo" : "vigentes")}
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Aluguel contratado"
                        value={`${brl(totals.contractedRent, 0)}/mês`}
                        hint={`${brl(totals.contractedRent * 12, 0)} por ano · ${plural(totals.agencyManaged, "via imobiliária", "via imobiliária")}`}
                        title="Soma do aluguel de contrato dos contratos em vigor (valor bruto, antes da taxa da imobiliária)"
                    />
                    <Item
                        icon={<CalendarClock className="h-3.5 w-3.5" />} tone={totals.nextEnd && totals.nextEnd.days <= 90 ? "text-amber-600" : "text-slate-500"} label="Próximo término"
                        value={totals.nextEnd ? formatDateBR(totals.nextEnd.date) : "—"}
                        hint={totals.nextEnd ? `${totals.nextEnd.row.title} · em ${plural(totals.nextEnd.days, "dia", "dias")}` : totals.overdueTerm > 0 ? "só contratos com o prazo vencido" : "nenhum prazo a vencer"}
                        valueTone={totals.nextEnd && totals.nextEnd.days <= 90 ? "text-amber-600" : undefined}
                        onClick={totals.nextEnd ? () => actions.onOpen(totals.nextEnd!.row) : undefined}
                    />
                    <Item
                        icon={<TrendingUp className="h-3.5 w-3.5" />} tone="text-violet-600" label="Próximo reajuste"
                        value={totals.nextAdjustment ? formatDateBR(totals.nextAdjustment.date) : "—"}
                        hint={totals.nextAdjustment
                            ? `${totals.nextAdjustment.row.indexLabel}${totals.nextAdjustment.accumulatedPct !== null ? ` ${pctText(totals.nextAdjustment.accumulatedPct)} até agora` : ""} · ${totals.nextAdjustment.row.title}`
                            : "nenhum reajuste previsto"}
                        onClick={totals.nextAdjustment ? () => actions.onOpen(totals.nextAdjustment!.row) : undefined}
                    />
                    <Item
                        icon={<PiggyBank className="h-3.5 w-3.5" />} tone="text-blue-600" label="Caução em mãos"
                        value={brl(totals.deposits, 0)}
                        hint={totals.depositsCount > 0 ? `${totals.depositsCount} de ${totals.inForce} contratos com caução` : "nenhum contrato em vigor com caução"}
                        title="Soma das cauções dos contratos em vigor: dinheiro do inquilino que volta no fim do contrato"
                    />
                    <Item
                        icon={<FileText className="h-3.5 w-3.5" />} tone={totals.withFile < totals.total ? "text-amber-600" : "text-emerald-600"} label="Arquivos"
                        value={`${totals.withFile} de ${totals.total}`}
                        hint={totals.withFile < totals.total ? `${plural(totals.total - totals.withFile, "contrato sem o PDF", "contratos sem o PDF")} anexado` : "todos os contratos com o PDF anexado"}
                        valueTone={totals.withFile < totals.total ? "text-amber-600" : undefined}
                    />
                </div>
            )}

            {/* Attention */}
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
                            <li key={`${item.kind}-${item.row.lease.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => actions.onOpen(item.row)} className="font-semibold text-foreground hover:underline underline-offset-2">{item.row.title}</button>
                                    <span className="text-muted-foreground"> — {item.text}</span>
                                </span>
                                {item.date && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateBR(item.date)}</span>}
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

            {/* Views + filters */}
            {rows.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais contratos mostrar">
                            {LEASE_VIEWS.map(v => (
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
                        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Como mostrar">
                            <button type="button" onClick={() => setMode("lista")} aria-pressed={mode === "lista"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", mode === "lista" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <List className="h-3.5 w-3.5" /> Lista
                            </button>
                            <button type="button" onClick={() => setMode("linha")} aria-pressed={mode === "linha"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", mode === "linha" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <GanttChart className="h-3.5 w-3.5" /> Linha do tempo
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-9 pl-9" placeholder="Buscar por imóvel, inquilino, imobiliária ou referência…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={property} onChange={e => setProperty(e.target.value)} aria-label="Imóvel">
                                <option value="">Todos os imóveis</option>
                                {properties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                            <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={management} onChange={e => setManagement(e.target.value)} aria-label="Gestão">
                                <option value="">Todas as gestões</option>
                                {Object.entries(MANAGEMENT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                            </select>
                            {filtered && (
                                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setProperty(""); setManagement(""); }}>
                                    <X className="mr-1 h-4 w-4" /> Limpar
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Body */}
            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <FileSignature className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum contrato ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Envie o contrato de locação assinado: a IA lê as partes, o imóvel, os valores, o prazo e o reajuste, e a partir daí o painel acompanha vencimentos e reajustes.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Cadastrar o primeiro</Button>
                        <Button variant="outline" onClick={onImportOld}><Archive className="mr-1 h-4 w-4" /> Importar contratos antigos</Button>
                    </div>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhum contrato com esses filtros." : viewMeta.empty}</p>
                    {view !== "todos" && (
                        <button type="button" onClick={() => onViewChange("todos")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todos os {counts.todos} contratos
                        </button>
                    )}
                </div>
            ) : mode === "lista" ? (
                <LeaseTable rows={visible} actions={actions} />
            ) : (
                <LeaseTimeline rows={visible} today={today} onOpen={actions.onOpen} />
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Archive className="h-3.5 w-3.5" />
                    Contratos anteriores do mesmo imóvel entram pelo &ldquo;Importar contratos antigos&rdquo; e ficam em Encerrados, com o PDF guardado.
                </p>
            )}
        </div>
    );
}
