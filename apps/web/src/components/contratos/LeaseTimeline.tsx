"use client";

/**
 * The contracts on a calendar: one bar per lease from its start to its end, coloured by status,
 * today as a vertical line, each rent adjustment as a diamond (the next one filled). A lease in
 * force past its term carries a hatched tail up to today ("prazo indeterminado"). Click a row to
 * open the contract. Pure CSS: bars are positioned in % of the span, so it is responsive without
 * measuring anything.
 */
import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { adjustmentDates, brl, positionPct, statusMeta, timelineBounds, timelineTicks, type LeaseRow } from "@/lib/lease-dashboard";

interface Props {
    rows: LeaseRow[];
    today: string;
    onOpen: (row: LeaseRow) => void;
}

const LABEL_WIDTH = "w-64 min-w-64";

export default function LeaseTimeline({ rows, today, onOpen }: Props) {
    const sorted = useMemo(() => [...rows].sort((a, b) => a.lease.start_date.localeCompare(b.lease.start_date) || a.title.localeCompare(b.title)), [rows]);
    const bounds = useMemo(() => timelineBounds(sorted, today), [sorted, today]);
    const ticks = useMemo(() => timelineTicks(bounds), [bounds]);
    const todayPct = positionPct(today, bounds);

    if (sorted.length === 0) return null;

    return (
        <div className="rounded-xl border border-border/80 bg-card">
            <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                    {/* Axis */}
                    <div className="flex border-b border-border/60">
                        <div className={cn(LABEL_WIDTH, "shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground")}>Contrato</div>
                        <div className="relative h-8 flex-1">
                            {ticks.map(t => (
                                <span
                                    key={t.date}
                                    className={cn("absolute top-0 h-full border-l pl-1 text-[10px] leading-8 whitespace-nowrap", t.major ? "border-border font-semibold text-foreground" : "border-border/50 text-muted-foreground")}
                                    style={{ left: `${positionPct(t.date, bounds)}%` }}
                                >
                                    {t.label}
                                </span>
                            ))}
                            <span className="absolute top-0 h-full border-l border-emerald-600" style={{ left: `${todayPct}%` }}>
                                <span className="absolute -top-0 left-1 rounded-b bg-emerald-600 px-1 text-[9px] font-semibold uppercase leading-4 text-white">hoje</span>
                            </span>
                        </div>
                    </div>

                    {/* Rows */}
                    <ul>
                        {sorted.map(row => {
                            const { lease, summary } = row;
                            const meta = statusMeta(row);
                            const start = lease.start_date.slice(0, 10);
                            const end = summary.effectiveEnd;
                            const openEnded = !end;
                            // the bar: start → end (or today for an open-ended lease still in force)
                            const barEnd = end ?? (row.inForce ? today : start);
                            const left = positionPct(start, bounds);
                            const right = positionPct(barEnd, bounds);
                            const width = Math.max(0.4, right - left);
                            // in force past the term: a hatched tail up to today
                            const tail = row.inForce && end && end < today ? { left: right, width: Math.max(0.4, todayPct - right) } : null;
                            const adj = adjustmentDates(lease, today);
                            const rent = brl(Number(lease.monthly_rent) || 0, 0);
                            const title = `${row.title}\n${formatDateBR(start)} → ${end ? formatDateBR(end) : "prazo indeterminado"} · ${rent}/mês · ${meta.label}`;
                            return (
                                <li key={lease.id} className="flex border-b border-border/40 last:border-0 hover:bg-muted/30">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(row)}
                                        className={cn(LABEL_WIDTH, "shrink-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500")}
                                        title={title}
                                    >
                                        <span className="block break-words text-xs font-semibold leading-snug text-foreground">{row.title}</span>
                                        <span className="block break-words text-[11px] leading-snug text-muted-foreground">
                                            {row.title.toLowerCase().includes((lease.primary_tenant_name ?? "\u0000").toLowerCase()) ? rent : `${lease.primary_tenant_name ?? "Sem inquilino"} · ${rent}`}
                                        </span>
                                    </button>
                                    <div className="relative flex-1 cursor-pointer" onClick={() => onOpen(row)} title={title} role="presentation">
                                        {ticks.filter(t => t.major).map(t => (
                                            <span key={t.date} className="absolute top-0 h-full border-l border-border/40" style={{ left: `${positionPct(t.date, bounds)}%` }} />
                                        ))}
                                        <span className="absolute top-0 h-full border-l border-emerald-600/70" style={{ left: `${todayPct}%` }} />
                                        <span
                                            className={cn("absolute top-1/2 h-4 -translate-y-1/2 rounded-md", meta.bar, openEnded && row.inForce && "rounded-r-none")}
                                            style={{ left: `${left}%`, width: `${width}%` }}
                                        />
                                        {openEnded && row.inForce && (
                                            <span className="absolute top-1/2 h-4 w-3 -translate-y-1/2 rounded-r-md" style={{ left: `${right}%`, background: "repeating-linear-gradient(135deg, rgba(16,185,129,.55) 0 3px, transparent 3px 6px)" }} title="Prazo indeterminado" />
                                        )}
                                        {tail && (
                                            <span
                                                className="absolute top-1/2 h-4 -translate-y-1/2 rounded-r-md"
                                                style={{ left: `${tail.left}%`, width: `${tail.width}%`, background: "repeating-linear-gradient(135deg, rgba(244,63,94,.55) 0 3px, transparent 3px 6px)" }}
                                                title="Prazo vencido: o contrato segue por prazo indeterminado"
                                            />
                                        )}
                                        {adj.past.map(d => (
                                            <span key={d} className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-foreground/60 bg-card" style={{ left: `${positionPct(d, bounds)}%` }} title={`Reajuste em ${formatDateBR(d)}`} />
                                        ))}
                                        {adj.next && row.inForce && (
                                            <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-amber-500 ring-2 ring-card" style={{ left: `${positionPct(adj.next, bounds)}%` }} title={`Próximo reajuste em ${formatDateBR(adj.next)}`} />
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500" /> Em vigor</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-amber-500" /> Vencendo</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-rose-500" /> Prazo vencido</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-slate-400" /> Encerrado</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-sky-400" /> Rascunho</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rotate-45 border border-foreground/60 bg-card" /> Reajuste</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rotate-45 bg-amber-500" /> Próximo reajuste</span>
            </div>
        </div>
    );
}
