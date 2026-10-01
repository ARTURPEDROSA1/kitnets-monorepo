"use client";

/**
 * The history of a standard index page (CDI, Selic, IPCA, IGP-M, INPC, IVAR): the trend chart with
 * the period buttons, the monthly heatmap and the detailed table, all showing the same slice of the
 * series. The page loads the whole history once; the buttons only slice it in the browser, so the
 * URL never changes (these public pages stay free of query-string variants).
 */
import { useMemo, useState } from "react";
import type { IndexValue } from "@/lib/indexes";
import { MAIN_SERIES_COLOR, type ComparisonSeries } from "@/lib/index-compare";
import { DEFAULT_MONTHLY_PERIOD, MONTHLY_PRESETS, filterByRange, formatRangeLabel, summarizeSeries } from "@/lib/index-period";
import { CompareToggle } from "./CompareToggle";
import { IndexHeatmap } from "./IndexHeatmap";
import { IndexHistoryTable } from "./IndexHistoryTable";
import { IndexTrendChart, formatPercent, type TrendPoint } from "./IndexTrendChart";
import { PeriodSelector } from "./PeriodSelector";
import { PeriodStats } from "./PeriodStats";
import { useIndexPeriod } from "./useIndexPeriod";

export interface HistoryLabels {
    chartTitle: string;
    chartSubtitle: string;
    heatmapTitle: string;
    heatmapSubtitle: string;
    tableTitle: string;
    tableSubtitle: string;
    swipeHint: string;
}

interface Props {
    /** the whole series, any order */
    data: IndexValue[];
    indexCode: string;
    labels: HistoryLabels;
    /** the indexes the chart can overlay ("Comparar com") */
    compare?: ComparisonSeries[];
}

const CARD = "rounded-xl border bg-card text-card-foreground shadow-sm";
const TITLE = "text-lg md:text-2xl font-semibold leading-none tracking-tight";
const SUBTITLE = "text-xs md:text-sm text-muted-foreground";

const byDate = (a: { reference_date: string }, b: { reference_date: string }) => (a.reference_date < b.reference_date ? -1 : a.reference_date > b.reference_date ? 1 : 0);

export function IndexHistoryDashboard({ data, indexCode, labels, compare = [] }: Props) {
    const sorted = useMemo(() => [...data].sort(byDate), [data]);
    const earliest = sorted[0]?.reference_date ?? "";
    const latest = sorted[sorted.length - 1]?.reference_date ?? "";
    const { period, custom, range, redundant, select, setCustom } = useIndexPeriod(earliest, latest, MONTHLY_PRESETS, DEFAULT_MONTHLY_PERIOD);

    const slice = useMemo(() => filterByRange(sorted, range), [sorted, range]);
    const points = useMemo<TrendPoint[]>(() => slice.map((v) => ({
        date: v.reference_date,
        value: Number(v.value_percent),
        details: [
            ...(v.accumulated_12m !== null && v.accumulated_12m !== undefined ? [{ label: "Acumulado 12 meses", value: formatPercent(Number(v.accumulated_12m)) }] : []),
            ...(v.accumulated_year !== null && v.accumulated_year !== undefined ? [{ label: `Acumulado em ${v.year}`, value: formatPercent(Number(v.accumulated_year)) }] : []),
        ],
    })), [slice]);
    const summary = useMemo(() => summarizeSeries(points.map((p) => ({ date: p.date, value: p.value }))), [points]);

    // "Comparar com": the chosen indexes, cut to the same period as the chart
    const [comparing, setComparing] = useState<ReadonlySet<string>>(() => new Set());
    const toggleCompare = (code: string) => setComparing((prev) => {
        const next = new Set(prev);
        if (next.has(code)) next.delete(code);
        else next.add(code);
        return next;
    });
    const overlays = useMemo(
        () => compare.filter((c) => comparing.has(c.code)).map((c) => ({ ...c, points: c.points.filter((p) => p.date >= range.start && p.date <= range.end) })),
        [compare, comparing, range],
    );

    if (sorted.length === 0) return null;

    return (
        <>
            {/* Chart, with the period buttons that scope everything below */}
            <div id="grafico" className="md:col-span-3 min-w-0 scroll-mt-20">
                <div className={CARD}>
                    <div className="flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between md:p-6">
                        <div className="space-y-1.5">
                            <h3 className={TITLE}>{labels.chartTitle}</h3>
                            <p className={SUBTITLE}>{labels.chartSubtitle}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatRangeLabel(range)} · {slice.length} {slice.length === 1 ? "mês" : "meses"}
                            </p>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                            <PeriodSelector
                                presets={MONTHLY_PRESETS}
                                value={period}
                                onSelect={select}
                                custom={custom}
                                onCustomChange={setCustom}
                                redundant={redundant}
                                bounds={{ start: earliest, end: latest }}
                            />
                            <CompareToggle options={compare} active={comparing} onToggle={toggleCompare} mainLabel={indexCode} mainColor={MAIN_SERIES_COLOR} />
                        </div>
                    </div>
                    <div className="space-y-4 p-3 pt-0 md:p-6 md:pt-0">
                        <PeriodStats summary={summary} format={formatPercent} kind="variation" />
                        <IndexTrendChart points={points} name={indexCode} compare={overlays} />
                    </div>
                </div>
            </div>

            <div id="mapa-calor" className="md:col-span-3 min-w-0 scroll-mt-20">
                <div className={CARD}>
                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                        <h3 className={TITLE}>{labels.heatmapTitle}</h3>
                        <p className={SUBTITLE}>{labels.heatmapSubtitle}</p>
                    </div>
                    <div className="p-3 pt-0 md:p-6 md:pt-0">
                        <IndexHeatmap data={slice} />
                    </div>
                </div>
            </div>

            <div id="tabela" className="md:col-span-3 min-w-0 scroll-mt-20">
                <div className={CARD}>
                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                        <h3 className={TITLE}>{labels.tableTitle}</h3>
                        <p className={SUBTITLE}>{labels.tableSubtitle}</p>
                    </div>
                    <div className="p-3 pt-0 md:p-6 md:pt-0">
                        <IndexHistoryTable data={slice} />
                    </div>
                    <p className="pb-3 text-center text-xs text-muted-foreground md:hidden">{labels.swipeHint}</p>
                </div>
            </div>
        </>
    );
}
