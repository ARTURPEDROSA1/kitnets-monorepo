"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type TileTone = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";

export const TILE_TONES: Record<TileTone, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
    violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    slate: "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300",
};

/** Explanation shown when a card's icon is clicked: what the figure is, its formula and the numbers of this property. */
export interface TileInfo {
    what: React.ReactNode;
    formula: React.ReactNode;
    /** the formula with this property's numbers */
    example?: React.ReactNode;
    note?: React.ReactNode;
}

/**
 * The icon in a card's top-right corner. With `info` it is a button that opens the explanation popup
 * (modal, like every other popup); without it, a plain coloured chip. `className` carries the colours.
 */
export function CardInfoIcon({ label, icon, info, className }: { label: string; icon: React.ReactNode; info?: TileInfo; className: string }) {
    const [open, setOpen] = useState(false);
    if (!info) return <span className={cn("p-1.5 rounded-lg shrink-0", className)}>{icon}</span>;
    return (
        <>
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(true); }}          // some cards are clickable themselves
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
                title="O que é este indicador e como é calculado"
                aria-label={`Explicar ${label}`}
                className={cn("p-1.5 rounded-lg shrink-0 cursor-help transition-shadow hover:ring-2 hover:ring-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current", className)}
            >
                {icon}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md shadow-2xl border-border" onClick={e => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <span className={cn("p-1.5 rounded-lg shrink-0", className)}>{icon}</span>
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
        </>
    );
}

/** Small KPI card used by the property sections (label, icon, value, hint). With `info`, the icon opens an explanation popup. */
export default function Tile({ label, value, hint, icon, tone, title, info, action }: { label: string; value: React.ReactNode; hint: React.ReactNode; icon: React.ReactNode; tone: TileTone; title?: string; info?: TileInfo; action?: React.ReactNode }) {
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1 flex flex-col" title={title}>
            <div className="flex items-start justify-between gap-2 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{label}</span>
                <CardInfoIcon label={label} icon={icon} info={info} className={TILE_TONES[tone]} />
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums leading-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
            {action}
        </div>
    );
}
