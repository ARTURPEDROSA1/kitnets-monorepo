"use client";

/**
 * The Panorama's "all indexes on one chart" card: the period buttons, one checkbox pill per index
 * (its colour key is the legend) and the multi-line chart. A few indexes are on when the page opens;
 * the visitor unticks the ones they do not want and ticks the rest.
 */
import { useMemo, useState } from "react";
import type { IndexMonthValue } from "@/lib/index-correction";
import { PANORAMA_DEFAULT_ON, PANORAMA_SERIES } from "@/lib/index-compare";
import { MONTHLY_PRESETS, defaultMonthlyPeriod, formatRangeLabel, type SeriesPoint } from "@/lib/index-period";
import { cn } from "@/lib/utils";
import { MultiIndexChart, type ChartSeries } from "./MultiIndexChart";
import { PeriodSelector } from "./PeriodSelector";
import { useIndexPeriod } from "./useIndexPeriod";

interface Props {
    /** monthly rates in %, by Panorama key (lib/index-compare.ts) */
    series: Record<string, IndexMonthValue[]>;
}

const byDate = (a: SeriesPoint, b: SeriesPoint) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function PanoramaChart({ series }: Props) {
    const available = useMemo(() => PANORAMA_SERIES.filter((s) => (series[s.key]?.length ?? 0) > 0), [series]);
    const points = useMemo<Record<string, SeriesPoint[]>>(
        () => Object.fromEntries(available.map((s) => [s.key, series[s.key].map((v) => ({ date: `${v.month}-01`, value: Number(v.value) })).sort(byDate)])),
        [available, series],
    );
    const { earliest, latest } = useMemo(() => {
        let lo = "";
        let hi = "";
        for (const list of Object.values(points)) {
            if (list.length === 0) continue;
            const first = list[0].date;
            const last = list[list.length - 1].date;
            if (!lo || first < lo) lo = first;
            if (!hi || last > hi) hi = last;
        }
        return { earliest: lo, latest: hi };
    }, [points]);

    const { period, custom, range, redundant, select, setCustom } = useIndexPeriod(earliest, latest, MONTHLY_PRESETS, defaultMonthlyPeriod(latest));
    const [on, setOn] = useState<ReadonlySet<string>>(() => new Set(PANORAMA_DEFAULT_ON));
    const toggle = (key: string) => setOn((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });

    const visible = useMemo<ChartSeries[]>(
        () => available.filter((s) => on.has(s.key)).map((s) => ({ ...s, points: points[s.key].filter((p) => p.date >= range.start && p.date <= range.end) })),
        [available, on, points, range],
    );

    if (available.length === 0) return null;

    return (
        <section className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between md:p-6">
                <div className="space-y-1.5">
                    <h2 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Todos os índices no mesmo gráfico</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">Variação mensal em %. Desmarque os índices que não quer ver.</p>
                    <p className="text-xs text-muted-foreground">{formatRangeLabel(range)}</p>
                </div>
                <PeriodSelector
                    presets={MONTHLY_PRESETS}
                    value={period}
                    onSelect={select}
                    custom={custom}
                    onCustomChange={setCustom}
                    redundant={redundant}
                    bounds={{ start: earliest, end: latest }}
                />
            </div>
            <div className="space-y-4 p-3 pt-0 md:p-6 md:pt-0">
                <div role="group" aria-label="Índices no gráfico" className="flex flex-wrap items-center gap-1.5 text-xs">
                    {available.map((s) => {
                        const checked = on.has(s.key);
                        return (
                            <button
                                key={s.key}
                                type="button"
                                role="checkbox"
                                aria-checked={checked}
                                onClick={() => toggle(s.key)}
                                title={checked ? `Tirar ${s.label} do gráfico` : `Mostrar ${s.label}`}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                                    checked ? "border-border bg-background text-foreground shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <span aria-hidden="true" className={cn("inline-block h-0.5 w-3.5 rounded-full", !checked && "opacity-40")} style={{ background: s.color }} />
                                {s.label}
                            </button>
                        );
                    })}
                </div>
                <MultiIndexChart series={visible} />
            </div>
        </section>
    );
}
