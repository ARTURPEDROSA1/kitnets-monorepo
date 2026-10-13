"use client";

/**
 * The dashboard answers one question first: did this month's rent come in? A four-part strip (due, in,
 * ahead, overdue) over the month's rents, shown as a board (a spreadsheet in due-date order) or as a
 * calendar; beside it the month's bills and instalments, the contract dates ahead and the result of the
 * last closed month; under it the portfolio. Receipts posted since the last visit stay lit for this visit.
 * It only reads: everything opens in its own hub. The maths is lib/dashboard-hub.ts; this file renders.
 * A figure whose loader failed reads "—" and says so, never zero.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, HelpCircle, Home, Rows3, Wallet } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money } from "@/components/privacy";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/lease-dashboard";
import { addMonths } from "@/lib/energy-hub";
import {
    contractDates, contractedRent, freshRentIds, isEmptyPortfolio, latestConfirmedMonth, leaseRowsOf, monthOutflows, monthRents, monthResult, occupancyOf, rentTotals,
    type MonthEvent, type MonthResult, type RentTotals,
} from "@/lib/dashboard-hub";
import type { DashboardLoader, DashboardView } from "@/lib/dashboard-views";
import RentBoard from "./RentBoard";
import RentCalendar, { EVENT_META } from "./RentCalendar";
import { INK } from "./ink";

export type BoardMode = "quadro" | "calendario";

interface Props {
    /** "" for Portuguese, "/en" | "/es" otherwise */
    base: string;
    view: DashboardView | null;
    today: string;
    /** `YYYY-MM` shown */
    month: string;
    /** the months that can be shown, oldest first */
    months: string[];
    onMonth: (month: string) => void;
    mode: BoardMode;
    onMode: (mode: BoardMode) => void;
    /** what the previous visit had seen (`seen:dashboard`); null on a first visit or before it loads */
    seenAt: string | null;
    loading: boolean;
    error: string | null;
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthName = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m;
const monthLong = (m: string) => `${monthName(m)} de ${m.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pct1 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const ddmm = (d: string) => formatDateBR(d).slice(0, 5);
const hatch = (rgb: string): React.CSSProperties => ({ backgroundImage: `repeating-linear-gradient(135deg, rgba(${rgb},0.7) 0 4px, rgba(${rgb},0.25) 4px 8px)` });

const LOADER_LABELS: Record<DashboardLoader, string> = {
    properties: "imóveis", income: "receitas", leases: "contratos", tenants: "inquilinos", energy: "energia", water: "água", projects: "projetos", taxes: "tributos", invoices: "faturas",
};

// ── The strip ────────────────────────────────────────────────────────

function Segment({ dot, label, figure, tone, children }: { dot: string; label: string; figure: React.ReactNode; tone?: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0 px-4 py-3 sm:px-5">
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} /> {label}
            </span>
            <span className={cn("mt-1 block truncate text-xl font-bold leading-tight tabular-nums sm:text-2xl", tone ?? "text-foreground")}>{figure}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground sm:truncate">{children}</span>
        </div>
    );
}

function MonthStrip({ totals, month, unavailable }: { totals: RentTotals | null; month: string; unavailable: string | null }) {
    if (!totals) {
        return (
            <section className="rounded-xl border border-border/80 bg-card px-5 py-4">
                <p className={cn("flex items-start gap-2 text-sm", INK.late)}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {unavailable}</p>
            </section>
        );
    }
    const { expected, received, pending, overdue } = totals;
    const parts = received.gross + pending.amount + overdue.amount;
    const share = (v: number) => (parts > 0 ? `${(v / parts) * 100}%` : "0%");
    const receivedPct = expected.amount > 0 ? Math.round((received.gross / expected.amount) * 100) : null;
    return (
        <section aria-label={`O dinheiro de ${monthName(month)}`} className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className="grid grid-cols-2 divide-border/60 md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border/60 md:[&>*:nth-child(-n+2)]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-border/60 md:[&>*:nth-child(odd)]:border-r-0">
                <Segment dot="bg-slate-400" label={`Esperado em ${monthName(month)}`} figure={<Money>{brl(expected.amount, 0)}</Money>}>
                    {plural(expected.count, "contrato", "contratos")} · aluguel de contrato
                </Segment>
                <Segment dot="bg-emerald-500" label="Recebido" tone={INK.in} figure={<Money>{brl(received.gross, 0)}</Money>}>
                    {received.count} de {expected.count}{received.net !== received.gross ? <> · líquido <Money>{brl(received.net, 0)}</Money></> : receivedPct !== null ? ` · ${receivedPct}% do esperado` : ""}
                </Segment>
                <Segment dot="bg-amber-400" label="A vencer" tone={pending.count > 0 ? INK.due : "text-muted-foreground"} figure={<Money>{brl(pending.amount, 0)}</Money>}>
                    {pending.count > 0 ? <>{plural(pending.count, "contrato", "contratos")} · próximo {ddmm(pending.next!)}</> : "nada a vencer no mês"}
                </Segment>
                <Segment dot="bg-rose-500" label="Vencido" tone={overdue.count > 0 ? INK.late : "text-muted-foreground"} figure={<Money>{brl(overdue.amount, 0)}</Money>}>
                    {overdue.count > 0 ? <>{plural(overdue.count, "contrato", "contratos")} · desde {ddmm(overdue.since!)}</> : "nenhum aluguel vencido"}
                </Segment>
            </div>
            <div
                role="img"
                aria-label={`${receivedPct ?? 0}% recebido, ${plural(pending.count, "aluguel", "aluguéis")} a vencer, ${plural(overdue.count, "vencido", "vencidos")}`}
                className="flex h-1.5 bg-muted"
            >
                <span className="bg-emerald-500 transition-[width] duration-300" style={{ width: share(received.gross) }} />
                <span className="bg-amber-400 transition-[width] duration-300" style={{ width: share(pending.amount) }} />
                <span className="bg-rose-500 transition-[width] duration-300" style={{ width: share(overdue.amount) }} />
            </div>
        </section>
    );
}

// ── The side column ──────────────────────────────────────────────────

function EventRow({ event, base }: { event: MonthEvent; base: string }) {
    const meta = EVENT_META[event.kind];
    const Icon = meta.icon;
    return (
        <li>
            <Link href={`${base}${event.href}`} className="group flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", meta.chip)}><Icon className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-snug text-foreground">{event.title}</span>
                    <span className={cn("block truncate text-xs leading-snug", event.late ? INK.late : "text-muted-foreground")}>
                        {[event.place, event.detail].filter(Boolean).join(" · ")}
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    {event.amount !== null && <span className="block text-[13px] font-semibold tabular-nums text-foreground"><Money>{brl(event.amount, 0)}</Money></span>}
                    {event.date && <span className={cn("block text-xs tabular-nums", event.late ? INK.late : "text-muted-foreground")}>{ddmm(event.date)}</span>}
                </span>
            </Link>
        </li>
    );
}

function SideCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-border/80 bg-card">
            <header className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3">
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                {aside && <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>}
            </header>
            <div className="px-2 pb-2">{children}</div>
        </section>
    );
}

/** One line of a card's legend: its dot and label, the amount on the right. */
function LegendRow({ dot, label, value, ink }: { dot: string; label: string; value: number; ink?: string }) {
    return (
        <span className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground"><span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} /> {label}</span>
            <strong className={cn("font-semibold tabular-nums", ink ?? "text-foreground")}><Money>{brl(value, 0)}</Money></strong>
        </span>
    );
}

/** A closed month: the result large, then one bar of the revenue split into the agencies' fee, the other costs and what was left. */
function ResultGraphic({ result }: { result: MonthResult }) {
    const other = Math.max(0, result.opex - result.fee);
    const left = Math.max(0, result.noi);
    const whole = result.fee + other + left;
    const w = (v: number) => (whole > 0 ? `${(v / whole) * 100}%` : "0%");
    return (
        <div className="space-y-2.5 px-2 pb-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-2xl font-bold tabular-nums", result.noi < 0 ? INK.late : "text-foreground")}><Money>{brl(result.noi, 0)}</Money></span>
                <span className="text-xs text-muted-foreground">resultado (NOI) · margem {pct1(result.margin)}</span>
            </span>
            <span role="img" aria-label={`Receita ${brl(result.revenue, 0)}: taxa ${brl(result.fee, 0)}, outros custos ${brl(other, 0)}, resultado ${brl(result.noi, 0)}`} className="privacy-money flex h-2.5 overflow-hidden rounded-full bg-muted">
                <span className="bg-violet-500" style={{ width: w(result.fee) }} />
                <span className="bg-slate-400" style={{ width: w(other) }} />
                <span className="bg-emerald-500" style={{ width: w(left) }} />
            </span>
            <span className="flex flex-col gap-1">
                <LegendRow dot="bg-violet-500" label="Taxa das imobiliárias" value={result.fee} ink={INK.fee} />
                <LegendRow dot="bg-slate-400" label="Outros custos" value={other} />
                <LegendRow dot="bg-emerald-500" label="Resultado" value={result.noi} ink={result.noi < 0 ? INK.late : undefined} />
            </span>
            <span className="block border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
                receita <Money>{brl(result.revenue, 0)}</Money> · {plural(result.properties, "imóvel lançado", "imóveis lançados")}
            </span>
        </div>
    );
}

// ── The portfolio ────────────────────────────────────────────────────

const MAX_UNIT_CELLS = 60;

function PortfolioCard({ tone, title, href, base, children }: { tone: "violet" | "emerald" | "teal"; title: string; href?: string; base: string; children: React.ReactNode }) {
    const tint = { violet: "border-violet-500/25 bg-violet-500/[0.05]", emerald: "border-emerald-500/25 bg-emerald-500/[0.05]", teal: "border-teal-500/25 bg-teal-500/[0.05]" }[tone];
    const body = (
        <>
            <span className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {href && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
            </span>
            {children}
        </>
    );
    const cls = cn("flex min-w-0 flex-col gap-3 rounded-xl border p-4 text-left", tint);
    return href
        ? <Link href={`${base}${href}`} className={cn(cls, "group transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500")}>{body}</Link>
        : <div className={cls}>{body}</div>;
}

function Portfolio({ view, base }: { view: DashboardView; base: string }) {
    const leasesDown = view.failed.includes("leases");
    const occupancy = occupancyOf(view.properties, view.leases ?? []);
    const rent = contractedRent(view.leases ?? []);
    const agency = rent.parts.find(p => p.type === "AGENCY")!;
    const own = rent.parts.find(p => p.type === "SELF_MANAGED")!;
    const agent = rent.parts.find(p => p.type === "AGENT")!;
    const cells = Math.min(occupancy.units, MAX_UNIT_CELLS);
    return (
        <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">A carteira</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <PortfolioCard tone="violet" title="Ocupação" href="/imoveis" base={base}>
                    {leasesDown ? <p className="text-sm text-muted-foreground">— contratos indisponíveis</p> : (
                        <>
                            <span className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold tabular-nums text-foreground">{occupancy.occupied} de {occupancy.units}</span>
                                <span className={cn("text-sm font-medium", INK.fee)}>{pct1(occupancy.pct)}</span>
                            </span>
                            {occupancy.units > 0 && occupancy.units <= MAX_UNIT_CELLS ? (
                                <span role="img" aria-label={`${occupancy.occupied} unidades ocupadas de ${occupancy.units}`} className="flex flex-wrap gap-1">
                                    {Array.from({ length: cells }, (_, i) => (
                                        <span key={i} className={cn("h-3.5 w-3.5 rounded-[3px]", i < occupancy.occupied ? "bg-violet-500" : "border border-dashed border-violet-400/70")} />
                                    ))}
                                </span>
                            ) : occupancy.units > 0 && (
                                <span className="flex h-2 overflow-hidden rounded-full bg-violet-500/15"><span className="bg-violet-500" style={{ width: `${occupancy.pct ?? 0}%` }} /></span>
                            )}
                            <span className="text-xs text-muted-foreground">
                                unidades com contrato em vigor{view.housed !== null ? ` · ${plural(view.housed, "pessoa abrigada", "pessoas abrigadas")}` : ""}
                            </span>
                        </>
                    )}
                </PortfolioCard>
                <PortfolioCard tone="emerald" title="Aluguel contratado" href="/contratos" base={base}>
                    {leasesDown ? <p className="text-sm text-muted-foreground">— contratos indisponíveis</p> : (
                        <>
                            <span className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold tabular-nums text-foreground"><Money>{brl(rent.total, 0)}</Money></span>
                                <span className="text-xs font-medium text-muted-foreground">/mês</span>
                            </span>
                            <span role="img" aria-label={`${agency.count} via imobiliária, ${own.count} de gestão própria${agent.count ? `, ${agent.count} via corretor` : ""}`} className="flex h-2 overflow-hidden rounded-full bg-muted">
                                {rent.total > 0 && <>
                                    <span className="bg-emerald-500" style={{ width: `${(agency.amount / rent.total) * 100}%` }} />
                                    <span className="bg-emerald-300 dark:bg-emerald-700" style={{ width: `${(own.amount / rent.total) * 100}%` }} />
                                    <span style={{ width: `${(agent.amount / rent.total) * 100}%`, ...hatch("16,185,129") }} />
                                </>}
                            </span>
                            <span className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Imobiliária <strong className="font-semibold text-foreground">{agency.count}</strong></span>
                                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300 dark:bg-emerald-700" /> Gestão própria <strong className="font-semibold text-foreground">{own.count}</strong></span>
                                {agent.count > 0 && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={hatch("16,185,129")} /> Corretor <strong className="font-semibold text-foreground">{agent.count}</strong></span>}
                                <span className="col-span-2"><Money>{brl(rent.total * 12, 0)}</Money> por ano · {plural(rent.count, "contrato em vigor", "contratos em vigor")}</span>
                            </span>
                        </>
                    )}
                </PortfolioCard>
                <PortfolioCard tone="teal" title="Economia potencial com autogestão" base={base}>
                    {view.ledger ? (
                        <>
                            <span className="text-2xl font-bold tabular-nums text-foreground"><Money>{brl(view.ledger.feeAllTime, 0)}</Money></span>
                            <span className="flex h-2 overflow-hidden rounded-full bg-teal-500/15" role="img" aria-label="Os últimos 12 meses dentro do total">
                                <span className="bg-teal-500" style={{ width: `${view.ledger.feeAllTime > 0 ? (view.ledger.fee12m / view.ledger.feeAllTime) * 100 : 0}%` }} />
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-teal-500" /> <strong className="font-semibold text-foreground"><Money>{brl(view.ledger.fee12m, 0)}</Money></strong> nos últimos 12 meses
                            </span>
                        </>
                    ) : <p className="text-sm text-muted-foreground">— receitas indisponíveis</p>}
                </PortfolioCard>
            </div>
        </section>
    );
}

// ── Loading ──────────────────────────────────────────────────────────

function Skeleton() {
    const bar = "animate-pulse rounded-md bg-muted";
    return (
        <div className="space-y-5" aria-busy="true" aria-label="Carregando o painel">
            <div className="h-24 animate-pulse rounded-xl border border-border/60 bg-card" />
            <div className="grid grid-cols-1 gap-4 min-[85rem]:grid-cols-[minmax(0,1fr)_272px]">
                <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
                    {Array.from({ length: 8 }, (_, i) => <div key={i} className={cn(bar, "h-8")} style={{ opacity: 1 - i * 0.09 }} />)}
                </div>
                <div className="space-y-3">
                    <div className="h-40 animate-pulse rounded-xl border border-border/60 bg-card" />
                    <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-card" />
                </div>
            </div>
        </div>
    );
}

// ── The page ─────────────────────────────────────────────────────────

export default function DashboardHub({ base, view, today, month, months, onMonth, mode, onMode, seenAt, loading, error }: Props) {
    const [helpOpen, setHelpOpen] = useState(false);
    const current = today.slice(0, 7);
    const isCurrent = month === current;
    const failed = useMemo(() => new Set(view?.failed ?? []), [view]);
    const moneyDown = failed.has("leases") ? "Não foi possível carregar os contratos: os aluguéis do mês ficam sem números. Recarregue a página." : failed.has("income") ? "Não foi possível carregar a razão de receitas: não dá para saber o que entrou. Recarregue a página." : null;

    const rents = useMemo(() => (view && !moneyDown ? monthRents(view, month, today) : []), [view, month, today, moneyDown]);
    const totals = useMemo(() => (view && !moneyDown ? rentTotals(rents) : null), [view, rents, moneyDown]);
    const fresh = useMemo(() => freshRentIds(rents, seenAt), [rents, seenAt]);
    const leaseRows = useMemo(() => (view ? leaseRowsOf(view, today) : []), [view, today]);
    const outflows = useMemo(() => (view ? monthOutflows(view, month, today) : []), [view, month, today]);
    // this month: the dates of the next 60 days; a past month: its own
    const dates = useMemo(() => contractDates(leaseRows, isCurrent ? today : `${month}-01`, isCurrent ? addDays(today, 60) : `${month}-31`), [leaseRows, isCurrent, today, month]);
    const monthDates = useMemo(() => contractDates(leaseRows, `${month}-01`, `${month}-31`), [leaseRows, month]);
    // the result card: the month shown once it closed, else the one before it
    const resultMonth = isCurrent ? addMonths(month, -1) : month;
    const result = useMemo(() => (view ? monthResult(view, resultMonth) : null), [view, resultMonth]);
    const lastPosted = view ? latestConfirmedMonth(view) : null;
    const ledgerBehind = isCurrent && rents.length > 0 && (lastPosted === null || lastPosted < addMonths(current, -1));

    const at = months.indexOf(month);
    const prev = at > 0 ? months[at - 1] : null;
    const next = at >= 0 && at < months.length - 1 ? months[at + 1] : null;
    const title = month.slice(0, 4) === current.slice(0, 4) ? `Aluguéis de ${monthName(month)}` : `Aluguéis de ${monthLong(month)}`;

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            {/* Header: the month, how to see it */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                        <span className="inline-flex items-center gap-0.5">
                            <button type="button" onClick={() => prev && onMonth(prev)} disabled={!prev} aria-label={prev ? `Ver ${monthLong(prev)}` : "Sem meses anteriores"} className="rounded-md border border-border/80 bg-card p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => next && onMonth(next)} disabled={!next} aria-label={next ? `Ver ${monthLong(next)}` : "Este é o mês atual"} className="rounded-md border border-border/80 bg-card p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {isCurrent ? `Hoje, ${ddmm(today)}` : <>Mês encerrado · <button type="button" onClick={() => onMonth(current)} className={cn("rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", INK.in)}>voltar para {monthName(current)}</button></>}
                        {fresh.size > 0 && <> · <span className={cn("font-semibold", INK.in)}>{plural(fresh.size, "recebimento novo", "recebimentos novos")}</span> desde a sua última visita</>}
                    </p>
                </div>
                {view && !moneyDown && (
                    <div className="flex items-center gap-1.5">
                        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Como mostrar os aluguéis">
                            <button type="button" onClick={() => onMode("quadro")} aria-pressed={mode === "quadro"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", mode === "quadro" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <Rows3 className="h-3.5 w-3.5" /> Quadro
                            </button>
                            <button type="button" onClick={() => onMode("calendario")} aria-pressed={mode === "calendario"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", mode === "calendario" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                                <CalendarDays className="h-3.5 w-3.5" /> Calendário
                            </button>
                        </div>
                        <button type="button" onClick={() => setHelpOpen(true)} title="Como ler" aria-label="Como ler o painel" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                            <HelpCircle className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            {error && <p className={cn("flex items-start gap-2 text-sm", INK.late)}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
            {loading && <Skeleton />}

            {view && (isEmptyPortfolio(view) && view.failed.length === 0 ? (
                <section className="space-y-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <Home className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <h2 className="text-lg font-semibold text-foreground">Comece pela carteira</h2>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">Em Imóveis, cadastre um imóvel ou envie um contrato de locação: a IA cria o imóvel, o contrato, a imobiliária e os inquilinos. A partir daí este painel mostra, a cada mês, o aluguel que vence, o que entrou e o que está atrasado.</p>
                    <Button asChild><Link href={`${base}/imoveis`}>Ir para Imóveis <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
                </section>
            ) : (
                <>
                    <MonthStrip totals={totals} month={month} unavailable={moneyDown} />

                    {ledgerBehind && (
                        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-foreground">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <span>A razão de receitas tem lançamentos só até {lastPosted ? monthName(lastPosted) : "nenhum mês"}: o que não foi lançado aparece aqui como vencido. Lance os repasses na razão de cada imóvel, em <Link href={`${base}/imoveis`} className="font-semibold underline underline-offset-2">Imóveis</Link>.</span>
                        </p>
                    )}

                    <div className="grid grid-cols-1 items-start gap-4 min-[85rem]:grid-cols-[minmax(0,1fr)_272px]">
                        <div className="min-w-0">
                            {moneyDown ? null : rents.length === 0 ? (
                                <div className="space-y-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                                    <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
                                    <p className="text-sm font-medium text-foreground">Nenhum aluguel vence em {monthName(month)}.</p>
                                    <p className="mx-auto max-w-md text-xs text-muted-foreground">Um contrato só cobra a partir do mês seguinte ao início, e os encerrados param no fim. Os contratos ficam em <Link href={`${base}/contratos`} className="underline underline-offset-2">Contratos</Link>.</p>
                                </div>
                            ) : mode === "calendario" ? (
                                <RentCalendar month={month} today={today} rents={rents} events={[...outflows, ...monthDates].filter(e => e.date)} fresh={fresh} base={base} />
                            ) : (
                                <RentBoard rents={rents} fresh={fresh} today={today} base={base} />
                            )}
                        </div>

                        <aside className="grid min-w-0 grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3 min-[85rem]:grid-cols-1">
                            {isCurrent && (
                                <SideCard title="Contas e parcelas" aside={outflows.some(e => e.amount !== null) ? <Money>{brl(outflows.reduce((s, e) => s + (e.amount ?? 0), 0), 0)}</Money> : undefined}>
                                    {failed.has("energy") || failed.has("water") || failed.has("projects") ? (
                                        <p className={cn("px-2 py-2 text-xs", INK.late)}>— não foi possível carregar: {["energy", "water", "projects"].filter(f => failed.has(f as DashboardLoader)).map(f => LOADER_LABELS[f as DashboardLoader]).join(", ")}</p>
                                    ) : null}
                                    {outflows.length === 0 ? (
                                        <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma conta de energia ou água nem parcela de projeto vence em {monthName(month)}.</p>
                                    ) : (
                                        <ul>{outflows.map((e, i) => <EventRow key={`${e.href}-${i}`} event={e} base={base} />)}</ul>
                                    )}
                                </SideCard>
                            )}
                            <SideCard title="Datas dos contratos" aside={isCurrent ? "próximos 60 dias" : undefined}>
                                {dates.length === 0 ? (
                                    <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum reajuste nem término {isCurrent ? "nos próximos 60 dias" : `em ${monthName(month)}`}.</p>
                                ) : (
                                    <ul>{dates.map((e, i) => <EventRow key={`${e.href}-${e.kind}-${i}`} event={e} base={base} />)}</ul>
                                )}
                            </SideCard>
                            <SideCard title={`Resultado de ${monthName(resultMonth)}`}>
                                {result ? <ResultGraphic result={result} /> : (
                                    <p className="px-2 py-2 text-xs text-muted-foreground">— nenhum mês confirmado na razão de receitas em {monthName(resultMonth)}.</p>
                                )}
                            </SideCard>
                        </aside>
                    </div>

                    <Portfolio view={view} base={base} />

                    {view.failed.length > 0 && (
                        <p className={cn("flex items-start gap-2 text-xs", INK.late)}><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Não foi possível carregar: {view.failed.map(f => LOADER_LABELS[f]).join(", ")}. Recarregue a página; se persistir, o módulo em questão mostra o erro completo.</p>
                    )}
                </>
            ))}

            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader className="text-left sm:text-left">
                        <DialogTitle>Como ler o painel</DialogTitle>
                        <DialogDescription asChild>
                            <div className="space-y-3 text-sm text-muted-foreground">
                                <p><strong className="text-foreground">Esperado</strong>: o aluguel de contrato de cada contrato que vence no mês. O primeiro mês de um contrato não entra (o primeiro aluguel vence no mês seguinte), e um contrato encerrado para no fim.</p>
                                <p><strong className="text-foreground">Recebido</strong>: o que a razão de receitas do imóvel confirma no mês, antes da taxa da imobiliária (o líquido ao lado), ou a fatura paga.</p>
                                <p><strong className="text-foreground">Vencido</strong>: passou do vencimento e a razão não tem o recebimento. Pode ser atraso do inquilino ou um repasse ainda não lançado: lance-o na razão do imóvel, ou veja a fatura quando houver.</p>
                                <p><strong className="text-foreground">Novo</strong>: recebimento lançado desde a sua última visita. Fica destacado durante esta visita.</p>
                                <p><strong className="text-foreground">Economia potencial com autogestão</strong>: a taxa que as imobiliárias retiveram em todos os meses lançados na razão de receitas. É o que a gestão própria deixaria com você.</p>
                                <p>No quadro, clique no cabeçalho para ordenar e filtrar (botão direito: colunas) e selecione células para somar.</p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** `YYYY-MM-DD` + n days */
function addDays(date: string, n: number): string {
    return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
