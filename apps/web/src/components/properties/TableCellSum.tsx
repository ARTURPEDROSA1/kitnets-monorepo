"use client";

/**
 * Excel-like cell selection for the property tables.
 *
 *   const sel = useCellSum();
 *   <td {...sel.cellProps("amount", row.id, row.amount, "px-2 py-1 text-right")}>…</td>
 *   <CellSumBar ctl={sel} />
 *
 * Behaviour (like a spreadsheet):
 *   • click            selects the cell (the input inside is NOT focused)
 *   • drag             selects a rectangle of cells
 *   • Shift+click      extends a rectangle from the anchor cell
 *   • Ctrl/Cmd+click   toggles one cell in and out of the selection
 *   • double-click     starts inline editing (focuses the input / opens the select)
 *   • Esc              clears the selection
 * A floating bar shows count, sum and average of the selected numeric cells.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sigma, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CellSumController {
    cellProps: (col: string, rowId: string, value: number | null | undefined, className?: string) => {
        onMouseDown: (e: React.MouseEvent) => void;
        onMouseEnter: (e: React.MouseEvent) => void;
        onDoubleClick: (e: React.MouseEvent) => void;
        className: string;
        title?: string;
    };
    isSelected: (col: string, rowId: string) => boolean;
    /** count / sum over the current selection (numeric cells only for the sum) */
    stats: () => { count: number; numeric: number; total: number };
    count: number;
    clear: () => void;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const key = (col: string, rowId: string) => `${col}::${rowId}`;

interface Grid { cols: string[]; rows: string[]; cells: Map<string, number | null> }

export function useCellSum(): CellSumController {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const grid = useRef<Grid>({ cols: [], rows: [], cells: new Map() });
    const inPass = useRef(false);
    const anchor = useRef<{ col: string; rowId: string } | null>(null);
    const dragging = useRef(false);

    const selectRect = useCallback((a: { col: string; rowId: string }, b: { col: string; rowId: string }) => {
        const g = grid.current;
        const c0 = g.cols.indexOf(a.col), c1 = g.cols.indexOf(b.col);
        const r0 = g.rows.indexOf(a.rowId), r1 = g.rows.indexOf(b.rowId);
        if (c0 < 0 || c1 < 0 || r0 < 0 || r1 < 0) return;
        const next = new Set<string>();
        for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
            for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
                const k = key(g.cols[c], g.rows[r]);
                if (g.cells.has(k)) next.add(k);
            }
        }
        setSelected(next);
    }, []);

    const cellProps = useCallback((col: string, rowId: string, value: number | null | undefined, className?: string) => {
        // rebuild the grid on every render pass (cells register in DOM order)
        if (!inPass.current) { inPass.current = true; grid.current = { cols: [], rows: [], cells: new Map() }; queueMicrotask(() => { inPass.current = false; }); }
        const g = grid.current;
        if (!g.cols.includes(col)) g.cols.push(col);
        if (!g.rows.includes(rowId)) g.rows.push(rowId);
        const num = value === null || value === undefined ? NaN : Number(value);
        g.cells.set(key(col, rowId), Number.isFinite(num) ? num : null);
        const k = key(col, rowId);
        const me = { col, rowId };
        return {
            title: "Clique: selecionar · arraste ou Shift+clique: intervalo · Ctrl+clique: adicionar · duplo clique: editar",
            className: cn(className, "cursor-cell", selected.has(k) && "bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-inset ring-emerald-400"),
            onMouseDown: (e: React.MouseEvent) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;
                const control = target.closest("input, select, textarea, button, a") as HTMLElement | null;
                if (control && (control.tagName === "BUTTON" || control.tagName === "A")) return;      // buttons keep working on a single click
                if (control && document.activeElement === control) return;                             // already editing this cell
                e.preventDefault();                                                                     // no focus on single click
                if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();   // commits a pending edit
                if (e.ctrlKey || e.metaKey) {
                    setSelected(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
                    anchor.current = me;
                } else if (e.shiftKey && anchor.current) {
                    selectRect(anchor.current, me);
                } else {
                    setSelected(new Set([k]));
                    anchor.current = me;
                    dragging.current = true;
                }
            },
            onMouseEnter: (e: React.MouseEvent) => {
                if (dragging.current && (e.buttons & 1) && anchor.current) selectRect(anchor.current, me);
            },
            onDoubleClick: (e: React.MouseEvent) => {
                const el = (e.currentTarget as HTMLElement).querySelector("input, select, textarea") as HTMLElement | null;
                if (!el || (el as HTMLInputElement).disabled) return;
                el.focus();
                if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number")) el.select();
                const picker = el as HTMLElement & { showPicker?: () => void };
                if ((el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "date")) && typeof picker.showPicker === "function") {
                    try { picker.showPicker(); } catch { /* not allowed outside a user gesture in some browsers */ }
                }
            },
        };
    }, [selected, selectRect]);

    useEffect(() => {
        const up = () => { dragging.current = false; };
        window.addEventListener("mouseup", up);
        return () => window.removeEventListener("mouseup", up);
    }, []);

    const clear = useCallback(() => { setSelected(new Set()); anchor.current = null; dragging.current = false; }, []);
    useEffect(() => {
        if (selected.size === 0) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected.size, clear]);

    const isSelected = useCallback((col: string, rowId: string) => selected.has(key(col, rowId)), [selected]);
    const stats = useCallback(() => {
        let total = 0, numeric = 0;
        for (const k of selected) { const v = grid.current.cells.get(k); if (typeof v === "number") { total += v; numeric++; } }
        return { count: selected.size, numeric, total: Math.round(total * 100) / 100 };
    }, [selected]);
    return { cellProps, isSelected, stats, count: selected.size, clear };
}

/** Floating status bar (bottom centre) with count, sum and average of the selected cells. */
export function CellSumBar({ ctl }: { ctl: CellSumController }) {
    if (ctl.count === 0) return null;
    const { count, numeric, total } = ctl.stats();
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-emerald-300 bg-background/95 backdrop-blur px-4 py-2 text-xs shadow-lg">
            <Sigma className="w-4 h-4 text-emerald-600" />
            <span><span className="font-semibold text-foreground">{count}</span> {count === 1 ? "célula" : "células"}</span>
            {numeric > 0 && (
                <>
                    <span>Soma <span className="font-bold text-foreground tabular-nums">{formatBRL(total)}</span></span>
                    <span className="text-muted-foreground">Média {formatBRL(total / numeric)}</span>
                </>
            )}
            <button type="button" onClick={ctl.clear} className="text-muted-foreground hover:text-foreground" title="Limpar seleção (Esc)"><X className="w-3.5 h-3.5" /></button>
        </div>
    );
}
