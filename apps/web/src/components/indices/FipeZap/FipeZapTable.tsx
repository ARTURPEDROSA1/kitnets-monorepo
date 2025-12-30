"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { FipeZapDataPoint } from "@/lib/fipezap";

interface FipeZapTableProps {
    data: FipeZapDataPoint[];
}

export function FipeZapTable({ data }: FipeZapTableProps) {
    const handleExport = () => {
        const headers = ["Data", "Tipo", "Dormitórios", "Variação Mensal (%)", "Acumulado 12m (%)", "Acumulado Ano (%)"];
        const csvContent = [
            headers.join(","),
            ...data.map(row => [
                `${row.month}/${row.year}`,
                row.type,
                row.bedrooms,
                row.value_percent,
                row.accumulated_12m || '',
                row.accumulated_year || ''
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "fipezap_historico.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between p-3 md:p-6 pb-4">
                <div className="space-y-1 mb-3 md:mb-0">
                    <h3 className="text-lg md:text-xl font-semibold">Série Histórica Detalhada</h3>
                    <p className="text-sm text-muted-foreground">Dados completos com paginação e exportação</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                </Button>
            </div>
            <div className="p-0 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="sticky left-0 bg-card z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[100px]">Data</TableHead>
                            <TableHead className="whitespace-nowrap">Tipo</TableHead>
                            <TableHead className="whitespace-nowrap">Dormitórios</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Variação Mensal</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Acumulado 12m</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Acumulado Ano</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {[...data].reverse().slice(0, 12).map((row, idx) => ( // Showing top 12 for simplicity
                            <TableRow key={idx}>
                                <TableCell className="font-medium sticky left-0 bg-card z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                    {String(row.month).padStart(2, '0')}/{row.year}
                                </TableCell>
                                <TableCell className="capitalize whitespace-nowrap">{row.type}</TableCell>
                                <TableCell className="whitespace-nowrap">{row.bedrooms === 'todos' ? 'Todos' : row.bedrooms}</TableCell>
                                <TableCell className="text-right text-primary font-semibold whitespace-nowrap">
                                    {row.value_percent.toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                    {row.accumulated_12m ? `${row.accumulated_12m.toFixed(2)}%` : '--'}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                    {row.accumulated_year ? `${row.accumulated_year.toFixed(2)}%` : '--'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="p-4 text-center text-xs text-muted-foreground border-t">
                    Exibindo os últimos 12 registros. Exporte para ver tudo.
                </div>
            </div>
        </div>
    );
}
