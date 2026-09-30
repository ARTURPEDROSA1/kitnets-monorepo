"use client";

/**
 * The small chart of a Panorama card: the last months of an index as a sparkline in the house
 * style — a 2px line over a light wash, no axes, a hairline at zero when the series crosses it,
 * the last point marked, and a tooltip with the month and the value. Values are monthly rates in %
 * or, for the salário mínimo, amounts in R$ (`unit`). Same colour for every card: the line shows
 * the trend, the figures under it say whether it is high or low.
 */
import { useId, useMemo } from "react";
import { Area, ComposedChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndexValue } from "@/lib/indexes";
import { MAIN_SERIES_COLOR } from "@/lib/index-compare";
import { formatMonthYear } from "@/lib/index-period";

interface Props {
    /** newest first or oldest first, both fine */
    data: IndexValue[];
    unit?: "%" | "BRL";
    color?: string;
}

interface Row {
    date: string;
    value: number;
}

const formatValue = (v: number, unit: "%" | "BRL") =>
    unit === "BRL"
        ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function MiniTooltip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: Row }>; unit: "%" | "BRL" }) {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    return (
        <div className="rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md">
            <span className="text-muted-foreground">{formatMonthYear(row.date)}</span>
            <span className="ml-2 font-semibold tabular-nums text-foreground">{formatValue(row.value, unit)}</span>
        </div>
    );
}

export function MiniIndexChart({ data, unit = "%", color = MAIN_SERIES_COLOR }: Props) {
    const gradientId = useId();
    const rows = useMemo<Row[]>(
        () => data
            .map((d) => ({ date: d.reference_date, value: Number(d.value_percent) }))
            .filter((r) => Number.isFinite(r.value))
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        [data],
    );

    const { domain, last, crossesZero } = useMemo(() => {
        if (rows.length === 0) return { domain: undefined, last: null, crossesZero: false };
        let min = rows[0].value;
        let max = rows[0].value;
        for (const r of rows) {
            if (r.value < min) min = r.value;
            if (r.value > max) max = r.value;
        }
        const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 0.1;
        return { domain: [min - pad, max + pad] as [number, number], last: rows[rows.length - 1], crossesZero: min < 0 && max > 0 };
    }, [rows]);

    if (rows.length === 0) {
        return <div className="flex h-[110px] w-full items-center justify-center text-xs text-muted-foreground">Sem dados</div>;
    }

    const surface = "hsl(var(--card))";
    const description = `${rows.length} valores de ${formatMonthYear(rows[0].date)} a ${formatMonthYear(last!.date)}; último ${formatValue(last!.value, unit)}`;

    return (
        <div className="h-[110px] w-full" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={domain} />
                    {crossesZero && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />}
                    <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.5, strokeWidth: 1 }}
                        content={<MiniTooltip unit={unit} />}
                        isAnimationActive={false}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{ r: 4, fill: color, stroke: surface, strokeWidth: 2 }}
                        animationDuration={450}
                    />
                    {last && <ReferenceDot x={last.date} y={last.value} r={3.5} fill={color} stroke={surface} strokeWidth={2} ifOverflow="visible" />}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
