"use client";

import { useMemo, useState } from 'react';
import { IndexValue } from '@/lib/indexes';
import { ChevronDown, ChevronUp } from 'lucide-react';

const INITIAL_YEARS = 5;

interface Props {
    data: IndexValue[];
}

export function IndexHeatmap({ data }: Props) {
    const [showAll, setShowAll] = useState(false);

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
        if (value < -0.5) return 'bg-emerald-500 text-white';
        if (value < -0.1) return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-300';
        if (value >= -0.1 && value <= 0.1) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        if (value > 0.5) return 'bg-red-400 text-white dark:bg-red-600';
        if (value > 0.1) return 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-300';

        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
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

    const totalYears = processedData.years.length;
    const displayedYears = showAll ? processedData.years : processedData.years.slice(0, INITIAL_YEARS);
    const hasMore = totalYears > INITIAL_YEARS;

    return (
        <div className="w-full space-y-2">
            <div className="overflow-x-auto relative">
                <table className="w-full text-sm text-center border-collapse">
                    <thead>
                        <tr>
                            <th className="p-3 text-left font-medium text-muted-foreground border-b min-w-[60px] sticky left-0 bg-card z-30">Ano</th>
                            <th className="p-3 font-bold text-muted-foreground border-b min-w-[70px] sticky left-[60px] bg-card z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Acum.</th>
                            {months.map(m => (
                                <th key={m.num} className="p-2 font-medium text-muted-foreground border-b min-w-[50px]">{m.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700 dark:text-slate-300">
                        {displayedYears.map(year => (
                            <tr key={year} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3 text-left font-semibold sticky left-0 bg-card z-30">{year}</td>
                                <td className={`p-3 font-bold text-sm sticky left-[60px] bg-card z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${processedData.yearAccumulated[year] < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {formatValue(processedData.yearAccumulated[year])}
                                </td>
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {hasMore && (
                <div className="flex justify-center pt-1 pb-1">
                    <button
                        type="button"
                        onClick={() => setShowAll(!showAll)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground
                            rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground
                            transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        {showAll ? (
                            <>
                                <ChevronUp className="h-3.5 w-3.5" />
                                Recolher
                            </>
                        ) : (
                            <>
                                <ChevronDown className="h-3.5 w-3.5" />
                                Ver todos ({totalYears} anos)
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
