"use client";

import { IndexValue } from "@/lib/indexes";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

interface IndexChartProps {
    data: IndexValue[];
    indexCode: string;
}

export function IndexChart({ data, indexCode }: IndexChartProps) {
    // Sort data ascending for chart
    const chartData = [...data]
        .sort((a, b) => new Date(a.reference_date).getTime() - new Date(b.reference_date).getTime())
        .map((item) => ({
            ...item,
            dateFormatted: `${item.month}/${item.year}`,
            percentage: Number(item.value_percent), // Ensure number
        }));

    return (
        <div className="h-[350px] w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                        dataKey="dateFormatted"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--card-foreground))'
                        }}
                        formatter={(value: number | string | undefined) => [`${value}%`, indexCode]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Line
                        type="monotone"
                        dataKey="percentage"
                        name={indexCode}
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
