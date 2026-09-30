"use client";

/**
 * The period buttons of a history chart (6M · 1A · 2A · 5A · 10A · YTD · Máx · Personalizar), in the
 * style of a finance site: one row of pills, the active one raised. "Personalizar" opens two date
 * fields (dd/mm/aaaa) under the row. Presets the series is too short for are disabled — they would
 * show the same as Máx. The choice scopes everything under the chart (heatmap and table), see
 * IndexHistoryDashboard.
 */
import { DateInput } from "@/components/ui/DateInput";
import { cn } from "@/lib/utils";
import { formatMonthYear, type DateRange, type PeriodKey, type PeriodPreset } from "@/lib/index-period";

interface Props {
    presets: PeriodPreset[];
    value: PeriodKey;
    onSelect: (key: PeriodKey) => void;
    /** the custom range (ISO), edited while "Personalizar" is active */
    custom: DateRange;
    onCustomChange: (range: DateRange) => void;
    /** presets the series is too short for */
    redundant: ReadonlySet<PeriodKey>;
    /** where the series starts and ends */
    bounds: DateRange;
    className?: string;
}

const FIELD = "h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";

export function PeriodSelector({ presets, value, onSelect, custom, onCustomChange, redundant, bounds, className }: Props) {
    return (
        <div className={cn("flex flex-col items-start gap-2 sm:items-end", className)}>
            <div role="group" aria-label="Período" className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
                {presets.map((p) => {
                    const active = p.key === value;
                    const disabled = redundant.has(p.key);
                    return (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => { if (!disabled) onSelect(p.key); }}
                            aria-pressed={active}
                            disabled={disabled}
                            title={disabled ? `${p.title}: a série inteira já cabe em Máx` : p.title}
                            className={cn(
                                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                                active ? "border border-border bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                                disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                            )}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>
            {value === "custom" && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>De</span>
                    <DateInput
                        value={custom.start}
                        onChange={(iso) => { if (iso) onCustomChange({ ...custom, start: iso }); }}
                        variant="bare"
                        className={FIELD}
                        wrapperClassName="w-[8.75rem]"
                        aria-label="Início do período"
                    />
                    <span>até</span>
                    <DateInput
                        value={custom.end}
                        onChange={(iso) => { if (iso) onCustomChange({ ...custom, end: iso }); }}
                        variant="bare"
                        className={FIELD}
                        wrapperClassName="w-[8.75rem]"
                        aria-label="Fim do período"
                    />
                    <span className="hidden sm:inline">· série de {formatMonthYear(bounds.start)} a {formatMonthYear(bounds.end)}</span>
                </div>
            )}
        </div>
    );
}
