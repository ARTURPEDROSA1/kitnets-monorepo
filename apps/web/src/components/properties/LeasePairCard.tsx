"use client";

/**
 * The two-figure cards of a lease at a glance — "Início do contrato | Fim do contrato", "Vencimento |
 * Aluguel atual"… — shared by the property page (PropertyLeaseCard) and the contract's dashboard
 * (components/contratos/LeaseDashboard), so both read the same way.
 */
import React from "react";
import { cn } from "@/lib/utils";

export type PairTone = "good" | "warn" | "bad";

export interface HalfProps {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: PairTone;
}

export function Half({ label, value, hint, tone }: HalfProps) {
    return (
        <div className="p-3 space-y-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight text-muted-foreground block min-h-[25px]">{label}</span>
            <span className={cn("text-base font-bold block tabular-nums leading-tight", tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>{value}</span>
            {hint && <span className="text-[11px] text-muted-foreground block leading-snug">{hint}</span>}
        </div>
    );
}

/** Two related figures in one card; `footer` spans both. */
export function Pair({ left, right, footer, className }: { left: HalfProps; right: HalfProps; footer?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("rounded-xl border border-border/80 bg-muted/20 flex flex-col", className)}>
            <div className="grid grid-cols-2 divide-x divide-border/70 flex-1">
                <Half {...left} />
                <Half {...right} />
            </div>
            {footer}
        </div>
    );
}

/** The term's progress under "Início | Fim". */
export function TermProgress({ pct, tone }: { pct: number; tone?: PairTone }) {
    return (
        <div className="px-3 pb-3 space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full", tone === "bad" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground block">{pct}% do prazo</span>
        </div>
    );
}
