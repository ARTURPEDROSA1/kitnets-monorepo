"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> { value: T; label: string; hint?: string; disabled?: boolean }

/** The pill switch used across the FipeZap pages (see FipeZapCalculator): one pressed option, keyboard friendly. */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, size = "sm", className }: {
    options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string; size?: "sm" | "xs"; className?: string;
}) {
    return (
        <div className={cn("inline-flex rounded-lg border border-border bg-muted/40 p-0.5", className)} role="group" aria-label={ariaLabel}>
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    aria-pressed={value === o.value}
                    disabled={o.disabled}
                    title={o.hint}
                    className={cn(
                        "rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed",
                        size === "sm" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[11px]",
                        value === o.value ? "bg-background text-foreground shadow-xs border border-border" : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
