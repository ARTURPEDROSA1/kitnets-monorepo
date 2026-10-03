"use client";

/**
 * Column widths, Excel style: drag the right edge of a header to make the column wider or narrower,
 * double-click the edge to fit the column to its content again.
 *
 *   const widths = useColumnWidths(columnTableKey("energy-bills"));
 *   const sel = useCellSum({ widths });                                      // body cells follow, through cellProps
 *   <table className="w-full text-xs" style={widths.tableStyle}>             // the table is as wide as its columns
 *   <ColumnHeaders columns={columns} ctl={cf} widths={widths} />             // the grips on the header
 *   <ColumnVisibilityMenu columns={columns} ctl={vis} widths={widths} />     // right-click → "Largura automática"
 *   <td {...widths.cellProps("amount", "px-2 py-1")}>…</td>                   // a cell that does not use sel.cellProps
 *
 * Like a spreadsheet, a column's width is its own: dragging one never changes its neighbours. So the first
 * drag in a table keeps every column at the width it had on screen (they are all stored) and from then on
 * the table is as wide as the sum of its columns — it scrolls sideways when that is more than the page and
 * leaves the rest of the line empty when it is less. "Largura automática em todas" gives the table back
 * its automatic layout.
 *
 * The widths belong to the user's account (`user_ui_preferences`, `column-widths:<table key>`), like the
 * hidden columns: they are there on any device the user signs in on, with a localStorage copy so the table
 * opens right away with the widths last chosen on this device.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { clampColumnWidth, type ColumnWidths } from "@/lib/ui-preferences";
import { loadAccountPreferences, readLocalPreference, saveAccountPreference, writeLocalPreference } from "@/lib/ui-preferences-client";

export interface ColumnWidthsController {
    /** The width the user gave the column, in px; undefined while it is automatic. */
    widthOf: (key: string) => number | undefined;
    /** How many columns have a stored width. */
    count: number;
    /** While dragging: these widths are shown, not stored yet. */
    preview: (widths: ColumnWidths) => void;
    /** End of a drag: the widths are stored on this device and in the account. */
    commit: (widths: ColumnWidths) => void;
    /** Back to the width of the column's content. */
    reset: (key: string) => void;
    /** Every column automatic again: the table goes back to filling the page. */
    resetAll: () => void;
    /** For the `<table>`: once a column has a width, the table is as wide as its columns instead of the page. */
    tableStyle: React.CSSProperties | undefined;
    headerStyle: (key: string) => React.CSSProperties | undefined;
    cellStyle: (key: string) => React.CSSProperties | undefined;
    /** Classes a body cell of a sized column needs (it clips instead of pushing the column wide again). */
    cellClass: (key: string) => string | undefined;
    /** `className` + `style` for a body cell that is not built with `sel.cellProps`. */
    cellProps: (key: string, className?: string) => { className?: string; style?: React.CSSProperties };
}

/** A sized cell clips what does not fit, and the inputs inside it shrink with it instead of holding it wide. */
const SIZED_CELL = "overflow-hidden text-ellipsis [&_input]:min-w-0 [&_select]:min-w-0";
/** Overrides the table's own `w-full` / `min-w-…`: with sized columns there is no spare width to hand out. */
const SIZED_TABLE: React.CSSProperties = { width: "auto", minWidth: 0 };
const NONE: ColumnWidths = Object.freeze({}) as ColumnWidths;

// ── The widths of every table on the page, read from this device once and shared by the hooks ────────
const cache = new Map<string, ColumnWidths>();
const listeners = new Set<() => void>();
/** Table keys the user changed in this visit: the account's copy, arriving late, must not undo that. */
const touched = new Set<string>();

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = (tableKey: string): ColumnWidths => {
    let widths = cache.get(tableKey);
    if (!widths) { widths = readLocalPreference("columnWidths", tableKey) ?? NONE; cache.set(tableKey, widths); }
    return widths;
};
const publish = (tableKey: string, widths: ColumnWidths) => {
    if (JSON.stringify(snapshot(tableKey)) === JSON.stringify(widths)) return;
    cache.set(tableKey, widths);
    listeners.forEach(fn => fn());
};
const store = (tableKey: string, widths: ColumnWidths) => {
    touched.add(tableKey);
    writeLocalPreference("columnWidths", tableKey, widths);
    saveAccountPreference("columnWidths", tableKey, widths);
    publish(tableKey, widths);
};

export function useColumnWidths(storageKey: string): ColumnWidthsController {
    // the server (and the first paint after it) knows no widths: every column automatic
    const stored = useSyncExternalStore(subscribe, () => snapshot(storageKey), () => NONE);
    const [drag, setDrag] = useState<{ table: string; widths: ColumnWidths } | null>(null);

    useEffect(() => {
        let alive = true;
        void loadAccountPreferences().then(all => {
            if (!alive || touched.has(storageKey)) return;
            const remote = all.columnWidths[storageKey];
            if (remote) {
                writeLocalPreference("columnWidths", storageKey, remote);
                publish(storageKey, remote);
            } else {
                // first time this table is seen in the account: the widths chosen on this device become the account's
                const local = snapshot(storageKey);
                if (Object.keys(local).length > 0) saveAccountPreference("columnWidths", storageKey, local);
            }
        });
        return () => { alive = false; };
    }, [storageKey]);

    const preview = useCallback((widths: ColumnWidths) => setDrag({ table: storageKey, widths }), [storageKey]);
    const commit = useCallback((widths: ColumnWidths) => {
        const next = { ...snapshot(storageKey) };
        for (const [key, px] of Object.entries(widths)) next[key] = clampColumnWidth(px);
        store(storageKey, next);
        setDrag(null);
    }, [storageKey]);
    const reset = useCallback((key: string) => {
        setDrag(null);
        const next = { ...snapshot(storageKey) };
        if (!(key in next)) return;
        delete next[key];
        store(storageKey, next);
    }, [storageKey]);
    const resetAll = useCallback(() => {
        setDrag(null);
        if (Object.keys(snapshot(storageKey)).length > 0) store(storageKey, {});
    }, [storageKey]);

    return useMemo(() => {
        const live = drag && drag.table === storageKey ? drag.widths : null;
        const widthOf = (key: string) => live?.[key] ?? stored[key];
        const count = Object.keys(stored).length;
        const headerStyle = (key: string) => { const w = widthOf(key); return w === undefined ? undefined : { width: w, minWidth: w, maxWidth: w }; };
        // minWidth 0: a cell with a floor of its own (min-w-[220px]) must not hold the column wider than asked
        const cellStyle = (key: string) => { const w = widthOf(key); return w === undefined ? undefined : { minWidth: 0, maxWidth: w }; };
        const cellClass = (key: string) => (widthOf(key) === undefined ? undefined : SIZED_CELL);
        return {
            widthOf, count, preview, commit, reset, resetAll, headerStyle, cellStyle, cellClass,
            tableStyle: count > 0 || live ? SIZED_TABLE : undefined,
            cellProps: (key: string, className?: string) => ({ className: cn(className, cellClass(key)) || undefined, style: cellStyle(key) }),
        };
    }, [stored, drag, storageKey, preview, commit, reset, resetAll]);
}

/**
 * The grip on the right edge of a header cell (the `<th>` must be `relative` and carry `data-column`).
 * Drag: the column follows the pointer and the width is stored when the button is released.
 * Double-click: the column fits its content again.
 */
export function ColumnResizeHandle({ columnKey, label, ctl }: { columnKey: string; label: string; ctl: ColumnWidthsController }) {
    const drag = useRef<{ startX: number; startWidth: number; px: number; moved: boolean; others: ColumnWidths } | null>(null);
    const frame = useRef(0);
    const [active, setActive] = useState(false);
    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
        if (e.button !== 0) return;
        const th = e.currentTarget.closest("th");
        if (!th) return;
        e.preventDefault();      // no text selection, and the header's own button stays out of it
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        // First resize of this table: every column keeps the width it has on screen right now, so the one
        // being dragged is the only one that changes (otherwise the browser would hand its width to the others).
        const others: ColumnWidths = {};
        if (ctl.count === 0) {
            th.parentElement?.querySelectorAll<HTMLElement>("th[data-column]").forEach(cell => {
                const key = cell.dataset.column;
                if (key && key !== columnKey) others[key] = clampColumnWidth(cell.getBoundingClientRect().width);
            });
        }
        const startWidth = th.getBoundingClientRect().width;
        drag.current = { startX: e.clientX, startWidth, px: clampColumnWidth(startWidth), moved: false, others };
        setActive(true);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
        const d = drag.current;
        if (!d) return;
        const delta = e.clientX - d.startX;
        if (!d.moved && Math.abs(delta) < 3) return;      // a click (or the first half of a double-click), not a drag
        d.moved = true;
        d.px = clampColumnWidth(d.startWidth + delta);
        const next = { ...d.others, [columnKey]: d.px };
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => ctl.preview(next));
    };
    const onPointerEnd = (e: React.PointerEvent<HTMLSpanElement>) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        cancelAnimationFrame(frame.current);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setActive(false);
        if (d.moved) ctl.commit({ ...d.others, [columnKey]: d.px });
    };

    return (
        <span
            role="separator"
            aria-orientation="vertical"
            aria-label={`Largura da coluna ${label}`}
            title="Arraste para ajustar a largura · duplo clique: ajustar ao conteúdo"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={e => { e.stopPropagation(); ctl.reset(columnKey); }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
            className="group/resize absolute inset-y-0 right-0 z-[1] w-2 cursor-col-resize select-none touch-none"
        >
            <span className={cn("absolute inset-y-1 right-0 w-0.5 rounded-full transition-colors", active ? "bg-emerald-500" : "bg-transparent group-hover/resize:bg-emerald-400")} />
        </span>
    );
}
