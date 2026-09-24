"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPoint } from "@/lib/fipezap-cities-server";
import { fmtPct, monthShort } from "@/lib/fipezap-compare";
import { GRID, INK, NATIONAL, TOOLTIP_STYLE } from "./palette";

/** The city profile's small chart: 12-month variation (or annual yield) of the city in ink against Brazil, last five years. */
export function CitySparkline({ city, national, isYield, cityName, nationalLabel, lang, from }: { city: HistoryPoint[]; national: HistoryPoint[]; isYield: boolean; cityName: string; nationalLabel: string; lang: string; from: string }) {
    const pick = (p: HistoryPoint) => (isYield ? p.yieldAnual : p.var12m);
    const months = new Map<string, { month: string; cidade: number | null; brasil: number | null }>();
    for (const p of city) if (p.month >= from) months.set(p.month, { month: p.month, cidade: pick(p), brasil: null });
    for (const p of national) if (p.month >= from) { const r = months.get(p.month) ?? { month: p.month, cidade: null, brasil: null }; r.brasil = pick(p); months.set(p.month, r); }
    const data = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    return (
        <div className="h-[120px] w-full" role="img" aria-label={`${cityName} vs ${nationalLabel}`}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <XAxis dataKey="month" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(m) => monthShort(String(m), lang)} formatter={(value, name) => [fmtPct(Number(value), { lang, digits: 1, sign: !isYield }), name === "cidade" ? cityName : nationalLabel]} />
                    {!isYield && <ReferenceLine y={0} stroke={GRID} />}
                    <Line type="monotone" dataKey="brasil" name="brasil" stroke={NATIONAL} strokeDasharray="4 3" strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls />
                    <Line type="monotone" dataKey="cidade" name="cidade" stroke={INK} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
