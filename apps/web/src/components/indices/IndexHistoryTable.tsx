"use client";

import { useState } from "react";
import { IndexValue } from "@/lib/indexes";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexHistoryTableProps {
    data: IndexValue[];
}

type SortConfig = {
    key: keyof IndexValue;
    direction: 'asc' | 'desc';
};

export function IndexHistoryTable({ data }: IndexHistoryTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'reference_date', direction: 'desc' });

    const toggleSort = (key: keyof IndexValue) => {
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

    const renderSortIcon = (columnKey: keyof IndexValue) => {
        if (sortConfig.key !== columnKey) {
            return <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
        }
        return sortConfig.direction === 'asc' ? (
            <ChevronUp className="ml-2 h-4 w-4 text-foreground" />
        ) : (
            <ChevronDown className="ml-2 h-4 w-4 text-foreground" />
        );
    };

    const renderHeaderCell = (label: string, columnKey: keyof IndexValue, className?: string) => (
        <th
            className={cn(
                "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50 transition-colors select-none group",
                className
            )}
            onClick={() => toggleSort(columnKey)}
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
                        {renderHeaderCell("Mês/Ano", "reference_date", "min-w-[100px]")}
                        {renderHeaderCell("Índice no Mês (%)", "value_percent")}
                        {renderHeaderCell("Acumulado 12m (%)", "accumulated_12m")}
                        {renderHeaderCell("Acumulado no Ano (%)", "accumulated_year")}
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {sortedData.map((row) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 font-medium">
                                {row.month.toString().padStart(2, '0')}/{row.year}
                            </td>
                            <td className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${row.value_percent < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {row.value_percent > 0 ? '+' : ''}{row.value_percent}%
                            </td>
                            <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                                {row.accumulated_12m !== null ? `${row.accumulated_12m}%` : '-'}
                            </td>
                            <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                                {row.accumulated_year !== null ? `${row.accumulated_year}%` : '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
