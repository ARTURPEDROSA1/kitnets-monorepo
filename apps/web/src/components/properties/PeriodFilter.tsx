"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS, type PeriodFilterValue, type PeriodKind } from "@/lib/period-filter";

interface PeriodFilterProps {
    value: PeriodFilterValue;
    onChange: (next: PeriodFilterValue) => void;
    className?: string;
    /** "compact": a dropdown (YTD…Tudo) + a Personalizado button; the month pickers wrap onto the next line of the parent flex */
    variant?: "segmented" | "compact";
}

/** Segmented period selector (YTD · 1–5 anos · Tudo · Personalizado) with month pickers for custom. */
export default function PeriodFilter({ value, onChange, className, variant = "segmented" }: PeriodFilterProps) {
    const pick = (kind: PeriodKind) => {
        if (kind === "custom") {
            const now = new Date();
            const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const start = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            onChange({ kind, start: value.start ?? start, end: value.end ?? end });
        } else {
            onChange({ kind });
        }
    };

    const customInputs = value.kind === "custom" && (
        <div className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", variant === "compact" && "basis-full justify-end")}>
            <input
                type="month"
                value={value.start ?? ""}
                max={value.end}
                onChange={e => onChange({ ...value, start: e.target.value || undefined })}
                className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground"
                aria-label="Mês inicial"
            />
            <span>até</span>
            <input
                type="month"
                value={value.end ?? ""}
                min={value.start}
                onChange={e => onChange({ ...value, end: e.target.value || undefined })}
                className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground"
                aria-label="Mês final"
            />
        </div>
    );

    if (variant === "compact") {
        // display: contents — the select, the button and the pickers lay out inside the parent's flex row
        return (
            <div className={cn("contents", className)}>
                <select
                    value={value.kind === "custom" ? "" : value.kind}
                    onChange={e => { if (e.target.value) pick(e.target.value as PeriodKind); }}
                    title="Período"
                    aria-label="Período"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                    {value.kind === "custom" && <option value="">Personalizado</option>}
                    {PERIOD_OPTIONS.filter(o => o.kind !== "custom").map(o => <option key={o.kind} value={o.kind} title={o.title}>{o.label}</option>)}
                </select>
                <button
                    type="button"
                    onClick={() => pick("custom")}
                    title="Escolha o mês inicial e final"
                    className={cn("h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors",
                        value.kind === "custom" ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-input bg-background text-muted-foreground hover:text-foreground")}
                >
                    Personalizado
                </button>
                {customInputs}
            </div>
        );
    }

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Período">
                {PERIOD_OPTIONS.map(opt => (
                    <button
                        key={opt.kind}
                        type="button"
                        title={opt.title}
                        onClick={() => pick(opt.kind)}
                        className={cn(
                            "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors",
                            value.kind === opt.kind
                                ? "bg-background text-foreground shadow-xs border border-border"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {customInputs}
        </div>
    );
}
