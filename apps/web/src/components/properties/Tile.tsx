"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type TileTone = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";

const TONES: Record<TileTone, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
    violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    slate: "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300",
};

/** Explanation shown when the card's icon is clicked: what the KPI is, its formula and the numbers of this property. */
export interface TileInfo {
    what: React.ReactNode;
    formula: React.ReactNode;
    /** the formula with this property's numbers */
    example?: React.ReactNode;
    note?: React.ReactNode;
}

/** Small KPI card used by the property sections (label, icon, value, hint). With `info`, the icon opens an explanation popup. */
export default function Tile({ label, value, hint, icon, tone, title, info }: { label: string; value: React.ReactNode; hint: React.ReactNode; icon: React.ReactNode; tone: TileTone; title?: string; info?: TileInfo }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1 flex flex-col" title={title}>
            <div className="flex items-start justify-between gap-2 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{label}</span>
                {info ? (
                    <button type="button" onClick={() => setOpen(true)} title="O que é este indicador e como é calculado" aria-label={`Explicar ${label}`}
                        className={cn("p-1.5 rounded-lg shrink-0 cursor-help transition-shadow hover:ring-2 hover:ring-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current", TONES[tone])}>
                        {icon}
                    </button>
                ) : (
                    <span className={cn("p-1.5 rounded-lg shrink-0", TONES[tone])}>{icon}</span>
                )}
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums leading-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
            {info && (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-base">
                                <span className={cn("p-1.5 rounded-lg shrink-0", TONES[tone])}>{icon}</span>
                                {label}
                            </DialogTitle>
                            <DialogDescription className="text-sm text-foreground/80 leading-relaxed pt-1">{info.what}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fórmula</span>
                                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">{info.formula}</div>
                            </div>
                            {info.example && (
                                <div className="space-y-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Neste imóvel</span>
                                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2 text-xs leading-relaxed text-foreground tabular-nums">{info.example}</div>
                                </div>
                            )}
                            {info.note && <p className="text-xs text-muted-foreground leading-relaxed">{info.note}</p>}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
