"use client";

import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BucketFigures } from "@/lib/fipezap-cities-server";
import type { FipezapDorm } from "@/lib/fipezap-import";
import { fmtBRL, fmtPct } from "@/lib/fipezap-compare";
import { INK, MUTED, NATIONAL, TICK, TOOLTIP_STYLE } from "./palette";

export interface BedroomLabels { total: string; d1: string; d2: string; d3: string; d4: string; national: string; month: string; ytd: string; m12: string; price: string; yield: string }

const ORDER: FipezapDorm[] = ["total", "1", "2", "3", "4"];

/**
 * FIPE's bedroom slide as small multiples: one mini chart per figure (month, year, 12 months,
 * price per m²), each with the national bucket in grey next to the city's in ink.
 */
export function FipezapBedroomBars({ national, city, cityName, isYield, lang, labels }: { national: BucketFigures[]; city: BucketFigures[] | null; cityName: string | null; isYield: boolean; lang: string; labels: BedroomLabels }) {
    const dormLabel = (d: FipezapDorm) => (d === "total" ? labels.total : labels[`d${d}` as "d1"]);
    const metrics: Array<{ key: keyof BucketFigures; title: string; unit: "pct" | "brl" }> = isYield
        ? [{ key: "yieldAnual", title: labels.yield, unit: "pct" }, { key: "precoM2", title: labels.price, unit: "brl" }, { key: "var12m", title: labels.m12, unit: "pct" }, { key: "ytd", title: labels.ytd, unit: "pct" }]
        : [{ key: "varMensal", title: labels.month, unit: "pct" }, { key: "ytd", title: labels.ytd, unit: "pct" }, { key: "var12m", title: labels.m12, unit: "pct" }, { key: "precoM2", title: labels.price, unit: "brl" }];
    const fmt = (v: number | null, unit: "pct" | "brl") => (v === null ? "–" : unit === "brl" ? fmtBRL(v, { lang }) : fmtPct(v, { lang, digits: unit === "pct" && Math.abs(v) >= 10 ? 1 : 2 }));
    const showCity = Boolean(city && city.length > 1);

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(m => {
                const data = ORDER.filter(d => national.some(b => b.dorm === d) || city?.some(b => b.dorm === d)).map(d => ({
                    dorm: dormLabel(d),
                    nacional: national.find(b => b.dorm === d)?.[m.key] as number | null ?? null,
                    cidade: showCity ? (city!.find(b => b.dorm === d)?.[m.key] as number | null ?? null) : null,
                }));
                return (
                    <div key={m.key} className="rounded-lg border border-border/60 p-2">
                        <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">{m.title}</p>
                        <div className="h-[170px]" role="img" aria-label={`${m.title}: ${data.map(d => `${d.dorm} ${fmt(showCity ? d.cidade : d.nacional, m.unit)}`).join(", ")}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="25%">
                                    <XAxis dataKey="dorm" tick={TICK} tickLine={false} axisLine={false} interval={0} />
                                    <YAxis hide domain={m.unit === "brl" ? [0, "auto"] : ["auto", "auto"]} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} formatter={(value, name) => [fmt(Number(value), m.unit), name === "nacional" ? labels.national : cityName ?? ""]} />
                                    {m.unit === "pct" && <ReferenceLine y={0} stroke={MUTED} />}
                                    <Bar dataKey="nacional" name="nacional" fill={NATIONAL} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={22}>
                                        {!showCity && <LabelList dataKey="nacional" position="top" formatter={(v: unknown) => (v === null || v === undefined ? "" : fmt(Number(v), m.unit))} style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />}
                                    </Bar>
                                    {showCity && (
                                        <Bar dataKey="cidade" name="cidade" fill={INK} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={22}>
                                            <LabelList dataKey="cidade" position="top" formatter={(v: unknown) => (v === null || v === undefined ? "" : fmt(Number(v), m.unit))} style={{ fontSize: 9, fill: "hsl(var(--foreground))" }} />
                                        </Bar>
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
