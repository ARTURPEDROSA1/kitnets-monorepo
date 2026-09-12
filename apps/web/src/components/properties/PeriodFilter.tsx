"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS, type PeriodFilterValue, type PeriodKind } from "@/lib/period-filter";

interface PeriodFilterProps {
    value: PeriodFilterValue;
    onChange: (next: PeriodFilterValue) => void;
    className?: string;
}

/** Segmented period selector (YTD · 1–5 anos · Tudo · Personalizado) with month pickers for custom. */
export default function PeriodFilter({ value, onChange, className }: PeriodFilterProps) {
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
            {value.kind === "custom" && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
            )}
        </div>
    );
}
