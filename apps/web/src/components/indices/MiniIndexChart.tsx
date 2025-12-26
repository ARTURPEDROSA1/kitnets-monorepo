"use client";

import {
    LineChart,
    Line,
    ResponsiveContainer,
    YAxis,
    XAxis
} from "recharts";
import { IndexValue } from "@/lib/indexes";

interface IndexChartProps {
    data: IndexValue[];
    color?: string;
}

export function MiniIndexChart({ data, color = "#2563eb" }: IndexChartProps) {
    // Data comes in descending order (newest first). Recharts needs ascending (oldest first).
    const chartData = [...data].reverse();

    // Find min/max for Y-axis domain to make the chart look dynamic
    const values = chartData.map(d => d.value_percent);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1;

    return (
        <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <XAxis dataKey="reference_date" hide />
                    <YAxis
                        hide
                        domain={[min - padding, max + padding]}
                    />
                    <Line
                        type="monotone"
                        dataKey="value_percent"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
