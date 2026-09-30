"use client";

/**
 * "Comparar com" under the period buttons: one pill per index the page can overlay on its chart
 * (lib/index-compare.ts). Each pill carries the colour key of its line, so the row doubles as the
 * chart's legend — the page's own index appears first as soon as a comparison is on.
 */
import { cn } from "@/lib/utils";
import type { ComparisonSeries } from "@/lib/index-compare";

interface Props {
    options: ComparisonSeries[];
    /** codes currently drawn */
    active: ReadonlySet<string>;
    onToggle: (code: string) => void;
    /** the page's own series, for the legend */
    mainLabel: string;
    mainColor: string;
    className?: string;
}

function LineKey({ color, muted }: { color: string; muted?: boolean }) {
    return <span aria-hidden="true" className={cn("inline-block h-0.5 w-3.5 rounded-full", muted && "opacity-40")} style={{ background: color }} />;
}

export function CompareToggle({ options, active, onToggle, mainLabel, mainColor, className }: Props) {
    if (options.length === 0) return null;
    const anyOn = options.some((o) => active.has(o.code));
    return (
        <div role="group" aria-label="Comparar com" className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
            <span className="text-muted-foreground">Comparar com:</span>
            {anyOn && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-semibold text-foreground">
                    <LineKey color={mainColor} />
                    {mainLabel}
                </span>
            )}
            {options.map((o) => {
                const on = active.has(o.code);
                return (
                    <button
                        key={o.code}
                        type="button"
                        onClick={() => onToggle(o.code)}
                        aria-pressed={on}
                        title={on ? `Tirar ${o.label} do gráfico` : `Sobrepor ${o.label} no gráfico`}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                            on ? "border-border bg-background text-foreground shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <LineKey color={o.color} muted={!on} />
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
