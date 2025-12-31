"use client";

import { useMemo } from 'react';
import { MinimumWageData } from "@/lib/minimum-wage";

interface Props {
    data: MinimumWageData[];
}

export function MinimumWageHeatmap({ data }: Props) {
    const processedData = useMemo(() => {
        if (!data || data.length === 0) return { years: [], map: {} };

        // Get all unique years
        const years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => b - a);
        const map: Record<number, Record<number, number>> = {};

        data.forEach(item => {
            if (item.variation_percent !== null) {
                if (!map[item.year]) map[item.year] = {};
                map[item.year][item.month] = item.variation_percent;
            }
        });

        return { years, map };
    }, [data]);

    const getColors = (value: number) => {
        // Verde claro → reajuste baixo (< 5%)
        // Verde médio → reajuste moderado (5% - 10%)
        // Verde escuro → reajuste elevado (> 10%)
        if (value < 5) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
        if (value < 10) return 'bg-emerald-300 text-emerald-900 dark:bg-emerald-700 dark:text-emerald-100';
        return 'bg-emerald-600 text-white dark:bg-emerald-500';
    };

    const months = [
        { num: 1, label: 'Jan' }, { num: 2, label: 'Fev' }, { num: 3, label: 'Mar' },
        { num: 4, label: 'Abr' }, { num: 5, label: 'Mai' }, { num: 6, label: 'Jun' },
        { num: 7, label: 'Jul' }, { num: 8, label: 'Ago' }, { num: 9, label: 'Set' },
        { num: 10, label: 'Out' }, { num: 11, label: 'Nov' }, { num: 12, label: 'Dez' }
    ];

    if (data.length === 0) {
        return <div className="p-6 text-center text-muted-foreground">Sem dados disponíveis.</div>;
    }

    return (
        <div className="w-full overflow-x-auto relative">
            <table className="w-full text-sm text-center border-collapse">
                <thead>
                    <tr>
                        <th className="p-3 text-left font-medium text-muted-foreground border-b min-w-[60px] sticky left-0 bg-card z-30">Ano</th>
                        {months.map(m => (
                            <th key={m.num} className="p-2 font-medium text-muted-foreground border-b min-w-[50px]">{m.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y text-slate-700 dark:text-slate-300">
                    {processedData.years.map(year => (
                        <tr key={year} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-left font-semibold sticky left-0 bg-card z-30">{year}</td>
                            {months.map(m => {
                                const val = processedData.map[year]?.[m.num];
                                return (
                                    <td key={m.num} className="p-1">
                                        {val !== undefined ? (
                                            <div
                                                className={`rounded py-1.5 w-full h-full flex items-center justify-center text-xs font-bold transition-all ${getColors(val)}`}
                                                title={`${m.label}/${year}: +${val}%`}
                                            >
                                                {val.toFixed(1)}%
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground/10 text-xs">•</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
