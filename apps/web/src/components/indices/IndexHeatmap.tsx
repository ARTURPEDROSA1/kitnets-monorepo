"use client";

import { useMemo } from 'react';
import { IndexValue } from '@/lib/indexes';

interface Props {
    data: IndexValue[];
}

export function IndexHeatmap({ data }: Props) {
    // Process data into year-month structure
    const processedData = useMemo(() => {
        if (!data || data.length === 0) return { years: [], map: {}, yearAccumulated: {} };

        // We want all years present in the data
        const years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => b - a);
        const map: Record<number, Record<number, number>> = {};
        const yearAccumulated: Record<number, number> = {};

        data.forEach(item => {
            if (!map[item.year]) map[item.year] = {};
            map[item.year][item.month] = item.value_percent;
        });

        // Calculate YTD (Year to Date) for each year
        // Note: This is an approximation based on the data available. 
        // If a year is incomplete in the data, it calculates based on what's physically there.
        years.forEach(year => {
            const yearData = data.filter(d => d.year === year).sort((a, b) => a.month - b.month);

            // Compound interest calculation: (1 + m1) * (1 + m2) ... - 1
            let acc = 1;
            yearData.forEach(d => {
                acc *= (1 + (d.value_percent / 100));
            });
            yearAccumulated[year] = (acc - 1) * 100;
        });

        return { years, map, yearAccumulated };
    }, [data]);

    const getColors = (value: number) => {
        // Simple color scale for monthly variation
        if (value >= 1.0) return 'bg-emerald-600 text-white';
        if (value >= 0.5) return 'bg-emerald-500 text-white';
        if (value > 0) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300';
        if (value === 0) return 'bg-muted text-muted-foreground';
        if (value > -0.5) return 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-300';
        return 'bg-red-500 text-white';
    };

    const formatValue = (val: number | undefined) => {
        if (val === undefined) return '-';
        return `${val.toFixed(2)}%`;
    };

    const months = [
        { num: 1, label: 'Jan' }, { num: 2, label: 'Fev' }, { num: 3, label: 'Mar' },
        { num: 4, label: 'Abr' }, { num: 5, label: 'Mai' }, { num: 6, label: 'Jun' },
        { num: 7, label: 'Jul' }, { num: 8, label: 'Ago' }, { num: 9, label: 'Set' },
        { num: 10, label: 'Out' }, { num: 11, label: 'Nov' }, { num: 12, label: 'Dez' }
    ];

    if (data.length === 0) {
        return <div className="p-6 text-center text-muted-foreground">Sem dados históricos disponíveis para gerar o mapa de calor.</div>;
    }

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
                <thead>
                    <tr>
                        <th className="p-3 text-left font-medium text-muted-foreground border-b min-w-[60px]">Ano</th>
                        {months.map(m => (
                            <th key={m.num} className="p-2 font-medium text-muted-foreground border-b min-w-[50px]">{m.label}</th>
                        ))}
                        <th className="p-3 font-bold text-muted-foreground border-b min-w-[70px]">Acum.</th>
                    </tr>
                </thead>
                <tbody className="divide-y text-slate-700 dark:text-slate-300">
                    {processedData.years.map(year => (
                        <tr key={year} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-left font-semibold">{year}</td>
                            {months.map(m => {
                                const val = processedData.map[year]?.[m.num];
                                return (
                                    <td key={m.num} className="p-1">
                                        {val !== undefined ? (
                                            <div
                                                className={`rounded py-1.5 w-full h-full flex items-center justify-center text-xs font-medium transition-all ${getColors(val)}`}
                                                title={`${m.label}/${year}: ${val}%`}
                                            >
                                                {val.toFixed(2)}%
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground/30 text-xs">-</span>
                                        )}
                                    </td>
                                );
                            })}
                            <td className={`p-3 font-bold text-sm ${processedData.yearAccumulated[year] < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {formatValue(processedData.yearAccumulated[year])}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
