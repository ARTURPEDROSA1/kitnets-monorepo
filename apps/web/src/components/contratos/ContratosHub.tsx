"use client";

/**
 * The Contratos hub: the portfolio of leases at a glance — how many are in force, who manages them
 * and whether their file is attached, what they bring in each month and over their terms (executed
 * and forecast), what ends or adjusts next, the deposits and who holds them — then what needs a
 * decision, then the contracts themselves as a table or on a calendar. The cards count what the tab,
 * the property, the management and the search show.
 * The tab (Vigentes · Vencendo · Encerrados · Rascunhos · Todos) lives in the URL; table or timeline is
 * remembered in the account (`view:contratos` in user_ui_preferences).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Archive, ChevronDown, ChevronUp, FileSignature, GanttChart, HelpCircle, List, Loader2, MousePointerClick, Plus, Search, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadAccountPreferences, readLocalPreference, saveAccountPreference, writeLocalPreference } from "@/lib/ui-preferences-client";
import { formatDateBR } from "@/lib/dates";
import { LEASE_VIEWS, MANAGEMENT_LABELS, attentionItems, contractGroups, hubTotals, inView, leaseManagers, matchesManager, type LeaseRow, type LeaseView } from "@/lib/lease-dashboard";
import type { PropertyKind } from "@/lib/lease-charges";
import ContratosKpis from "./ContratosKpis";
import LeaseTable, { type LeaseTableActions } from "./LeaseTable";
import LeaseTimeline from "./LeaseTimeline";
import { LeaseTitle } from "./LeaseTitle";

interface Props {
    rows: LeaseRow[];
    today: string;
    /** `properties.id` → single/multi: the table's charge column names the energy bill or the condominium (lib/lease-charges.ts) */
    propertyKinds?: Record<string, PropertyKind>;
    loading: boolean;
    error: string | null;
    view: LeaseView;
    onViewChange: (view: LeaseView) => void;
    actions: LeaseTableActions;
    onNew: () => void;
    /** the AI import of one or many contracts, current or old */
    onImport: () => void;
}

type Mode = "lista" | "linha";
/** Where table-or-timeline is remembered: `view:contratos` */
const VIEW_KEY = "contratos";
const isMode = (v: unknown): v is Mode => v === "lista" || v === "linha";

/**
 * Table or timeline. It opens on the table (what the server drew), then takes this device's copy and the
 * account's — unless the user already chose in this visit; a choice is saved to both.
 */
function useViewMode(): [Mode, (m: Mode) => void] {
    const [mode, setMode] = useState<Mode>("lista");
    const touched = useRef(false);
    useEffect(() => {
        let alive = true;
        const local = readLocalPreference("views", VIEW_KEY);
        void Promise.resolve(local)
            .then(v => { if (alive && !touched.current && isMode(v)) setMode(v); })
            .then(() => loadAccountPreferences())
            .then(all => {
                const remote = all.views[VIEW_KEY];
                if (isMode(remote)) {
                    if (alive && !touched.current) { setMode(remote); writeLocalPreference("views", VIEW_KEY, remote); }
                } else if (isMode(local)) {
                    // first time the account hears of it: the choice made on this device becomes the account's
                    saveAccountPreference("views", VIEW_KEY, local);
                }
            });
        return () => { alive = false; };
    }, []);
    const choose = (m: Mode) => {
        touched.current = true;
        setMode(m);
        writeLocalPreference("views", VIEW_KEY, m);
        saveAccountPreference("views", VIEW_KEY, m);
    };
    return [mode, choose];
}

const DOT: Record<string, string> = { rose: "bg-rose-500", amber: "bg-amber-500", sky: "bg-sky-500", slate: "bg-slate-400" };

export default function ContratosHub({ rows, today, propertyKinds = {}, loading, error, view, onViewChange, actions, onNew, onImport }: Props) {
    const [mode, setMode] = useViewMode();
    const [helpOpen, setHelpOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [property, setProperty] = useState("");
    const [management, setManagement] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const attention = useMemo(() => attentionItems(rows), [rows]);
    const counts = useMemo(() => Object.fromEntries(LEASE_VIEWS.map(v => [v.key, rows.filter(r => inView(r, v.key)).length])) as Record<LeaseView, number>, [rows]);

    const properties = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of rows) if (r.lease.property_name) map.set(r.lease.property_id, r.lease.property_name);
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const managers = useMemo(() => leaseManagers(rows), [rows]);
    const managerGroups = useMemo(() => ([
        { type: "AGENCY", label: "Imobiliárias", all: "Todas as imobiliárias" },
        { type: "AGENT", label: "Corretores", all: "Todos os corretores" },
    ] as const).map(g => ({ ...g, items: managers.filter(m => m.type === g.type) })).filter(g => g.items.length > 0), [managers]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (!inView(r, view)) return false;
            if (property && r.lease.property_id !== property) return false;
            if (!matchesManager(r.lease, management)) return false;
            if (q) {
                const hay = [r.title, r.place, r.lease.primary_tenant_name, r.lease.agency_name, r.lease.agent_name].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [rows, view, property, management, search]);

    const filtered = Boolean(search || property || management);
    // the cards count what is shown: the tab and the filters above the table
    const totals = useMemo(() => hubTotals(visible, today, { countAll: true }), [visible, today]);
    // in force, closed and drafts apart: the cards never add a closed contract to the ones running
    const groups = useMemo(() => contractGroups(visible, today), [visible, today]);
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
                    <Button variant="outline" onClick={onImport} title="Envie o PDF de um ou vários contratos, vigentes ou antigos: a IA lê cada um e o contrato é criado com o arquivo guardado">
                        <Archive className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Importar contrato</span>
                    </Button>
                    <Button onClick={onNew}>
                        <Plus className="mr-1 h-4 w-4" /> Novo Contrato
                    </Button>
                </div>
            </div>

            {/* KPI strip */}
            {rows.length > 0 && <ContratosKpis totals={totals} groups={groups} filtered={filtered} allCount={rows.length} onOpen={actions.onOpen} />}

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
                                    <button type="button" onClick={() => actions.onOpen(item.row)} className="font-semibold text-foreground hover:underline underline-offset-2"><LeaseTitle title={item.row.title} tenant={item.row.lease.primary_tenant_name} /></button>
                                    {/* the adjustment line carries the projected rent ("→ R$ …") once a month of the cycle is out */}
                                    <span className={cn("text-muted-foreground", item.kind === "adjustment" && item.row.summary.monthsCounted > 0 && item.row.summary.adjustedRent !== null && "privacy-money")}> — {item.text}</span>
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
                        <div className="flex items-center gap-1.5">
                        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Como mostrar">
                            <button type="button" onClick={() => setMode("lista")} aria-pressed={mode === "lista"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", mode === "lista" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <List className="h-3.5 w-3.5" /> Lista
                            </button>
                            <button type="button" onClick={() => setMode("linha")} aria-pressed={mode === "linha"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", mode === "linha" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <GanttChart className="h-3.5 w-3.5" /> Linha do tempo
                            </button>
                        </div>
                        <button type="button" onClick={() => setHelpOpen(true)} title="Como usar" aria-label="Como usar a lista de contratos" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                            <HelpCircle className="h-4 w-4" />
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
                            {/* gestão própria, then each agency and corretor by name; agency names run long, so the box is capped */}
                            <select className="flex h-9 max-w-[18rem] rounded-md border bg-background px-3 text-sm" value={management} onChange={e => setManagement(e.target.value)} aria-label="Gestão">
                                <option value="">Todas as gestões</option>
                                {managers.some(m => m.type === "SELF_MANAGED") && <option value="SELF_MANAGED">{MANAGEMENT_LABELS.SELF_MANAGED}</option>}
                                {managerGroups.map(g => (
                                    <optgroup key={g.type} label={g.label}>
                                        {g.items.length > 1 && <option value={g.type}>{g.all}</option>}
                                        {g.items.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                    </optgroup>
                                ))}
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
                        <Button variant="outline" onClick={onImport}><Archive className="mr-1 h-4 w-4" /> Importar contrato</Button>
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
                <LeaseTable rows={visible} actions={actions} propertyKinds={propertyKinds} />
            ) : (
                <LeaseTimeline rows={visible} today={today} onOpen={actions.onOpen} />
            )}

            {/* the "?" next to Lista | Linha do tempo: how the table works, where old contracts go */}
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader className="text-left sm:text-left">
                        <DialogTitle>Como usar</DialogTitle>
                        <DialogDescription asChild>
                            <div className="space-y-4 text-sm text-muted-foreground">
                                <div className="space-y-1.5">
                                    <p className="inline-flex items-center gap-1.5 font-semibold text-foreground"><MousePointerClick className="h-4 w-4 text-emerald-600" /> Na tabela</p>
                                    <ul className="list-disc space-y-1 pl-5">
                                        <li>Clique no cabeçalho para ordenar e filtrar (botão direito: colunas).</li>
                                        <li>Selecione células para somar.</li>
                                        <li>As setas movem entre as células.</li>
                                        <li>Ctrl+C copia.</li>
                                    </ul>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="inline-flex items-center gap-1.5 font-semibold text-foreground"><Archive className="h-4 w-4 text-amber-600" /> Contratos antigos</p>
                                    <p>Contratos vigentes ou antigos entram pelo &ldquo;Importar contrato&rdquo;: a IA lê o PDF, você confirma, e os que já terminaram ficam em Encerrados, com o PDF guardado. &ldquo;Novo Contrato&rdquo; é para digitar um contrato.</p>
                                </div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        </div>
    );
}
