"use client";

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface ConsumptionChartProps {
    data: any[];
    dataKey?: string;
    unit?: string;
    color?: string;
    loading?: boolean;
    height?: number;
    onClick?: (data: any) => void;
}

const CustomTooltip = ({ active, payload, label, unit }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background border border-border p-3 rounded-lg shadow-lg text-sm">
                <p className="font-medium text-foreground mb-1">{label}</p>
                <p className="text-primary font-bold">
                    {payload[0].value} {unit}
                </p>
            </div>
        );
    }
    return null;
};

export function ConsumptionChart({
    data,
    dataKey = "consumption",
    unit = "L",
    color = "#3b82f6",
    loading = false,
    height = 350,
    onClick
}: ConsumptionChartProps) {

    if (loading) {
        return (
            <div className={`w-full bg-muted/10 rounded animate-pulse flex items-center justify-center`} style={{ height }}>
                <span className="text-muted-foreground text-sm">Carregando dados...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className={`w-full bg-muted/10 rounded flex items-center justify-center border border-dashed border-border`} style={{ height }}>
                <span className="text-muted-foreground text-sm">Sem dados para o período selecionado</span>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                <BarChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                    onClick={onClick ? (e: any) => e && e.activePayload && onClick(e.activePayload[0].payload) : undefined}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                        dataKey="date_label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ fill: 'hsl(var(--muted) / 0.2)' }} />
                    <Bar
                        dataKey={dataKey}
                        fill={color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={50}
                        style={{ cursor: onClick ? 'pointer' : 'default' }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
