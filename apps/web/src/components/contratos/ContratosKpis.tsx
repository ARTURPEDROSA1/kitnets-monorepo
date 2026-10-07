"use client";

/**
 * The six cards on top of the Contratos hub. Each has its own colour — the colours of the contract's
 * dashboard (LeaseOverview): the rent emerald, the term indigo, the adjustment amber, the deposit sky,
 * plus violet for the contracts and teal for their total value — a big figure, and a bar wherever the
 * figure splits in parts (who manages the contracts, executed × forecast, who holds the deposits), with
 * its legend underneath. Only the cards about one contract (next end, next adjustment) open something:
 * that contract, with an arrow saying so.
 *
 * The tints are the tone at low opacity, so they sit on the light and on the dark theme alike.
 */
import React from "react";
import { AlertTriangle, Banknote, CalendarClock, ChevronRight, DollarSign, DoorOpen, FileCheck2, FileSignature, FileWarning, MapPin, PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueInDaysText, formatDateBR } from "@/lib/dates";
import { Money } from "@/components/privacy";
import { brl, type ContractGroup, type ContractGroupKey, type HubTotals, type LeaseRow } from "@/lib/lease-dashboard";

interface Props {
    /** the figures of the contracts shown (the hub's tab and filters): `hubTotals(…, { countAll: true })` */
    totals: HubTotals;
    /** the contracts shown apart — in force, closed, drafts — with their values (`contractGroups`) */
    groups: ContractGroup[];
    /** a property, management or search filter is on */
    filtered: boolean;
    /** every contract of the account, for the tooltip */
    allCount: number;
    onOpen: (row: LeaseRow) => void;
}

const hatch = (rgb: string): React.CSSProperties => ({ backgroundImage: `repeating-linear-gradient(135deg, rgba(${rgb},0.65) 0 4px, rgba(${rgb},0.2) 4px 8px)` });

/** Full class names (Tailwind reads them from here): the card's tint and border, the icon chip, the bar's two parts. */
const TONES = {
    violet: { card: "border-violet-500/25 bg-violet-500/[0.06]", chip: "bg-violet-500/15 text-violet-600", solid: "bg-violet-500", soft: "bg-violet-300", hover: "hover:border-violet-500/60 focus-visible:ring-violet-500", rgb: "139,92,246" },
    emerald: { card: "border-emerald-500/25 bg-emerald-500/[0.06]", chip: "bg-emerald-500/15 text-emerald-600", solid: "bg-emerald-500", soft: "bg-emerald-300", hover: "hover:border-emerald-500/60 focus-visible:ring-emerald-500", rgb: "16,185,129" },
    teal: { card: "border-teal-500/25 bg-teal-500/[0.06]", chip: "bg-teal-500/15 text-teal-600", solid: "bg-teal-500", soft: "bg-teal-300", hover: "hover:border-teal-500/60 focus-visible:ring-teal-500", rgb: "20,184,166" },
    indigo: { card: "border-indigo-500/25 bg-indigo-500/[0.06]", chip: "bg-indigo-500/15 text-indigo-600", solid: "bg-indigo-500", soft: "bg-indigo-300", hover: "hover:border-indigo-500/60 focus-visible:ring-indigo-500", rgb: "99,102,241" },
    amber: { card: "border-amber-500/25 bg-amber-500/[0.06]", chip: "bg-amber-500/15 text-amber-600", solid: "bg-amber-500", soft: "bg-amber-300", hover: "hover:border-amber-500/60 focus-visible:ring-amber-500", rgb: "245,158,11" },
    sky: { card: "border-sky-500/25 bg-sky-500/[0.06]", chip: "bg-sky-500/15 text-sky-600", solid: "bg-sky-500", soft: "bg-sky-300", hover: "hover:border-sky-500/60 focus-visible:ring-sky-500", rgb: "14,165,233" },
} as const;
type Tone = keyof typeof TONES;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** One card: icon and label on top, then its content. With `onClick` the whole card is a button with an arrow. */
function Kpi({ tone, icon, label, onClick, title, children }: { tone: Tone; icon: React.ReactNode; label: string; onClick?: () => void; title?: string; children: React.ReactNode }) {
    const t = TONES[tone];
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            title={title}
            className={cn("flex min-w-0 flex-col gap-2 rounded-xl border p-3 text-left sm:p-4", t.card, onClick && cn("group cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2", t.hover))}
        >
            <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", t.chip)}>{icon}</span>
                    <span className="min-w-0 leading-tight">{label}</span>
                </span>
                {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
            </span>
            {children}
        </Tag>
    );
}

/** The card's figure, with a small unit after it ("/mês", "em vigor"); smaller on a phone, where a date must fit half the width. */
function Figure({ children, unit }: { children: React.ReactNode; unit?: string }) {
    return (
        <span className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-lg font-bold leading-none tabular-nums text-foreground sm:text-2xl">{children}</span>
            {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
        </span>
    );
}

/** A bar split in parts by their values; empty (just the track) when they add up to nothing. */
function Parts({ parts, label }: { parts: Array<{ value: number; className?: string; style?: React.CSSProperties }>; label: string }) {
    const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
    return (
        <span role="img" aria-label={label} className="flex h-2 overflow-hidden rounded-full bg-muted">
            {total > 0 && parts.map((p, i) => (p.value > 0 ? <span key={i} className={cn("h-full", p.className)} style={{ width: `${(p.value / total) * 100}%`, ...p.style }} /> : null))}
        </span>
    );
}

/** One line of a card's legend: its swatch (a dot, an icon), then the text. */
function Line({ swatch, className, children }: { swatch: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <span className={cn("flex items-start gap-1.5 text-xs leading-snug text-muted-foreground", className)}>
            <span className="mt-[3px] flex h-2.5 w-2.5 shrink-0 items-center justify-center">{swatch}</span>
            <span className="min-w-0">{children}</span>
        </span>
    );
}

const Dot = ({ className, style }: { className?: string; style?: React.CSSProperties }) => <span className={cn("h-2 w-2 rounded-full", className)} style={style} />;
const Strong = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-foreground">{children}</strong>;

/** How each group reads after its count, and as a label. */
const GROUP_UNIT: Record<ContractGroupKey, (n: number) => string> = {
    vigentes: () => "em vigor",
    encerrados: n => (n === 1 ? "encerrado" : "encerrados"),
    rascunhos: n => (n === 1 ? "rascunho" : "rascunhos"),
};
const GROUP_LABEL: Record<ContractGroupKey, string> = { vigentes: "Vigentes", encerrados: "Encerrados", rascunhos: "Rascunhos" };

/** "em 259 dias", amber within 90 days (rose within 30), else in the card's colour. */
function DaysPill({ days, tone }: { days: number; tone: Tone }) {
    const cls = days <= 30 ? "bg-rose-500/15 text-rose-600" : days <= 90 ? "bg-amber-500/15 text-amber-700" : TONES[tone].chip;
    return <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{days === 0 ? "hoje" : `em ${plural(days, "dia", "dias")}`}</span>;
}

export default function ContratosKpis({ totals, groups, filtered, allCount, onOpen }: Props) {
    const v = TONES.violet, e = TONES.emerald, t = TONES.teal, s = TONES.sky;
    const missingPdf = totals.counted - totals.withFileCounted;
    // the value card leads with the first group (in force when there is one); the others follow apart
    const [main, ...others] = groups;
    const value = main?.value ?? { total: 0, executed: 0, forecast: 0, openEnded: 0 };
    const executedPct = value.total > 0 ? Math.round((value.executed / value.total) * 100) : 0;
    const average = totals.inForce > 0 ? totals.contractedRent / totals.inForce : 0;
    /** rent, deposit, next end, next adjustment: only contracts in force have them */
    const noneInForce = totals.inForce === 0 ? "nenhum contrato em vigor neste filtro" : null;

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {/* The contracts in force: who manages them, whether their PDF is attached */}
            <Kpi
                tone="violet" icon={<FileSignature className="h-3.5 w-3.5" />} label="Contratos"
                title={[`Contratos mostrados: ${totals.counted} (${allCount} no total)`, ...totals.managers.map(m => `${m.label}: ${plural(m.count, "contrato", "contratos")}`)].join("\n")}
            >
                {/* one line per group: the first big, the others under it — never one sum */}
                <span className="flex flex-col gap-1">
                    {groups.length === 0 && <Figure unit="contratos">0</Figure>}
                    {groups.map((g, i) => (i === 0
                        ? <Figure key={g.key} unit={GROUP_UNIT[g.key](g.count)}>{g.count}</Figure>
                        : (
                            <span key={g.key} className="flex items-baseline gap-1">
                                <span className="text-base font-bold leading-none tabular-nums text-foreground">{g.count}</span>
                                <span className="text-xs font-medium text-muted-foreground">{GROUP_UNIT[g.key](g.count)}</span>
                            </span>
                        )))}
                    {filtered && <span className="text-[11px] text-muted-foreground">com filtro</span>}
                </span>
                <Parts
                    label={`${totals.agencyManaged} via imobiliária, ${totals.selfManaged} de gestão própria${totals.agentManaged > 0 ? `, ${totals.agentManaged} via corretor` : ""}`}
                    parts={[{ value: totals.agencyManaged, className: v.solid }, { value: totals.selfManaged, className: v.soft }, { value: totals.agentManaged, style: hatch(v.rgb) }]}
                />
                <span className="flex flex-col gap-1">
                    <Line swatch={<Dot className={v.solid} />}><Strong>{totals.agencyManaged}</Strong> via {plural(totals.agencies, "imobiliária", "imobiliárias")}</Line>
                    <Line swatch={<Dot className={v.soft} />}><Strong>{totals.selfManaged}</Strong> gestão própria</Line>
                    {totals.agentManaged > 0 && <Line swatch={<Dot style={hatch(v.rgb)} />}><Strong>{totals.agentManaged}</Strong> via corretor</Line>}
                    <Line swatch={missingPdf > 0 ? <FileWarning className="h-3 w-3 text-amber-600" /> : <FileCheck2 className="h-3 w-3 text-emerald-600" />}>
                        <Strong>{totals.withFileCounted} de {totals.counted}</Strong> com PDF
                    </Line>
                    {totals.overdueTerm > 0
                        ? <Line swatch={<AlertTriangle className="h-3 w-3 text-rose-600" />} className="text-rose-600">{plural(totals.overdueTerm, "com o prazo vencido", "com o prazo vencido")}</Line>
                        : totals.ending90 > 0 ? <Line swatch={<AlertTriangle className="h-3 w-3 text-amber-600" />} className="text-amber-700">{dueInDaysText(totals.endingSoonDays)}</Line> : null}
                </span>
            </Kpi>

            {/* What the contracts in force bring in each month */}
            <Kpi tone="emerald" icon={<DollarSign className="h-3.5 w-3.5" />} label="Aluguel contratado" title="Soma do aluguel de contrato dos contratos em vigor mostrados (valor bruto, antes da taxa da imobiliária); um contrato encerrado não entra">
                {noneInForce ? (
                    <>
                        <Figure>—</Figure>
                        <Line swatch={<Dot className="bg-muted-foreground/40" />}>{noneInForce}</Line>
                    </>
                ) : (
                    <>
                        <Figure unit="/mês"><Money>{brl(totals.contractedRent, 0)}</Money></Figure>
                        <span className="flex flex-col gap-1">
                            <Line swatch={<Dot className={e.solid} />}><Strong><Money>{brl(totals.contractedRent * 12, 0)}</Money></Strong> por ano</Line>
                            <Line swatch={<Dot className={e.soft} />}>média de <Strong><Money>{brl(average, 0)}</Money></Strong> por contrato em vigor</Line>
                        </span>
                    </>
                )}
            </Kpi>

            {/* What they add up to over their terms: executed (the ledger) and forecast (the schedule) */}
            <Kpi
                tone="teal" icon={<Banknote className="h-3.5 w-3.5" />} label="Valor total"
                title={`Valor total no prazo inteiro, separado entre vigentes, encerrados e rascunhos: o executado (meses confirmados na razão de receitas — o aluguel antes da taxa da imobiliária e os encargos pagos pelo inquilino) mais o previsto (o resto do prazo pelo contrato, cada pagamento pelo valor em vigor)${value.openEnded > 0 ? `. ${plural(value.openEnded, "contrato sem prazo final conta", "contratos sem prazo final contam")} só o executado` : ""}`}
            >
                <Figure unit={main && groups.length > 1 ? GROUP_LABEL[main.key].toLowerCase() : undefined}><Money>{brl(value.total, 0)}</Money></Figure>
                <Parts label={`${executedPct}% executado`} parts={[{ value: value.executed, className: t.solid }, { value: value.forecast, style: hatch(t.rgb) }]} />
                <span className="flex flex-col gap-1">
                    <Line swatch={<Dot className={t.solid} />}>Executado <Strong><Money>{brl(value.executed, 0)}</Money></Strong> · {executedPct}%</Line>
                    <Line swatch={<Dot style={hatch(t.rgb)} />}>Previsto <Strong><Money>{brl(value.forecast, 0)}</Money></Strong></Line>
                </span>
                {/* closed contracts (and drafts) apart: their money never adds to the ones in force */}
                {others.map(g => (
                    <span key={g.key} className="flex flex-col gap-0.5 border-t border-teal-500/20 pt-2">
                        <Line swatch={<Dot className="bg-slate-400" />}>
                            {GROUP_LABEL[g.key]} ({g.count}) <Strong><Money>{brl(g.value.total, 0)}</Money></Strong>
                        </Line>
                        <span className="pl-4 text-[11px] text-muted-foreground">executado <Money>{brl(g.value.executed, 0)}</Money></span>
                    </span>
                ))}
            </Kpi>

            {/* The contract in force that ends first */}
            <Kpi
                tone="indigo" icon={<CalendarClock className="h-3.5 w-3.5" />} label="Próximo término"
                onClick={totals.nextEnd ? () => onOpen(totals.nextEnd!.row) : undefined}
                title={totals.nextEnd ? `Abrir o contrato de ${totals.nextEnd.row.place}` : undefined}
            >
                <Figure>{totals.nextEnd ? formatDateBR(totals.nextEnd.date) : "—"}</Figure>
                {totals.nextEnd ? (
                    <span className="flex flex-col gap-1.5">
                        <DaysPill days={totals.nextEnd.days} tone="indigo" />
                        <Line swatch={<MapPin className="h-3 w-3 text-indigo-500" />}>{totals.nextEnd.row.place}</Line>
                        {totals.nextEnd.row.notice && <Line swatch={<DoorOpen className="h-3 w-3 text-orange-500" />} className="text-orange-700 dark:text-orange-300">aviso de saída do inquilino</Line>}
                    </span>
                ) : (
                    <Line swatch={<Dot className="bg-muted-foreground/40" />}>{noneInForce ?? (totals.overdueTerm > 0 ? "só contratos com o prazo vencido" : "nenhum prazo a vencer")}</Line>
                )}
            </Kpi>

            {/* The next rent adjustment, with the index accumulated so far */}
            <Kpi
                tone="amber" icon={<TrendingUp className="h-3.5 w-3.5" />} label="Próximo reajuste"
                onClick={totals.nextAdjustment ? () => onOpen(totals.nextAdjustment!.row) : undefined}
                title={totals.nextAdjustment ? `Abrir o contrato de ${totals.nextAdjustment.row.place}` : undefined}
            >
                <Figure>{totals.nextAdjustment ? formatDateBR(totals.nextAdjustment.date) : "—"}</Figure>
                {totals.nextAdjustment ? (
                    <span className="flex flex-col gap-1.5">
                        <DaysPill days={totals.nextAdjustment.days} tone="amber" />
                        <span className="flex flex-col gap-1">
                            <Line swatch={<TrendingUp className="h-3 w-3 text-amber-500" />}>
                                <Strong>{totals.nextAdjustment.row.indexLabel}</Strong>
                                {totals.nextAdjustment.accumulatedPct !== null && <> <span className={cn("font-semibold", totals.nextAdjustment.accumulatedPct < 0 ? "text-rose-600" : "text-emerald-600")}>{pctText(totals.nextAdjustment.accumulatedPct)}</span> até agora</>}
                            </Line>
                            <Line swatch={<MapPin className="h-3 w-3 text-amber-500" />}>{totals.nextAdjustment.row.place}</Line>
                        </span>
                    </span>
                ) : (
                    <Line swatch={<Dot className="bg-muted-foreground/40" />}>{noneInForce ?? "nenhum reajuste previsto"}</Line>
                )}
            </Kpi>

            {/* The deposits of the contracts in force, and who holds them */}
            <Kpi
                tone="sky" icon={<PiggyBank className="h-3.5 w-3.5" />} label="Caução"
                title={`Soma das cauções dos contratos em vigor mostrados: dinheiro do inquilino que volta no fim do contrato.\nImobiliária (sob a custódia dela): ${brl(totals.depositsAgency)}\nGestão própria (com o proprietário): ${brl(totals.depositsOwn)}`}
            >
                {noneInForce ? (
                    <>
                        <Figure>—</Figure>
                        <Line swatch={<Dot className="bg-muted-foreground/40" />}>{noneInForce}</Line>
                    </>
                ) : (
                    <>
                        <Figure><Money>{brl(totals.deposits, 0)}</Money></Figure>
                        <Parts label={`${totals.depositsAgencyCount} com a imobiliária, ${totals.depositsOwnCount} de gestão própria`} parts={[{ value: totals.depositsAgencyCount, className: s.solid }, { value: totals.depositsOwnCount, className: s.soft }]} />
                        <span className="flex flex-col gap-1">
                            <Line swatch={<PiggyBank className="h-3 w-3 text-sky-500" />}>Com caução: <Strong>{totals.depositsCount} de {totals.inForce}</Strong> em vigor</Line>
                            <Line swatch={<Dot className={s.solid} />}>Imobiliária: <Strong>{totals.depositsAgencyCount}</Strong></Line>
                            <Line swatch={<Dot className={s.soft} />}>Gestão própria: <Strong>{totals.depositsOwnCount}</Strong></Line>
                        </span>
                    </>
                )}
            </Kpi>
        </div>
    );
}
