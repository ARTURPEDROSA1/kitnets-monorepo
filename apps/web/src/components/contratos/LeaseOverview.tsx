"use client";

/**
 * The contract at a glance, drawn rather than listed: what the tenant pays each month and what it is
 * made of, how far the term has run, what the contract adds up to (what came in against what is still
 * to come), the adjustment's cycle in one card, what was received and the deposit.
 */
import React from "react";
import { ArrowRight, Banknote, BarChart3, CalendarClock, CalendarDays, Hourglass, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/privacy";
import { formatDateBR } from "@/lib/dates";
import { brl, type LeaseIncome, type LeaseRow } from "@/lib/lease-dashboard";
import { CHARGE_INDEX_LABELS, RESPONSIBILITY_LABELS, amountOf, chargeName, type ChargeAdjustment } from "@/lib/lease-charges";
import type { LeaseTermTotals, TermSplit } from "@/lib/lease-term";
import type { LeaseCharge, LeaseWithDetails } from "@/types/lease";

interface Props {
    lease: LeaseWithDetails;
    row: LeaseRow;
    rent: number;
    /** rent + the tenant's fixed charges */
    monthly: number;
    /** the property's own charge: condomínio for a multi-unit property, energia for a house */
    featured: { label: string; charge: LeaseCharge | null };
    tenantFixed: { items: LeaseCharge[]; total: number };
    term: LeaseTermTotals;
    /** the charge readjusted next to the rent: "Condomínio", or "Energia" in a contract without a condominium (a house) */
    chargeLabel: string;
    chargeAdjustment: ChargeAdjustment | null;
    /** whether that charge's index has a series here: says why it has no figure */
    chargeSeries: "ok" | "none" | "unavailable";
    income: LeaseIncome;
    today: string;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
/** Why a cycle has no figure yet: its first month has not closed, or that month's index is not out. */
const waitingText = (firstClosing: string | null, today: string) =>
    firstClosing && today < firstClosing ? `Começa a contar em ${formatDateBR(firstClosing)}, quando fecha o 1º mês do ciclo` : "Índice do 1º mês do ciclo ainda não divulgado";

/** The rent first, then each charge: the colours of the monthly bar and its legend. */
const PART_COLORS = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-400", "bg-slate-400"];
/** One colour per subject, so the cards are told apart at a glance; "previsto" is the same colour, hatched. */
const hatch = (rgb: string): React.CSSProperties => ({ backgroundImage: `repeating-linear-gradient(135deg, rgba(${rgb},0.55) 0 5px, rgba(${rgb},0.18) 5px 10px)` });
const TONES = {
    emerald: { solid: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", icon: "text-emerald-600 dark:text-emerald-400", hatch: hatch("16,185,129") },
    sky: { solid: "bg-sky-500", text: "text-sky-700 dark:text-sky-400", icon: "text-sky-600 dark:text-sky-400", hatch: hatch("14,165,233") },
    violet: { solid: "bg-violet-500", text: "text-violet-700 dark:text-violet-400", icon: "text-violet-600 dark:text-violet-400", hatch: hatch("139,92,246") },
    indigo: { solid: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-400", icon: "text-indigo-600 dark:text-indigo-400", hatch: hatch("99,102,241") },
    amber: { solid: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600 dark:text-amber-400", hatch: hatch("245,158,11") },
    teal: { solid: "bg-teal-500", text: "text-teal-700 dark:text-teal-400", icon: "text-teal-600 dark:text-teal-400", hatch: hatch("20,184,166") },
} as const;
type Tone = keyof typeof TONES;
const NEUTRAL_HATCH = hatch("100,116,139");

function Panel({ icon, title, tone, aside, className, children }: { icon: React.ReactNode; title: string; tone: Tone; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <div className={cn("flex min-w-0 flex-col rounded-xl border border-border/80 bg-muted/20 p-4", className)}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span className={TONES[tone].icon}>{icon}</span>{title}</h3>
                {aside}
            </div>
            {children}
        </div>
    );
}

/** A circle that fills with the share given, its content in the middle. */
function Ring({ progress, label, stroke, children }: { progress: number; label: string; stroke: string; children: React.ReactNode }) {
    const radius = 40, length = 2 * Math.PI * radius, share = Math.min(1, Math.max(0, progress));
    return (
        <div className="relative h-28 w-28 shrink-0" role="img" aria-label={label}>
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-muted" />
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${length * share} ${length}`} className={stroke} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
        </div>
    );
}

/** One line of "No contrato inteiro": the bar of what came in against what is still to come, and the total. */
function SplitRow({ name, split, known, tone, strong }: { name: string; split: TermSplit; known: boolean; tone: Tone; strong?: boolean }) {
    const t = TONES[tone];
    const share = split.total > 0 ? Math.round((split.realized / split.total) * 100) : 0;
    return (
        <div className={cn("grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_9rem] sm:items-center", strong && "border-t border-border/60 pt-3")}>
            <span className={cn("inline-flex items-center gap-2 text-sm text-foreground", strong ? "font-bold" : "font-medium")}><span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", t.solid)} />{name}</span>
            <div className="min-w-0">
                {known && (
                    <div className={cn("flex overflow-hidden rounded-full bg-muted", strong ? "h-3.5" : "h-2.5")} role="img" aria-label={`${name}: ${share}% realizado`}>
                        <div className={t.solid} style={{ width: `${share}%` }} />
                        <div className="flex-1" style={t.hatch} />
                    </div>
                )}
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px]">
                    <span className={cn("font-medium", t.text)}>Realizado <Money>{brl(split.realized)}</Money>{known ? ` · ${share}%` : ""}</span>
                    {known && <span className="italic text-muted-foreground">Previsto <Money>{brl(split.forecast)}</Money></span>}
                </div>
            </div>
            <span className={cn("tabular-nums text-foreground sm:text-right", strong ? "text-base font-bold" : "text-sm font-semibold")}>{known ? <Money>{brl(split.total)}</Money> : "—"}</span>
        </div>
    );
}

/** A label over its value, for the adjustment card's facts. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm leading-snug text-foreground">{children}</dd>
        </div>
    );
}

export default function LeaseOverview({ lease, row, rent, monthly, featured, tenantFixed, term, chargeLabel, chargeAdjustment, chargeSeries, income, today }: Props) {
    const { summary } = row;
    const agencyManaged = lease.management_type === "AGENCY";
    const adjusts = summary.nextAdjustmentDate !== null;
    const cycleKnown = summary.accumulatedPct !== null && summary.monthsCounted > 0;
    const endTone = !row.inForce ? "" : summary.daysLeft !== null && summary.daysLeft < 0 ? "bad" : summary.daysLeft !== null && summary.daysLeft <= 90 ? "warn" : "";

    // the monthly bar: the rent, then each fixed charge the tenant pays
    const parts = [
        { key: "rent", label: agencyManaged ? "Aluguel bruto" : "Aluguel", amount: rent, hint: agencyManaged ? "antes da taxa da imobiliária" : null },
        ...tenantFixed.items.map(c => ({
            key: c.id,
            label: chargeName(c),
            amount: amountOf(c),
            hint: c.adjusts_with_rent ? "reajusta com o aluguel" : c.adjustment_index ? `reajuste: ${CHARGE_INDEX_LABELS[c.adjustment_index] ?? c.adjustment_index}` : null,
        })),
    ].filter(p => p.amount > 0);
    // the property's own charge when it is not one of the tenant's amounts: said in words under the bar
    const featuredOutside = featured.charge && !tenantFixed.items.some(c => c.id === featured.charge!.id) ? featured.charge : null;

    // the cycle's progress: the months counted, the one in course by its days
    const cycleShare = adjusts && summary.frequencyMonths > 0 ? (summary.monthsCounted + summary.daysCounted / 30) / summary.frequencyMonths : 0;
    const sameIndex = chargeAdjustment !== null && chargeAdjustment.accumulatedPct !== null && cycleKnown && chargeAdjustment.accumulatedPct === summary.accumulatedPct;
    const paidShare = term.months > 0 ? Math.min(1, income.confirmedMonths / term.months) : 0;

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
            {/* What leaves the tenant's pocket each month, and what it is made of */}
            <Panel tone="emerald" icon={<Wallet className="h-3.5 w-3.5" />} title="O inquilino paga por mês" className="md:col-span-2 xl:col-span-7">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                    <p className="text-3xl font-bold leading-none tabular-nums text-foreground">
                        <Money>{brl(monthly)}</Money>
                        <span className="ml-1 text-sm font-medium text-muted-foreground">/ mês</span>
                    </p>
                    <div className="text-xs text-muted-foreground sm:text-right">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-medium text-foreground">
                            <CalendarDays className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Vence todo dia {lease.rent_due_day}
                        </span>
                        <span className="mt-1 block">
                            {row.inForce ? <>Próximo: {formatDateBR(summary.nextDueDate)} · {summary.daysToDue === 0 ? "vence hoje" : `em ${plural(summary.daysToDue, "dia", "dias")}`}</> : "Contrato encerrado"}
                        </span>
                    </div>
                </div>

                {monthly > 0 && (
                    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Composição do valor mensal">
                        {parts.map((p, i) => <div key={p.key} className={PART_COLORS[Math.min(i, PART_COLORS.length - 1)]} style={{ width: `${(p.amount / monthly) * 100}%` }} />)}
                    </div>
                )}
                <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                    {parts.map((p, i) => (
                        <li key={p.key} className="flex items-start gap-2">
                            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", PART_COLORS[Math.min(i, PART_COLORS.length - 1)])} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-medium text-foreground">{p.label}</span>
                                    <span className="text-sm font-semibold tabular-nums text-foreground"><Money>{brl(p.amount)}</Money></span>
                                </span>
                                {p.hint && <span className="block text-[11px] text-muted-foreground">{p.hint}</span>}
                            </span>
                        </li>
                    ))}
                </ul>
                {featuredOutside && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        {featured.label}: {amountOf(featuredOutside) > 0 ? <Money>{brl(amountOf(featuredOutside))}</Money> : "sem valor fixo"} · {(RESPONSIBILITY_LABELS[featuredOutside.responsibility] ?? featuredOutside.responsibility).toLowerCase()}
                    </p>
                )}
            </Panel>

            {/* How far the term has run */}
            <Panel tone="indigo" icon={<Hourglass className="h-3.5 w-3.5" />} title="Prazo do contrato" className="md:col-span-2 xl:col-span-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Início</span>
                        <span className="text-base sm:text-lg font-bold tabular-nums text-foreground">{formatDateBR(lease.start_date)}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="text-right">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fim</span>
                        <span className={cn("text-base sm:text-lg font-bold tabular-nums", endTone === "bad" ? "text-rose-600 dark:text-rose-400" : endTone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                            {summary.effectiveEnd ? formatDateBR(summary.effectiveEnd) : "Indeterminado"}
                        </span>
                    </div>
                </div>
                {summary.progressPct !== null ? (
                    <>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${summary.progressPct}% do prazo decorrido`}>
                            <div className={cn("h-full rounded-full", endTone === "bad" ? "bg-rose-500" : endTone === "warn" ? "bg-amber-500" : "bg-indigo-500")} style={{ width: `${summary.progressPct}%` }} />
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                            <span>Há {plural(summary.daysElapsed, "dia", "dias")}</span>
                            <span className={cn("text-sm font-bold", endTone ? "text-foreground" : TONES.indigo.text)}>{summary.progressPct}%</span>
                            <span>
                                {!row.inForce ? (lease.status === "TERMINATED" ? `Rescindido em ${formatDateBR(lease.termination_date)}` : "Encerrado")
                                    : summary.daysLeft === null ? "" : summary.daysLeft < 0 ? `Vencido há ${plural(-summary.daysLeft, "dia", "dias")}` : summary.daysLeft === 0 ? "Termina hoje" : `Faltam ${plural(summary.daysLeft, "dia", "dias")}`}
                            </span>
                        </div>
                    </>
                ) : (
                    <p className="mt-4 text-xs text-muted-foreground">Prazo indeterminado · há {plural(summary.daysElapsed, "dia", "dias")}</p>
                )}
                {row.termMonths !== null && <p className="mt-auto pt-3 text-xs text-muted-foreground">Contrato de <strong className="font-semibold text-foreground">{row.termMonths} meses</strong></p>}
            </Panel>

            {/* What the contract adds up to: what came in against what is still to come */}
            <Panel
                tone="violet"
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                title={`No contrato inteiro${row.termMonths !== null ? ` · ${row.termMonths} meses` : ""}`}
                className="md:col-span-2 xl:col-span-12"
                aside={(
                    <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-slate-500" /> Realizado (já recebido)</span>
                        {term.forecastKnown && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={NEUTRAL_HATCH} /> Previsto (a receber)</span>}
                    </span>
                )}
            >
                <div className="space-y-3">
                    <SplitRow tone="emerald" name={agencyManaged ? "Aluguel bruto" : "Aluguel"} split={term.rent} known={term.forecastKnown} />
                    {term.condo && <SplitRow tone="sky" name="Condomínio" split={term.condo} known={term.forecastKnown} />}
                    {/* the colour it has in the monthly bar: the second part there, unless the condominium took it */}
                    {term.energy && <SplitRow tone={term.condo ? "amber" : "sky"} name="Energia" split={term.energy} known={term.forecastKnown} />}
                    <SplitRow tone="violet" name="Total" split={term.total} known={term.forecastKnown} strong />
                </div>
                {!term.forecastKnown && <p className="mt-2 text-[11px] text-muted-foreground">Prazo indeterminado: sem previsto, só o que já foi recebido.</p>}
            </Panel>

            {/* The adjustment, in one card: the index, when, and what the cycle has accumulated */}
            <Panel tone="amber" icon={<TrendingUp className="h-3.5 w-3.5" />} title="Reajuste" className="md:col-span-2 xl:col-span-6">
                {!adjusts ? (
                    <p className="text-sm text-muted-foreground">Contrato sem reajuste.</p>
                ) : (
                    <div className="flex flex-wrap items-center gap-5">
                        <div className="flex flex-col items-center gap-1">
                            <Ring stroke="stroke-amber-500" progress={cycleShare} label={`${summary.monthsCounted} de ${summary.frequencyMonths} meses do ciclo`}>
                                <span className={cn("text-lg font-bold leading-none tabular-nums", !cycleKnown ? "text-muted-foreground" : summary.accumulatedPct! < 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")}>
                                    {cycleKnown ? pctText(summary.accumulatedPct!) : "—"}
                                </span>
                                <span className="mt-1 text-[10px] leading-none text-muted-foreground">acumulado</span>
                            </Ring>
                            <span className="text-[11px] font-medium text-muted-foreground">{summary.monthsCounted} de {summary.frequencyMonths} meses</span>
                        </div>
                        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                            <Fact label="Índice">
                                <strong className="font-bold">{row.indexLabel}</strong> <span className="text-muted-foreground">· a cada {summary.frequencyMonths} meses</span>
                            </Fact>
                            <Fact label="Próximo reajuste">
                                {row.notice ? (
                                    <span className="text-xs text-orange-700 dark:text-orange-300">Nenhum: aviso de desocupação{row.notice.noticeDate ? ` em ${formatDateBR(row.notice.noticeDate)}` : ""}</span>
                                ) : row.inForce ? (
                                    <>
                                        <strong className={cn("inline-flex items-center gap-1 font-bold tabular-nums", summary.daysToAdjustment !== null && summary.daysToAdjustment <= 30 && "text-rose-600 dark:text-rose-400")}>
                                            <CalendarClock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> {formatDateBR(summary.nextAdjustmentDate)}
                                        </strong>
                                        {summary.daysToAdjustment !== null && <span className="text-muted-foreground"> · em {plural(summary.daysToAdjustment, "dia", "dias")}</span>}
                                    </>
                                ) : "Contrato encerrado"}
                            </Fact>
                            <Fact label="Acumulado no ciclo">
                                {cycleKnown ? (
                                    <>
                                        <span className="flex flex-wrap gap-1.5">
                                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                                {sameIndex ? `Aluguel e ${chargeLabel.toLowerCase()}` : "Aluguel"} {pctText(summary.accumulatedPct!)}
                                            </span>
                                            {!sameIndex && chargeAdjustment && chargeAdjustment.accumulatedPct !== null && (
                                                <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                                                    {chargeLabel} {pctText(chargeAdjustment.accumulatedPct)} <span className="font-normal">({chargeAdjustment.indexLabel})</span>
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-1 block text-[11px] text-muted-foreground">{formatDateBR(summary.cycleStart)} a {formatDateBR(summary.indexThroughDate)}</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {!row.seriesCode ? "Índice sem série no Kitnets: o percentual vem do aditivo" : summary.accumulatedPct !== null ? waitingText(summary.firstClosingDate, today) : "Série do índice indisponível no momento"}
                                    </span>
                                )}
                            </Fact>
                            <Fact label={chargeLabel}>
                                <span className="text-xs text-muted-foreground">
                                    {chargeAdjustment
                                        ? chargeAdjustment.withRent ? "Reajusta com o aluguel" : chargeSeries === "ok" ? `Reajusta pelo ${chargeAdjustment.indexLabel}, na data do contrato` : chargeSeries === "none" ? `${chargeAdjustment.indexLabel}: índice sem série no Kitnets` : "Série do índice indisponível no momento"
                                        : lease.charges.some(c => c.charge_type === "CONDOMINIUM" || c.charge_type === "ELECTRICITY") ? "Não reajusta por índice" : `Contrato sem ${chargeLabel.toLowerCase()}`}
                                </span>
                            </Fact>
                        </dl>
                        {/* every month of the cycle is published: the figure the adjustment is made by */}
                        {row.inForce && summary.closingPct !== null && summary.closingRent !== null && (
                            <p className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                Índice do ciclo fechado: <strong>{pctText(summary.closingPct)}</strong> → aluguel de <strong><Money>{brl(summary.closingRent)}</Money></strong> a partir de {formatDateBR(summary.nextAdjustmentDate)}.
                            </p>
                        )}
                    </div>
                )}
            </Panel>

            {/* What reached the owner */}
            <Panel tone="teal" icon={<Banknote className="h-3.5 w-3.5" />} title={agencyManaged ? "Recebido (líquido)" : "Recebido"} className="xl:col-span-3">
                <p className="text-2xl font-bold leading-none tabular-nums text-foreground">{income.confirmedMonths > 0 ? <Money>{brl(income.received)}</Money> : "—"}</p>
                {income.confirmedMonths > 0 ? (
                    <>
                        {term.forecastKnown && (
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${income.confirmedMonths} meses confirmados`}>
                                <div className="h-full rounded-full bg-teal-500" style={{ width: `${paidShare * 100}%` }} />
                            </div>
                        )}
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            {plural(income.confirmedMonths, "mês confirmado", "meses confirmados")}{term.forecastKnown && row.termMonths !== null ? ` de ${row.termMonths}` : ""}
                            {income.expectedMonths > 0 ? ` · ${income.expectedMonths} previsto${income.expectedMonths === 1 ? "" : "s"}` : ""}
                        </p>
                        {agencyManaged && <p className="text-[11px] text-muted-foreground">Depois da taxa da imobiliária</p>}
                    </>
                ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Sem lançamentos na razão de receitas do imóvel</p>
                )}
                {income.missingMonths > 0 && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">{plural(income.missingMonths, "mês vencido", "meses vencidos")} sem lançamento</p>
                )}
            </Panel>

            {/* The deposit, and who holds it */}
            <Panel tone="sky" icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Caução" className="xl:col-span-3">
                <p className="text-2xl font-bold leading-none tabular-nums text-foreground">{lease.security_deposit ? <Money>{brl(Number(lease.security_deposit))}</Money> : "—"}</p>
                {lease.security_deposit ? (
                    <>
                        {lease.deposit_months ? <p className="mt-2 text-xs text-muted-foreground">{plural(lease.deposit_months, "aluguel", "aluguéis")}</p> : null}
                        {/* an agency-managed lease leaves the deposit in the agency's custody, as the contract says */}
                        <p className="mt-1 text-[11px] text-muted-foreground">{agencyManaged ? "Sob custódia da imobiliária, por contrato" : "Devolvida no fim do contrato"}</p>
                    </>
                ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Sem caução informada</p>
                )}
            </Panel>
        </div>
    );
}
