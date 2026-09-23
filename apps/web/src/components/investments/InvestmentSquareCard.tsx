"use client";

/**
 * One square card per Novo Investimento, the same shape the Imóveis page uses for a property.
 *
 * What it answers at a glance: how much of the unit is already paid, what is due next, and how
 * long until the keys. Everything else is one click away on the dashboard.
 *
 * The cover is a small carousel over the investment's photos: arrows and dots on hover, swipe on
 * touch, ← → on the keyboard while the card has focus, and it advances by itself every few
 * seconds while the page is open — pausing under the pointer and staying still for people who
 * asked their system for reduced motion.
 */
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileText, Handshake, KeyRound, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
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

/** How long each picture stays on the cover before the next one slides in. */
const AUTO_SLIDE_MS = 5000;
/** Horizontal finger travel that counts as a swipe. */
const SWIPE_MIN_PX = 40;

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

    // ── Cover carousel ──────────────────────────────────────────────
    const count = photoUrls.length;
    // Pictures are mounted the first time they show, so a card with twelve photos does not
    // download twelve full-size images just to be on the page; once seen they stay for the fade.
    const [slide, setSlide] = useState<{ index: number; seen: number[] }>({ index: 0, seen: [0] });
    const [paused, setPaused] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const index = count > 0 ? slide.index % count : 0;
    const { seen } = slide;

    const goTo = (next: number) => {
        if (count < 2) return;
        const wrapped = ((next % count) + count) % count;
        setSlide(s => ({ index: wrapped, seen: s.seen.includes(wrapped) ? s.seen : [...s.seen, wrapped] }));
    };

    useEffect(() => {
        if (count < 2 || paused) return;
        if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const timer = window.setInterval(() => {
            if (document.visibilityState === "hidden") return;
            setSlide(s => {
                const next = (s.index + 1) % count;
                return { index: next, seen: s.seen.includes(next) ? s.seen : [...s.seen, next] };
            });
        }, AUTO_SLIDE_MS);
        return () => window.clearInterval(timer);
    }, [count, paused]);

    const step = (e: React.SyntheticEvent, delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        goTo(index + delta);
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); }
                else if (e.key === "ArrowRight" && count > 1) { e.preventDefault(); goTo(index + 1); }
                else if (e.key === "ArrowLeft" && count > 1) { e.preventDefault(); goTo(index - 1); }
            }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="group relative flex flex-col rounded-2xl border border-border/80 bg-card overflow-hidden text-left transition-all hover:border-emerald-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
            <div
                className="relative h-32 w-full bg-gradient-to-br from-emerald-500/15 via-blue-500/10 to-violet-500/15"
                onTouchStart={e => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
                onTouchEnd={e => {
                    const start = touchStartX.current;
                    touchStartX.current = null;
                    if (start === null || count < 2) return;
                    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
                    if (delta <= -SWIPE_MIN_PX) goTo(index + 1);
                    else if (delta >= SWIPE_MIN_PX) goTo(index - 1);
                }}
            >
                {count > 0 ? (
                    photoUrls.map((url, i) =>
                        seen.includes(i) || i === index ? (
                            <Image
                                key={url}
                                src={url}
                                alt={i === 0 ? title : `${title} — foto ${i + 1}`}
                                fill
                                sizes="(max-width: 768px) 100vw, 320px"
                                className={cn("object-cover transition-opacity duration-700 ease-in-out", i === index ? "opacity-100" : "opacity-0")}
                                aria-hidden={i !== index}
                                unoptimized
                            />
                        ) : null
                    )
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-emerald-600/60">
                        <Building2 className="w-10 h-10" />
                    </span>
                )}
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

                {count > 1 && (
                    <>
                        <button
                            type="button"
                            onClick={e => step(e, -1)}
                            title="Foto anterior"
                            aria-label="Foto anterior"
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/85 text-foreground shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-background transition-opacity"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={e => step(e, 1)}
                            title="Próxima foto"
                            aria-label="Próxima foto"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/85 text-foreground shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-background transition-opacity"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1" aria-hidden>
                            {photoUrls.map((url, i) => (
                                <button
                                    key={url}
                                    type="button"
                                    tabIndex={-1}
                                    onClick={e => { e.stopPropagation(); e.preventDefault(); goTo(i); }}
                                    className={cn(
                                        "h-1.5 rounded-full shadow-sm transition-all",
                                        i === index ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"
                                    )}
                                />
                            ))}
                        </div>
                        <span className="sr-only" aria-live="polite">Foto {index + 1} de {count}</span>
                    </>
                )}
            </div>

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
                    {summary?.netYieldPct != null && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <TrendingUp className="w-3 h-3" /> {summary.netYieldPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a.a.
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
