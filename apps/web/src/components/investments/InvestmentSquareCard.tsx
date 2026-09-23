"use client";

/**
 * One square card per project, the same shape the Imóveis page uses for a property.
 *
 * What it answers at a glance: how much of the unit is already paid, what is due next, and how
 * long until the keys. Everything else is one click away on the dashboard.
 *
 * The cover is a small carousel over the project's photos (`components/ui/CoverCarousel`, shared
 * with the property cards): arrows and dots on hover, swipe on touch, ← → on the keyboard while
 * the card has focus, auto-advance every few seconds while the page is open.
 */
import React from "react";
import { Building2, CalendarClock, CheckCircle2, FileText, Handshake, KeyRound, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { CoverCarousel, useCoverCarousel } from "@/components/ui/CoverCarousel";
import { INVESTMENT_KIND_LABELS, STRATEGY_LABELS, formatBRL, investmentTitle, type NewInvestment } from "@/lib/new-investments";
import type { InvestmentCardSummary } from "@/lib/new-investment-metrics";

interface Props {
    investment: NewInvestment;
    summary: InvestmentCardSummary | undefined;
    /** Signed URLs the cover slides through, cover first. */
    photoUrls?: string[];
    onSelect: () => void;
    onDelete: (e: React.MouseEvent) => void;
    isDeleting?: boolean;
}

const compactBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "faltam 14 meses · obra 35%", "chaves entregues", "entrega este mês". Short: the label above already says "Chaves". */
function keysLabel(summary: InvestmentCardSummary | undefined, investment: NewInvestment): string {
    const works = investment.construction_pct !== null && !investment.keys_delivered_on
        ? ` · obra ${investment.construction_pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
        : "";
    if (investment.status === "SOLD" && investment.sold_on) return `Vendido em ${formatDateBR(investment.sold_on)}`;
    if (investment.keys_delivered_on) return "Chaves entregues";
    if (!summary || summary.monthsToKeys === null) return `Entrega não informada${works}`;
    if (summary.monthsToKeys < 0) return `Prevista para ${formatDateBR(summary.keysOn)}, vencida${works}`;
    if (summary.monthsToKeys === 0) return `Entrega neste mês${works}`;
    return `Faltam ${summary.monthsToKeys} ${summary.monthsToKeys === 1 ? "mês" : "meses"}${works}`;
}

const EMPTY: string[] = [];

export default function InvestmentSquareCard({ investment, summary, photoUrls = EMPTY, onSelect, onDelete, isDeleting = false }: Props) {
    const title = investmentTitle(investment);
    const pct = Math.min(100, Math.max(0, summary?.paidPct ?? 0));
    const completed = investment.status === "COMPLETED";
    const sold = investment.status === "SOLD";
    const carousel = useCoverCarousel(photoUrls.length);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); return; }
                carousel.onKeyDown(e);
            }}
            onMouseEnter={carousel.pause}
            onMouseLeave={carousel.resume}
            className="group relative flex flex-col rounded-2xl border border-border/80 bg-card overflow-hidden text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <CoverCarousel photos={photoUrls} alt={title} state={carousel} fallback={<Building2 className="w-10 h-10" />} unoptimized>
                <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {INVESTMENT_KIND_LABELS[investment.kind] ?? "Imóvel"} · {STRATEGY_LABELS[investment.strategy] ?? "Na planta"}
                </span>
                {completed && (
                    <span className="absolute top-2 right-10 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <CheckCircle2 className="w-3 h-3" /> Em Imóveis
                    </span>
                )}
                {sold && (
                    <span className="absolute top-2 right-10 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Handshake className="w-3 h-3" /> Vendido
                    </span>
                )}
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    title="Excluir projeto"
                    aria-label={`Excluir ${title}`}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-600 transition-opacity disabled:opacity-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </CoverCarousel>

            <div className="flex flex-col gap-3 p-4 flex-1">
                <div className="space-y-0.5">
                    <h3 className="font-semibold text-foreground leading-tight line-clamp-1" title={title}>{title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                        {investment.developer || investment.address || "Construtora não informada"}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold tabular-nums text-foreground">{compactBRL(summary?.paidToDate ?? 0)}</span>
                        <span className="text-muted-foreground tabular-nums">de {compactBRL(summary?.committed ?? investment.total_price)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : "bg-emerald-500/80")}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% pago</span>
                        {(summary?.overdueCount ?? 0) > 0 && (
                            <span className="text-amber-600 font-medium">{summary!.overdueCount} em atraso</span>
                        )}
                    </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-[11px] mt-auto">
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><CalendarClock className="w-3 h-3" /> Próxima</dt>
                        <dd className="font-semibold text-foreground tabular-nums">
                            {summary?.nextDueOn ? formatBRL(summary.nextDueAmount, 0) : "—"}
                        </dd>
                        <dd className="text-muted-foreground tabular-nums">{summary?.nextDueOn ? formatDateBR(summary.nextDueOn) : "sem parcelas"}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <dt className="flex items-center gap-1 text-muted-foreground"><KeyRound className="w-3 h-3" /> Chaves</dt>
                        <dd className="font-semibold text-foreground">{summary?.keysOn ? formatDateBR(summary.keysOn) : "—"}</dd>
                        <dd className="text-muted-foreground line-clamp-1" title={keysLabel(summary, investment)}>{keysLabel(summary, investment)}</dd>
                    </div>
                </dl>

                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                    <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {summary?.documents ?? 0} arquivo{(summary?.documents ?? 0) === 1 ? "" : "s"}</span>
                    {summary?.realizedGain != null ? (
                        <span className={cn("inline-flex items-center gap-1 font-medium", summary.realizedGain >= 0 ? "text-emerald-600" : "text-rose-600")} title="Ganho realizado na venda, sobre o que foi pago">
                            <Handshake className="w-3 h-3" /> {summary.realizedGain > 0 ? "+" : ""}{formatBRL(summary.realizedGain, 0)}
                            {summary.paidToDate > 0 ? ` (${((summary.realizedGain / summary.paidToDate) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%)` : ""}
                        </span>
                    ) : summary?.netYieldPct != null && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium" title="Yield do aluguel: 12 × aluguel líquido ÷ custo total">
                            <TrendingUp className="w-3 h-3" /> {summary.netYieldPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
