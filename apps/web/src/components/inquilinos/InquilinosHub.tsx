"use client";

/**
 * The Inquilinos hub: who lives in the portfolio today at a glance — how many, what they pay,
 * how long they have stayed, whose birthday is near, what is missing (a contract, a phone) —
 * then what deserves a look, then one card per tenant. Former tenants are never thrown away:
 * they sit under "Antigos", with their contracts and contacts, as the history of each unit.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, Cake, CalendarClock, ChevronDown, ChevronUp, DollarSign, FileSignature, Loader2, Phone, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { TENANT_MANAGEMENT_LABELS, TENANT_VIEWS, brl, inTenantView, monthsLabel, tenantAttention, tenantHubTotals, type TenantRow, type TenantView } from "@/lib/tenant-dashboard";
import TenantSquareCard from "./TenantSquareCard";

interface Props {
    rows: TenantRow[];
    today: string;
    loading: boolean;
    error: string | null;
    view: TenantView;
    onViewChange: (view: TenantView) => void;
    onOpen: (row: TenantRow) => void;
    onDelete: (row: TenantRow) => void;
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

const DOT: Record<string, string> = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500", slate: "bg-slate-400" };

export default function InquilinosHub({ rows, today, loading, error, view, onViewChange, onOpen, onDelete, deletingId, onNew }: Props) {
    const [search, setSearch] = useState("");
    const [property, setProperty] = useState("");
    const [management, setManagement] = useState("");
    const [allAttention, setAllAttention] = useState(false);

    const totals = useMemo(() => tenantHubTotals(rows), [rows]);
    const attention = useMemo(() => tenantAttention(rows, today), [rows, today]);
    const counts = useMemo(() => Object.fromEntries(TENANT_VIEWS.map(v => [v.key, rows.filter(r => inTenantView(r.status, v.key)).length])) as Record<TenantView, number>, [rows]);

    const properties = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of rows) {
            const id = r.current?.property_id ?? r.tenant.property_id;
            const name = r.current?.property_name ?? r.tenant.property_name;
            if (id && name) map.set(id, name);
        }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const visible = useMemo(() => {
        const q = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return rows.filter(r => {
            if (!inTenantView(r.status, view)) return false;
            if (property && (r.current?.property_id ?? r.tenant.property_id) !== property) return false;
            if (management && r.tenant.management_type !== management) return false;
            if (q && !r.haystack.includes(q) && !r.tenant.cpf.includes(q.replace(/\D/g, "") || "\u0000")) return false;
            return true;
        });
    }, [rows, view, property, management, search]);

    const filtered = Boolean(search || property || management);
    const viewMeta = TENANT_VIEWS.find(v => v.key === view)!;
    const shownAttention = allAttention ? attention : attention.slice(0, 4);

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Users className="h-6 w-6 text-emerald-600" /> Inquilinos
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Quem mora nos seus imóveis, quem está chegando e quem já saiu: contato, contrato e tempo de casa de cada um.
                    </p>
                </div>
                <Button onClick={onNew}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar inquilino
                </Button>
            </div>

            {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Item
                        icon={<Users className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Inquilinos atuais"
                        value={String(totals.active)}
                        hint={<>{plural(totals.future, "futuro", "futuros")} · {plural(totals.former, "antigo", "antigos")}</>}
                        onClick={() => onViewChange("atuais")}
                    />
                    <Item
                        icon={<DollarSign className="h-3.5 w-3.5" />} tone="text-emerald-600" label="Aluguel dos atuais"
                        value={totals.rentCount > 0 ? `${brl(totals.rentTotal, 0)}/mês` : "—"}
                        hint={totals.rentCount > 0 ? <>{brl(totals.rentTotal * 12, 0)} por ano<br />{plural(totals.rentCount, "contrato em vigor", "contratos em vigor")}</> : "nenhum contrato em vigor"}
                        title="Soma do aluguel de contrato (bruto) dos contratos em vigor dos inquilinos atuais"
                    />
                    <Item
                        icon={<CalendarClock className="h-3.5 w-3.5" />} tone="text-violet-600" label="Tempo de casa"
                        value={totals.avgMonths !== null ? monthsLabel(totals.avgMonths) : "—"}
                        hint={totals.longest ? <>média dos atuais<br />mais antigo: {totals.longest.row.tenant.full_name.split(" ")[0]} · {monthsLabel(totals.longest.months)}</> : "informe as datas de entrada"}
                        onClick={totals.longest ? () => onOpen(totals.longest!.row) : undefined}
                    />
                    <Item
                        icon={<Cake className="h-3.5 w-3.5" />} tone="text-amber-600" label="Aniversários"
                        value={String(totals.birthdays30)}
                        hint={totals.birthdays30 > 0 ? "nos próximos 30 dias" : "nenhum nos próximos 30 dias"}
                    />
                    <Item
                        icon={<FileSignature className="h-3.5 w-3.5" />} tone={totals.withoutLease > 0 ? "text-amber-600" : "text-emerald-600"} label="Sem contrato"
                        value={String(totals.withoutLease)}
                        hint={totals.withoutLease > 0 ? "moram sem contrato em vigor cadastrado" : "todos os atuais com contrato"}
                        valueTone={totals.withoutLease > 0 ? "text-amber-600" : undefined}
                    />
                    <Item
                        icon={<Phone className="h-3.5 w-3.5" />} tone={totals.withoutPhone > 0 ? "text-amber-600" : "text-emerald-600"} label="Sem telefone"
                        value={String(totals.withoutPhone)}
                        hint={totals.withoutPhone > 0 ? "atuais ou futuros sem telefone" : "todos com telefone"}
                        valueTone={totals.withoutPhone > 0 ? "text-amber-600" : undefined}
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
                            <li key={`${item.kind}-${item.row.tenant.id}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[item.tone])} />
                                <span className="min-w-0 flex-1">
                                    <button type="button" onClick={() => onOpen(item.row)} className="font-semibold text-foreground underline-offset-2 hover:underline">{item.row.tenant.full_name}</button>
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

            {rows.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quais inquilinos mostrar">
                        {TENANT_VIEWS.map(v => (
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
                            <Input className="h-9 pl-9" placeholder="Buscar por nome, CPF, ocupação, imóvel ou imobiliária…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={property} onChange={e => setProperty(e.target.value)} aria-label="Imóvel">
                                <option value="">Todos os imóveis</option>
                                {properties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                            <select className="flex h-9 rounded-md border bg-background px-3 text-sm" value={management} onChange={e => setManagement(e.target.value)} aria-label="Gestão">
                                <option value="">Todas as gestões</option>
                                {Object.entries(TENANT_MANAGEMENT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
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

            {loading && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            ) : rows.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Nenhum inquilino ainda</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        Cadastre quem mora nos seus imóveis — ou envie o contrato de locação em Contratos: a IA cadastra o inquilino a partir dele.
                    </p>
                    <Button onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Cadastrar o primeiro</Button>
                </div>
            ) : visible.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{filtered ? "Nenhum inquilino com esses filtros." : viewMeta.empty}</p>
                    {view !== "todos" && (
                        <button type="button" onClick={() => onViewChange("todos")} className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                            Ver todos os {counts.todos} inquilinos
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visible.map(row => (
                        <TenantSquareCard
                            key={row.tenant.id}
                            row={row}
                            onSelect={() => onOpen(row)}
                            onDelete={e => { e.stopPropagation(); onDelete(row); }}
                            isDeleting={deletingId === row.tenant.id}
                        />
                    ))}
                </div>
            )}

            {rows.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    Quem sai não é apagado: marque o inquilino como &ldquo;Antigo&rdquo; no painel dele e ele fica em Antigos, com os contratos e o contato.
                </p>
            )}
        </div>
    );
}
