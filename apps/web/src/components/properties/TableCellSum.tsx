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
 *   • arrows / Tab     move the selected cell (Shift+arrows extend the rectangle from the anchor)
 *   • Enter / F2       start editing the selected cell; Enter while editing commits and moves down
 *   • Esc              while editing: cancels the edit (draft discarded, nothing saved); otherwise clears the selection
 * A floating bar shows count, sum and average of the selected numeric cells. Sums are R$ unless
 * the column has its own unit: useCellSum({ formatByCol: { cons: v => `${v} kWh` } }).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sigma, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CellSumOptions {
    /** How to print the sum/average of a column's cells; columns without one are R$ */
    formatByCol?: Record<string, (v: number) => string>;
}

export interface CellSumController {
    cellProps: (col: string, rowId: string, value: number | null | undefined, className?: string, onCancel?: () => void) => {
        onMouseDown: (e: React.MouseEvent) => void;
        onMouseEnter: (e: React.MouseEvent) => void;
        onDoubleClick: (e: React.MouseEvent) => void;
        onKeyDown: (e: React.KeyboardEvent) => void;
        className: string;
        title?: string;
        /** lets the keyboard navigation find the cell in the DOM */
        "data-cell": string;
    };
    isSelected: (col: string, rowId: string) => boolean;
    /** count / sum over the current selection (numeric cells only for the sum); `format` prints the sum in the selected column's unit */
    stats: () => { count: number; numeric: number; total: number; format: (v: number) => string };
    count: number;
    clear: () => void;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPlain = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const key = (col: string, rowId: string) => `${col}::${rowId}`;
const colOf = (k: string) => k.slice(0, k.indexOf("::"));
const cellElement = (k: string) => document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(k)}"]`);
const isTyping = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};
/** Focuses the input / select inside a cell (double-click, Enter, F2). */
function startEdit(cell: HTMLElement) {
    const el = cell.querySelector("input, select, textarea") as HTMLElement | null;
    if (!el || (el as HTMLInputElement).disabled) return;
    el.focus();
    if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number")) el.select();
    const picker = el as HTMLElement & { showPicker?: () => void };
    if ((el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "date")) && typeof picker.showPicker === "function") {
        try { picker.showPicker(); } catch { /* not allowed outside a user gesture in some browsers */ }
    }
}

interface Grid { cols: string[]; rows: string[]; cells: Map<string, number | null> }

export function useCellSum(options: CellSumOptions = {}): CellSumController {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const formatByCol = useRef(options.formatByCol);
    useEffect(() => { formatByCol.current = options.formatByCol; });
    const grid = useRef<Grid>({ cols: [], rows: [], cells: new Map() });
    const inPass = useRef(false);
    const anchor = useRef<{ col: string; rowId: string } | null>(null);
    /** the active cell: where the keyboard moves from (the far end of a Shift-selected rectangle) */
    const cursor = useRef<{ col: string; rowId: string } | null>(null);
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

    /** Moves the active cell by (dc, dr) in grid order, skipping gaps; Shift extends the rectangle from the anchor. */
    const moveBy = useCallback((dc: number, dr: number, extend: boolean) => {
        const g = grid.current;
        const cur = cursor.current ?? anchor.current;
        if (!cur) return;
        let c = g.cols.indexOf(cur.col), r = g.rows.indexOf(cur.rowId);
        if (c < 0 || r < 0) return;
        let next: { col: string; rowId: string } | null = null;
        for (;;) {
            c += dc; r += dr;
            if (c < 0 || r < 0 || c >= g.cols.length || r >= g.rows.length) break;
            if (g.cells.has(key(g.cols[c], g.rows[r]))) { next = { col: g.cols[c], rowId: g.rows[r] }; break; }
        }
        if (!next) return;
        const k = key(next.col, next.rowId);
        if (extend && anchor.current) selectRect(anchor.current, next);
        else { setSelected(new Set([k])); anchor.current = next; }
        cursor.current = next;
        requestAnimationFrame(() => cellElement(k)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }, [selectRect]);

    const cellProps = useCallback((col: string, rowId: string, value: number | null | undefined, className?: string, onCancel?: () => void) => {
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
            "data-cell": k,
            title: "Clique: selecionar · arraste ou Shift+clique: intervalo · Ctrl+clique: adicionar · duplo clique ou Enter: editar · setas: navegar",
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
                cursor.current = me;
            },
            onMouseEnter: (e: React.MouseEvent) => {
                if (dragging.current && (e.buttons & 1) && anchor.current) { selectRect(anchor.current, me); cursor.current = me; }
            },
            onKeyDown: (e: React.KeyboardEvent) => {
                const control = (e.target as HTMLElement).closest("input, select, textarea") as HTMLElement | null;
                if (!control) return;
                if (e.key === "Escape") {
                    // cancel the edit: drop the draft first, blur on the next frame so the blur handler sees no draft and saves nothing
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel?.();
                    requestAnimationFrame(() => control.blur());
                } else if (e.key === "Enter" && control.tagName !== "TEXTAREA") {
                    // the input blurs itself on Enter (commit); then, like a spreadsheet, the selection moves down
                    cursor.current = me;
                    anchor.current = me;
                    requestAnimationFrame(() => { if (!isTyping()) moveBy(0, 1, false); });
                }
            },
            onDoubleClick: (e: React.MouseEvent) => startEdit(e.currentTarget as HTMLElement),
        };
    }, [selected, selectRect, moveBy]);

    useEffect(() => {
        const up = () => { dragging.current = false; };
        window.addEventListener("mouseup", up);
        return () => window.removeEventListener("mouseup", up);
    }, []);

    const clear = useCallback(() => { setSelected(new Set()); anchor.current = null; dragging.current = false; }, []);
    // Keyboard, while cells are selected and no input has the focus
    useEffect(() => {
        if (selected.size === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { if (!isTyping()) clear(); return; }
            if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
            const cur = cursor.current ?? anchor.current;
            if (!cur) return;
            if (e.key === "Enter" || e.key === "F2") {
                const el = cellElement(key(cur.col, cur.rowId));
                if (el) { e.preventDefault(); startEdit(el); }
                return;
            }
            const delta =
                e.key === "ArrowUp" ? [0, -1] : e.key === "ArrowDown" ? [0, 1]
                    : e.key === "ArrowLeft" ? [-1, 0] : e.key === "ArrowRight" ? [1, 0]
                        : e.key === "Tab" ? [e.shiftKey ? -1 : 1, 0] : null;
            if (!delta) return;
            e.preventDefault();
            moveBy(delta[0], delta[1], e.shiftKey && e.key !== "Tab");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected.size, clear, moveBy]);

    const isSelected = useCallback((col: string, rowId: string) => selected.has(key(col, rowId)), [selected]);
    const stats = useCallback(() => {
        let total = 0, numeric = 0;
        const formats = new Set<((v: number) => string) | undefined>();
        for (const k of selected) {
            const v = grid.current.cells.get(k);
            if (typeof v !== "number") continue;
            total += v; numeric++;
            formats.add(formatByCol.current?.[colOf(k)]);
        }
        // one unit across the selection → print it; mixed units → plain numbers
        const format = formats.size <= 1 ? ([...formats][0] ?? formatBRL) : formatPlain;
        return { count: selected.size, numeric, total: Math.round(total * 100) / 100, format };
    }, [selected]);
    return { cellProps, isSelected, stats, count: selected.size, clear };
}

/** Floating status bar (bottom centre) with count, sum and average of the selected cells. */
export function CellSumBar({ ctl }: { ctl: CellSumController }) {
    if (ctl.count === 0) return null;
    const { count, numeric, total, format } = ctl.stats();
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-emerald-300 bg-background/95 backdrop-blur px-4 py-2 text-xs shadow-lg">
            <Sigma className="w-4 h-4 text-emerald-600" />
            <span><span className="font-semibold text-foreground">{count}</span> {count === 1 ? "célula" : "células"}</span>
            {numeric > 0 && (
                <>
                    <span>Soma <span className="font-bold text-foreground tabular-nums">{format(total)}</span></span>
                    <span className="text-muted-foreground">Média {format(total / numeric)}</span>
                </>
            )}
            <button type="button" onClick={ctl.clear} className="text-muted-foreground hover:text-foreground" title="Limpar seleção (Esc)"><X className="w-3.5 h-3.5" /></button>
        </div>
    );
}
