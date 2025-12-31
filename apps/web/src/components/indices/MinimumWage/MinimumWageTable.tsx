"use client";

import { useState } from "react";
import { MinimumWageData } from "@/lib/minimum-wage";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    data: MinimumWageData[];
}

type SortConfig = {
    key: keyof MinimumWageData;
    direction: 'asc' | 'desc';
};

export function MinimumWageTable({ data }: Props) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'reference_date', direction: 'desc' });

    const toggleSort = (key: keyof MinimumWageData) => {
        setSortConfig((current) => ({
            key,
            direction:
                current.key === key && current.direction === 'desc'
                    ? 'asc'
                    : 'desc',
        }));
    };

    const sortedData = [...data].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    const renderSortIcon = (columnKey: keyof MinimumWageData) => {
        if (sortConfig.key !== columnKey) {
            return <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
        }
        return sortConfig.direction === 'asc' ? (
            <ChevronUp className="ml-2 h-4 w-4 text-foreground" />
        ) : (
            <ChevronDown className="ml-2 h-4 w-4 text-foreground" />
        );
    };

    const renderHeaderCell = (label: string, columnKey: keyof MinimumWageData, className?: string) => (
        <th
            className={cn(
                "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50 transition-colors select-none group focus:outline-none focus:bg-muted/50",
                className
            )}
            onClick={() => toggleSort(columnKey)}
            role="button"
        >
            <div className="flex items-center">
                {label}
                {renderSortIcon(columnKey)}
            </div>
        </th>
    );

    return (
        <div className="w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        {renderHeaderCell("Data Início", "reference_date", "min-w-[120px]")}
                        {renderHeaderCell("Valor (R$)", "amount_brl")}
                        {renderHeaderCell("Reajuste (%)", "variation_percent")}
                        {renderHeaderCell("Legislação", "legislation")}
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {sortedData.map((row) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <td className="p-4 align-middle font-medium">
                                {new Date(row.reference_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                            </td>
                            <td className="p-4 align-middle font-bold text-foreground">
                                R$ {row.amount_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 align-middle">
                                {row.variation_percent !== null ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                                        +{row.variation_percent.toLocaleString('pt-BR')}%
                                    </span>
                                ) : '-'}
                            </td>
                            <td className="p-4 align-middle text-muted-foreground">
                                {row.legislation || '-'}
                                {row.is_projection && <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Projeção</span>}
                                {row.remarks && (
                                    <div className="text-xs text-muted-foreground mt-1 italic">
                                        (* {row.remarks})
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
