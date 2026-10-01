"use client";

/**
 * Several indexes on one chart (the Panorama): plain 2px lines in the colours of lib/index-compare.ts,
 * solid hairline gridlines, a zero line when any series crosses zero, a crosshair tooltip listing
 * every visible series at that month, and the index name at the end of each line — pushed apart when
 * two ends would print on top of each other — so identity never rests on colour alone. All values
 * are monthly rates in %, one axis.
 */
import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatMonthYear, formatMonthYearShort, type SeriesPoint } from "@/lib/index-period";
import { formatPercent } from "./IndexTrendChart";

export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    /** any order; already cut to the period shown */
    points: SeriesPoint[];
}

interface Props {
    series: ChartSeries[];
    className?: string;
}

/** the plot's drawable height on desktop (container minus margins and the date axis), for label spacing */
const PLOT_HEIGHT_PX = 290;
const LABEL_GAP_PX = 13;

const axisPercent = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dataKey = (key: string) => `v_${key}`;
const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

interface Row {
    date: string;
    [key: string]: unknown;
}

function MultiTooltip({ active, payload, series }: { active?: boolean; payload?: Array<{ payload: Row }>; series: ChartSeries[] }) {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    const lines = series
        .map((s) => ({ ...s, value: row[dataKey(s.key)] }))
        .filter((s): s is ChartSeries & { value: number } => typeof s.value === "number")
        .sort((a, b) => b.value - a.value);
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
            <div className="mb-1 text-muted-foreground">{formatMonthYear(row.date)}</div>
            {lines.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                    <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                    <span className="w-16 text-right font-semibold tabular-nums text-foreground">{formatPercent(s.value)}</span>
                    <span className="text-muted-foreground">{s.label}</span>
                </div>
            ))}
        </div>
    );
}

interface EndLabel {
    key: string;
    label: string;
    color: string;
    date: string;
    value: number;
    /** vertical nudge in px so neighbouring labels do not overlap */
    dy: number;
}

export function MultiIndexChart({ series, className }: Props) {
    const rows = useMemo<Row[]>(() => {
        const map = new Map<string, Row>();
        for (const s of series) {
            for (const p of s.points) {
                const row = map.get(p.date) ?? { date: p.date };
                row[dataKey(s.key)] = p.value;
                map.set(p.date, row);
            }
        }
        return [...map.values()].sort(byDate);
    }, [series]);

    const { ticks, tickFormatter, crossesZero, endLabels } = useMemo(() => {
        if (rows.length === 0) return { ticks: undefined, tickFormatter: formatMonthYearShort, crossesZero: false, endLabels: [] as EndLabel[] };
        const long = rows.length > 30;
        let ticks: string[] | undefined;
        if (long) {
            const januaries = rows.filter((r) => r.date.slice(5, 7) === "01").map((r) => r.date);
            const step = Math.max(1, Math.ceil(januaries.length / 12));
            ticks = januaries.filter((_, i) => i % step === 0);
        }
        let lowest = Infinity;
        let highest = -Infinity;
        const ends: EndLabel[] = [];
        for (const s of series) {
            const sorted = [...s.points].sort(byDate);
            for (const p of sorted) {
                if (p.value < lowest) lowest = p.value;
                if (p.value > highest) highest = p.value;
            }
            const end = sorted[sorted.length - 1];
            if (end) ends.push({ key: s.key, label: s.label, color: s.color, date: end.date, value: end.value, dy: 0 });
        }
        // push the end labels apart: top to bottom, each at least LABEL_GAP_PX under the one above
        const span = highest - lowest || 1;
        const toPx = (v: number) => ((highest - v) / span) * PLOT_HEIGHT_PX;
        ends.sort((a, b) => b.value - a.value);
        let floor = -Infinity;
        for (const e of ends) {
            const natural = toPx(e.value);
            const placed = Math.max(natural, floor);
            e.dy = placed - natural;
            floor = placed + LABEL_GAP_PX;
        }
        return {
            ticks,
            tickFormatter: long ? (d: string) => d.slice(0, 4) : formatMonthYearShort,
            crossesZero: lowest < 0 && highest > 0,
            endLabels: ends,
        };
    }, [rows, series]);

    if (series.length === 0 || rows.length === 0) {
        return <div className={cn("flex h-[260px] items-center justify-center text-sm text-muted-foreground md:h-[340px]", className)}>Marque ao menos um índice.</div>;
    }

    const surface = "hsl(var(--card))";
    const description = `${series.map((s) => s.label).join(", ")}: ${rows.length} meses de ${formatMonthYear(rows[0].date)} a ${formatMonthYear(rows[rows.length - 1].date)}`;

    return (
        <div className={cn("h-[260px] w-full md:h-[340px]", className)} role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 12, right: 112, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.7} />
                    <XAxis
                        dataKey="date"
                        ticks={ticks}
                        tickFormatter={tickFormatter}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={28}
                        interval={ticks ? 0 : "preserveStartEnd"}
                    />
                    <YAxis
                        tickFormatter={axisPercent}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        domain={["auto", "auto"]}
                        padding={{ top: 6, bottom: 6 }}
                    />
                    {crossesZero && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} />}
                    <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.5, strokeWidth: 1 }}
                        content={<MultiTooltip series={series} />}
                        isAnimationActive={false}
                    />
                    {series.map((s) => (
                        <Line
                            key={s.key}
                            type="monotone"
                            dataKey={dataKey(s.key)}
                            name={s.label}
                            stroke={s.color}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            dot={false}
                            activeDot={{ r: 4, fill: s.color, stroke: surface, strokeWidth: 2 }}
                            connectNulls={false}
                            animationDuration={450}
                        />
                    ))}
                    {endLabels.map((e) => (
                        <ReferenceDot
                            key={`end-${e.key}`}
                            x={e.date}
                            y={e.value}
                            r={4}
                            fill={e.color}
                            stroke={surface}
                            strokeWidth={2}
                            ifOverflow="visible"
                            label={{
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                content: (props: any) => {
                                    const box = props.viewBox ?? {};
                                    const cx = (box.x ?? 0) + (box.width ?? 0) / 2;
                                    const cy = (box.y ?? 0) + (box.height ?? 0) / 2;
                                    return (
                                        <text x={cx + 9} y={cy + e.dy + 3.5} fontSize={11} fontWeight={600} fill={e.color}>
                                            {e.label}
                                        </text>
                                    );
                                },
                            }}
                        />
                    ))}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
