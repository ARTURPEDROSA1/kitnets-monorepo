"use client";

import { useState } from "react";
import { IndexValue } from "@/lib/indexes";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronsDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexHistoryTableProps {
    data: IndexValue[];
}

type SortConfig = {
    key: keyof IndexValue;
    direction: 'asc' | 'desc';
};

const PAGE_SIZE = 12;

export function IndexHistoryTable({ data }: IndexHistoryTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'reference_date', direction: 'desc' });
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

    const displayedData = sortedData.slice(0, visibleCount);
    const totalRows = sortedData.length;
    const hasMore = visibleCount < totalRows;
    const isShowingAll = visibleCount >= totalRows;

    const handleShowMore = () => {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalRows));
    };

    const handleShowAll = () => {
        setVisibleCount(totalRows);
    };

    const handleCollapse = () => {
        setVisibleCount(PAGE_SIZE);
    };

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
                "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-muted/50 transition-colors select-none group focus:outline-none focus:bg-muted/50",
                className
            )}
            onClick={() => toggleSort(columnKey)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSort(columnKey);
                }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Ordenar por ${label}`}
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
                <caption className="sr-only">Tabela de Histórico de Índices Econômicos</caption>
                <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        {renderHeaderCell("Mês/Ano", "reference_date", "min-w-[100px]")}
                        {renderHeaderCell("Índice no Mês (%)", "value_percent")}
                        {renderHeaderCell("Acumulado 12m (%)", "accumulated_12m")}
                        {renderHeaderCell("Acumulado no Ano (%)", "accumulated_year")}
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {displayedData.map((row) => (
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

            {/* Expand / Collapse controls */}
            {totalRows > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 pt-3 pb-1 border-t">
                    {hasMore ? (
                        <>
                            <button
                                type="button"
                                onClick={handleShowMore}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground
                                    rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground
                                    transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                                title={`Mostrar mais ${Math.min(PAGE_SIZE, totalRows - visibleCount)} meses`}
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                                Mais {Math.min(PAGE_SIZE, totalRows - visibleCount)}
                            </button>
                            <button
                                type="button"
                                onClick={handleShowAll}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground
                                    rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground
                                    transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                                title={`Mostrar todos os ${totalRows} meses`}
                            >
                                <ChevronsDown className="h-3.5 w-3.5" />
                                Todos ({totalRows})
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCollapse}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground
                                rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground
                                transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                            title="Recolher tabela"
                        >
                            <ChevronUp className="h-3.5 w-3.5" />
                            Recolher
                        </button>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                        {Math.min(visibleCount, totalRows)} de {totalRows}
                    </span>
                </div>
            )}
        </div>
    );
}
