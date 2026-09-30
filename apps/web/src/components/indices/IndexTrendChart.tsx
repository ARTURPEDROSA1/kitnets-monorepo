"use client";

/**
 * The trend chart of an index page: one series over time, drawn the quiet way — a 2px line over a
 * light wash, solid hairline gridlines, no legend (the card title names the series), a crosshair
 * tooltip that snaps to the nearest month, and direct labels only where they earn their place: the
 * last value, the highest and the lowest of the slice. Ticks show months for short windows and
 * years for long ones. Works for monthly rates in % (IPCA, CDI, FipeZAP…) and for levels such as
 * the salário mínimo in R$: `format` writes the values.
 */
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatMonthYear, formatMonthYearShort } from "@/lib/index-period";

export interface TrendPoint {
    /** ISO reference date */
    date: string;
    value: number;
    /** extra lines in the tooltip (e.g. the 12-month accumulated figure) */
    details?: { label: string; value: string }[];
}

interface Props {
    /** any order; sorted inside */
    points: TrendPoint[];
    /** the series name, for the tooltip and the accessible description */
    name: string;
    /** how a value is written; default "1,09%" */
    format?: (value: number) => string;
    /** the series colour; default emerald */
    color?: string;
    /** height classes; default h-[260px] md:h-[340px] */
    className?: string;
}

export const EMERALD = "hsl(160 84% 39%)";

export const formatPercent = (v: number, digits = 2) =>
    `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

const axisPercent = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

interface TooltipProps {
    active?: boolean;
    payload?: Array<{ payload: TrendPoint }>;
    name: string;
    format: (v: number) => string;
    color: string;
}

function TrendTooltip({ active, payload, name, format, color }: TooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0].payload;
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
            <div className="text-muted-foreground">{formatMonthYear(p.date)}</div>
            <div className="mt-0.5 flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
                <span className="text-base font-bold tabular-nums text-foreground">{format(p.value)}</span>
                <span className="text-muted-foreground">{name}</span>
            </div>
            {p.details?.map((d) => (
                <div key={d.label} className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-foreground">{d.value}</span>
                </div>
            ))}
        </div>
    );
}

export function IndexTrendChart({ points, name, format = formatPercent, color = EMERALD, className }: Props) {
    const gradientId = useId();
    const sorted = useMemo(() => [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), [points]);

    const { ticks, tickFormatter, last, max, min, crossesZero } = useMemo(() => {
        if (sorted.length === 0) return { ticks: undefined, tickFormatter: formatMonthYearShort, last: null, max: null, min: null, crossesZero: false };
        const long = sorted.length > 30;
        let ticks: string[] | undefined;
        if (long) {
            // years, thinned so at most ~12 labels share the axis
            const januaries = sorted.filter((p) => p.date.slice(5, 7) === "01").map((p) => p.date);
            const step = Math.max(1, Math.ceil(januaries.length / 12));
            ticks = januaries.filter((_, i) => i % step === 0);
        }
        let max = sorted[0];
        let min = sorted[0];
        for (const p of sorted) {
            if (p.value > max.value) max = p;
            if (p.value < min.value) min = p;
        }
        return {
            ticks,
            tickFormatter: long ? (d: string) => d.slice(0, 4) : formatMonthYearShort,
            last: sorted[sorted.length - 1],
            max,
            min,
            crossesZero: min.value < 0 && max.value > 0,
        };
    }, [sorted]);

    if (sorted.length === 0) {
        return <div className={cn("flex h-[260px] items-center justify-center text-sm text-muted-foreground md:h-[340px]", className)}>Sem dados no período.</div>;
    }

    const description = last
        ? `${name}: ${sorted.length} valores de ${formatMonthYear(sorted[0].date)} a ${formatMonthYear(last.date)}; último ${format(last.value)}`
        : name;
    const labelStyle = { fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" };
    const showExtremes = sorted.length >= 3;

    return (
        <div className={cn("h-[260px] w-full md:h-[340px]", className)} role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sorted} margin={{ top: 18, right: 64, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
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
                        tickFormatter={format === formatPercent ? axisPercent : format}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        domain={["auto", "auto"]}
                    />
                    {crossesZero && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} />}
                    <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.5, strokeWidth: 1 }}
                        content={<TrendTooltip name={name} format={format} color={color} />}
                        isAnimationActive={false}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        name={name}
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{ r: 5, fill: color, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                        animationDuration={450}
                    />
                    {showExtremes && max && max !== last && (
                        <ReferenceDot x={max.date} y={max.value} r={3.5} fill={color} stroke="hsl(var(--card))" strokeWidth={2} ifOverflow="visible"
                            label={{ value: format(max.value), position: "top", ...labelStyle }} />
                    )}
                    {showExtremes && min && min !== last && min !== max && (
                        <ReferenceDot x={min.date} y={min.value} r={3.5} fill={color} stroke="hsl(var(--card))" strokeWidth={2} ifOverflow="visible"
                            label={{ value: format(min.value), position: "bottom", ...labelStyle }} />
                    )}
                    {last && (
                        <ReferenceDot x={last.date} y={last.value} r={5} fill={color} stroke="hsl(var(--card))" strokeWidth={2} ifOverflow="visible"
                            label={{ value: format(last.value), position: "right", ...labelStyle, fill: color }} />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
