"use client";

/**
 * Excel-style cell selection with a running sum.
 *
 *   const sel = useCellSum();
 *   <td {...sel.cellProps("amount", row.id, row.amount)}>…</td>   // Ctrl/Cmd+click toggles, Shift+click selects a range in the column
 *   <CellSumBar ctl={sel} />                                       // floating "Σ" bar while something is selected
 *
 * Plain clicks keep working (inputs, selects); only modifier clicks select.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sigma, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CellSumController {
    cellProps: (col: string, rowId: string, value: number | null | undefined, className?: string) => { onMouseDown: (e: React.MouseEvent) => void; className: string; title?: string };
    isSelected: (col: string, rowId: string) => boolean;
    count: number;
    total: number;
    clear: () => void;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const key = (col: string, rowId: string) => `${col}::${rowId}`;

export function useCellSum(): CellSumController {
    const [selected, setSelected] = useState<Map<string, number>>(new Map());
    /** cells in render order, per column, for shift-ranges */
    const order = useRef<Map<string, Array<{ rowId: string; value: number }>>>(new Map());
    const last = useRef<{ col: string; rowId: string } | null>(null);
    const rendering = useRef<Set<string>>(new Set());

    const cellProps = useCallback((col: string, rowId: string, value: number | null | undefined, className?: string) => {
        const num = value === null || value === undefined ? NaN : Number(value);
        const usable = Number.isFinite(num);
        // rebuild the column order every render pass: first cell of a column resets its list
        if (!rendering.current.has(col)) { rendering.current.add(col); order.current.set(col, []); queueMicrotask(() => rendering.current.delete(col)); }
        if (usable) order.current.get(col)!.push({ rowId, value: num });
        const k = key(col, rowId);
        return {
            title: usable ? "Ctrl+clique: selecionar · Shift+clique: intervalo" : undefined,
            className: cn(className, "cursor-cell", selected.has(k) && "bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-inset ring-emerald-400"),
            onMouseDown: (e: React.MouseEvent) => {
                if (!usable || !(e.ctrlKey || e.metaKey || e.shiftKey)) return;
                e.preventDefault();
                setSelected(prev => {
                    const next = new Map(prev);
                    if (e.shiftKey && last.current && last.current.col === col) {
                        const list = order.current.get(col) ?? [];
                        const a = list.findIndex(x => x.rowId === last.current!.rowId);
                        const b = list.findIndex(x => x.rowId === rowId);
                        if (a >= 0 && b >= 0) {
                            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.set(key(col, list[i].rowId), list[i].value);
                            return next;
                        }
                    }
                    if (next.has(k)) next.delete(k); else next.set(k, num);
                    last.current = { col, rowId };
                    return next;
                });
            },
        };
    }, [selected]);

    const isSelected = useCallback((col: string, rowId: string) => selected.has(key(col, rowId)), [selected]);
    const total = useMemo(() => Math.round([...selected.values()].reduce((a, v) => a + v, 0) * 100) / 100, [selected]);
    const clear = useCallback(() => { setSelected(new Map()); last.current = null; }, []);
    // Esc clears the selection (only while something is selected, so other Esc handlers are not affected)
    useEffect(() => {
        if (selected.size === 0) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected.size, clear]);
    return { cellProps, isSelected, count: selected.size, total, clear };
}

/** Floating status bar (bottom centre) with count, sum and average of the selected cells. */
export function CellSumBar({ ctl }: { ctl: CellSumController }) {
    if (ctl.count === 0) return null;
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-emerald-300 bg-background/95 backdrop-blur px-4 py-2 text-xs shadow-lg">
            <Sigma className="w-4 h-4 text-emerald-600" />
            <span><span className="font-semibold text-foreground">{ctl.count}</span> {ctl.count === 1 ? "célula" : "células"}</span>
            <span>Soma <span className="font-bold text-foreground tabular-nums">{formatBRL(ctl.total)}</span></span>
            <span className="text-muted-foreground">Média {formatBRL(ctl.total / ctl.count)}</span>
            <button type="button" onClick={ctl.clear} className="text-muted-foreground hover:text-foreground" title="Limpar seleção (Esc)"><X className="w-3.5 h-3.5" /></button>
        </div>
    );
}
