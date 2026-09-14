"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type TileTone = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";

const TONES: Record<TileTone, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600",
    violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600",
    slate: "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300",
};

/** Small KPI card used by the property sections (label, icon, value, hint). */
export default function Tile({ label, value, hint, icon, tone, title }: { label: string; value: React.ReactNode; hint: React.ReactNode; icon: React.ReactNode; tone: TileTone; title?: string }) {
    return (
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1 flex flex-col" title={title}>
            <div className="flex items-start justify-between gap-2 text-muted-foreground">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{label}</span>
                <span className={cn("p-1.5 rounded-lg shrink-0", TONES[tone])}>{icon}</span>
            </div>
            <span className="text-lg font-bold text-foreground block tabular-nums leading-tight">{value}</span>
            <span className="text-[11px] text-muted-foreground block leading-snug break-words">{hint}</span>
        </div>
    );
}
