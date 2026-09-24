"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL, fmtPct, rankBy } from "@/lib/fipezap-compare";
import { INK, MUTED, NATIONAL, seriesColor, TICK, TOOLTIP_STYLE } from "./palette";

export interface RankingRow { slug: string; name: string; uf: string | null; value: number | null; isCapital: boolean }

/**
 * Horizontal ranking of the cities (FIPE's "preço médio por cidade" and "variação nas capitais"):
 * the selected city in ink, Brazil as a dashed reference line, compared cities in their colours and
 * everyone else muted. Long lists start collapsed to the extremes plus the selected city.
 */
export function RankingBars({ rows, selected, compare, nationalValue, unit, lang, labels, digits = 2, collapsedAt = 18 }: {
    rows: RankingRow[]; selected: string; compare: string[]; nationalValue: number | null; unit: "pct" | "brl"; lang: string;
    labels: { national: string; showAll: string; showLess: string }; digits?: number; collapsedAt?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const ranked = rankBy(rows.filter(r => r.value !== null), r => r.value);
    const collapsible = ranked.length > collapsedAt;
    let visible = ranked;
    if (collapsible && !expanded) {
        const top = ranked.slice(0, 10), bottom = ranked.slice(-5);
        const own = ranked.find(r => r.slug === selected);
        visible = ranked.filter(r => top.includes(r) || bottom.includes(r) || r === own || compare.includes(r.slug));
    }
    const fmt = (v: number) => (unit === "brl" ? fmtBRL(v, { lang }) : fmtPct(v, { lang, digits }));
    // short labels keep the axis on one line: "S. José dos Campos (SP)"
    const data = visible.map(r => ({ ...r, label: `${r.name.replace(/^São /, "S. ").replace(/^Balneário /, "Bal. ")}${r.uf ? ` (${r.uf})` : ""}` }));
    const height = data.length * 24 + 32;
    const hasNegative = data.some(d => (d.value ?? 0) < 0);

    return (
        <div className="space-y-2">
            <div style={{ height }} role="img" aria-label={data.map(d => `${d.label}: ${fmt(d.value as number)}`).join("; ")}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={4}>
                        <XAxis type="number" hide domain={hasNegative ? ["auto", "auto"] : [0, "auto"]} />
                        <YAxis type="category" dataKey="label" width={168} tick={{ ...TICK, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={TOOLTIP_STYLE} formatter={(value) => [fmt(Number(value)), ""]} labelFormatter={(label) => String(label)} />
                        {nationalValue !== null && <ReferenceLine x={nationalValue} stroke={NATIONAL} strokeDasharray="4 3" label={{ value: `${labels.national} ${fmt(nationalValue)}`, position: "top", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />}
                        {hasNegative && <ReferenceLine x={0} stroke={MUTED} />}
                        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={18}>
                            {data.map(d => <Cell key={d.slug} fill={d.slug === selected ? INK : seriesColor(d.slug, selected, compare)} fillOpacity={d.slug === selected || compare.includes(d.slug) ? 1 : 0.85} />)}
                            <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmt(Number(v))} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} className="tabular-nums" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {collapsible && (
                <div className="text-center">
                    <button type="button" onClick={() => setExpanded(e => !e)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                        {expanded ? labels.showLess : labels.showAll.replace("{n}", String(ranked.length))}
                    </button>
                </div>
            )}
        </div>
    );
}
