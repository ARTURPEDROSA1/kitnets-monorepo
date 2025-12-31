"use client";

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, ComposedChart } from 'recharts';
import { MinimumWageData } from "@/lib/minimum-wage";

interface Props {
    data: MinimumWageData[];
}

export function MinimumWageChart({ data }: Props) {
    const [viewMode, setViewMode] = useState<'line' | 'bar'>('line');

    const chartData = useMemo(() => {
        // Sort by date ascending for chart
        return [...data].sort((a, b) => new Date(a.reference_date).getTime() - new Date(b.reference_date).getTime())
            .map(d => ({
                date: d.reference_date,
                displayDate: new Date(d.reference_date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
                value: d.amount_brl,
                variation: d.variation_percent || 0,
                legislation: d.legislation || ''
            }));
    }, [data]);

    if (!data || data.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex justify-end space-x-2">
                <button
                    onClick={() => setViewMode('line')}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${viewMode === 'line' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                    Evolução (R$)
                </button>
                <button
                    onClick={() => setViewMode('bar')}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${viewMode === 'bar' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                    Reajuste (%)
                </button>
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {viewMode === 'line' ? (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorWage" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="displayDate"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `R$${value}`}
                            />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorWage)"
                            />
                        </AreaChart>
                    ) : (
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <XAxis
                                dataKey="displayDate"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar
                                dataKey="variation"
                                fill="#10b981"
                                radius={[4, 4, 0, 0]}
                                barSize={40}
                            />
                        </ComposedChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { displayDate: string; value: number; variation: number; legislation: string } }[] }) => {
    if (active && payload && payload.length) {
        const item = payload[0].payload;
        return (
            <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                            Data
                        </span>
                        <span className="font-bold text-muted-foreground">
                            {item.displayDate}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                            Valor
                        </span>
                        <span className="font-bold text-emerald-600">
                            R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    {item.variation > 0 && (
                        <div className="flex flex-col col-span-2 border-t pt-2 mt-1">
                            <span className="text-[0.70rem] uppercase text-muted-foreground">
                                Reajuste
                            </span>
                            <span className="font-bold text-emerald-600">
                                +{item.variation}%
                            </span>
                        </div>
                    )}
                    {item.legislation && (
                        <div className="flex flex-col col-span-2 pt-1">
                            <span className="text-[0.65rem] text-muted-foreground italic">
                                {item.legislation}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    return null;
};
