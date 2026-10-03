"use client";

/**
 * The Panorama calculator's answers as a spreadsheet, the same machinery as the energy and water
 * history tables: click a header to sort and filter (right-click: hide columns), select cells to sum,
 * move between cells with the arrow keys. One row per index: the corrected amount, the correction in
 * R$, the variation and the month the correction ran to (an index whose data stops before the end
 * date is applied up to its last month).
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PANORAMA_MIN_WAGE_KEY, PANORAMA_SERIES } from "@/lib/index-compare";
import { addMonths, formatDateBR, lastDayOfMonth, monthOf } from "@/lib/index-correction";
import { formatMonthYear } from "@/lib/index-period";
import { columnTableKey } from "@/lib/ui-preferences";
import { CellSumBar, useCellSum } from "@/components/properties/TableCellSum";
import { useColumnWidths } from "@/components/properties/TableColumnWidths";
import { ColumnHeaders, ColumnMenu, FilterChips, useColumnFilters, type ColumnDef } from "@/components/properties/TableColumnFilters";
import { ColumnVisibilityMenu, useColumnVisibility } from "@/components/properties/TableColumnVisibility";
import { computeCorrection, formatBRL, type Correction } from "./panorama-correction";

interface ResultRow {
    key: string;
    index: string;
    corrected: number | null;
    gain: number | null;
    percent: number | null;
    /** "YYYY-MM" the correction ran from and to (the series' own bounds when it is shorter than the period) */
    from: string | null;
    through: string | null;
    /** why there is no figure */
    note: string | null;
}

const TABLE_KEY = columnTableKey("panorama-results");
const formatPercent = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function PanoramaResultsTable({ applied }: { applied: Correction }) {
    const rows = useMemo<ResultRow[]>(() => {
        // the first month the correction applies: the start date's own month when days of it remain
        // (the start day is not counted), otherwise the next one
        const s = monthOf(applied.start);
        const startMonth = applied.start >= lastDayOfMonth(s) ? addMonths(s, 1) : s;
        const endMonth = monthOf(applied.end);
        const specs = [
            ...PANORAMA_SERIES.filter((s) => s.key !== "FIPEZAPYIELD").map((s) => ({ key: s.key, label: s.label, kind: "variation" as const })),
            { key: PANORAMA_MIN_WAGE_KEY, label: "Salário Mínimo", kind: "level" as const },
        ];
        const out: ResultRow[] = [];
        for (const s of specs) {
            const r = computeCorrection(applied, s.key, s.kind);
            if (r === null) continue;
            if ("corrected" in r) {
                out.push({ key: s.key, index: s.label, corrected: r.corrected, gain: r.corrected - applied.value, percent: r.percent, from: r.fromMonth ?? startMonth, through: r.throughMonth ?? endMonth, note: null });
            } else {
                out.push({ key: s.key, index: s.label, corrected: null, gain: null, percent: null, from: null, through: null, note: r.note });
            }
        }
        return out;
    }, [applied]);

    const columns = useMemo<ColumnDef<ResultRow>[]>(() => [
        { key: "index", label: "Índice", kind: "text", get: (r) => r.index },
        { key: "corrected", label: "Valor corrigido", kind: "number", align: "right", title: "O valor na data final", get: (r) => r.corrected },
        { key: "gain", label: "Correção", kind: "number", align: "right", title: "Valor corrigido − valor original", get: (r) => r.gain },
        { key: "percent", label: "Variação", kind: "number", align: "right", sum: false, title: "Acumulado do índice no período", get: (r) => r.percent },
        { key: "from", label: "De", kind: "month", align: "right", title: "Primeiro mês do índice aplicado (o próprio índice, quando começa depois da data inicial)", get: (r) => r.from },
        { key: "through", label: "Até", kind: "month", align: "right", title: "Último mês do índice aplicado (o próprio índice, quando termina antes da data final)", get: (r) => r.through },
    ], []);

    const cf = useColumnFilters(rows, columns, { key: "percent", dir: "desc" }, { storageKey: TABLE_KEY });
    const vis = useColumnVisibility(TABLE_KEY, { locked: ["index"] });
    const widths = useColumnWidths(TABLE_KEY);
    const sel = useCellSum({ formatByCol: { percent: formatPercent }, widths });
    const show = (key: string) => !vis.isHidden(key);
    const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

    return (
        <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border bg-muted/20 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                    R$ {formatBRL(applied.value)} de {formatDateBR(applied.start)} a {formatDateBR(applied.end)}, corrigido por cada índice
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Clique no cabeçalho para ordenar e filtrar (botão direito: colunas); selecione células para somar; setas movem entre as células
                </p>
            </div>

            {cf.anyFilter && (
                <div className="px-3 pt-3">
                    <FilterChips columns={columns} ctl={cf} />
                </div>
            )}

            {cf.rows.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Nenhum índice com os filtros atuais. <button type="button" onClick={cf.clearFilters} className="underline underline-offset-2">Limpar filtros</button>
                </div>
            ) : (
                <div className="overflow-x-auto px-2 pb-2">
                    <table className="w-full text-xs" style={widths.tableStyle}>
                        <thead>
                            <ColumnHeaders columns={columns} ctl={cf} widths={widths} visibility={vis} />
                        </thead>
                        <tbody>
                            {cf.rows.map((r) => (
                                <tr key={r.key} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                                    <td {...sel.cellProps("index", r.key, null, "px-2 py-1.5 font-semibold text-foreground whitespace-nowrap")}>{r.index}</td>
                                    {show("corrected") && (
                                        <td {...sel.cellProps("corrected", r.key, r.corrected, cn(num, "privacy-money font-bold text-foreground"))}>
                                            {r.corrected === null ? <span className="font-normal text-muted-foreground">{r.note}</span> : `R$ ${formatBRL(r.corrected)}`}
                                        </td>
                                    )}
                                    {show("gain") && (
                                        <td {...sel.cellProps("gain", r.key, r.gain, cn(num, "privacy-money", r.gain !== null && r.gain < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"))}>
                                            {r.gain === null ? "—" : `${r.gain >= 0 ? "+" : "−"}R$ ${formatBRL(Math.abs(r.gain))}`}
                                        </td>
                                    )}
                                    {show("percent") && (
                                        <td {...sel.cellProps("percent", r.key, r.percent, cn(num, r.percent !== null && r.percent < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"))}>
                                            {r.percent === null ? "—" : `${r.percent >= 0 ? "+" : ""}${formatPercent(r.percent)}`}
                                        </td>
                                    )}
                                    {show("from") && (
                                        <td {...sel.cellProps("from", r.key, null, cn(num, "text-muted-foreground"))}>
                                            {r.from ? formatMonthYear(`${r.from}-01`) : "—"}
                                        </td>
                                    )}
                                    {show("through") && (
                                        <td {...sel.cellProps("through", r.key, null, cn(num, "text-muted-foreground"))}>
                                            {r.through ? formatMonthYear(`${r.through}-01`) : "—"}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CellSumBar ctl={sel} />
            <ColumnMenu columns={columns} ctl={cf} />
            <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />
        </div>
    );
}
