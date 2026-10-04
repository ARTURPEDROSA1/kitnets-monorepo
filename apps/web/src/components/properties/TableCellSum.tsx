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
 *   • Ctrl/Cmd+C       copies the selected cells, a line per row and a tab between columns (pastes into Excel / Sheets as cells)
 *   • Ctrl/Cmd+Z       undoes the last cell edit (the last 5 edits of the page, see lib/cell-undo.ts)
 * A floating bar shows count, sum and average of the selected numeric cells. Sums are R$ unless
 * the column has its own unit: useCellSum({ formatByCol: { cons: v => `${v} kWh` } }).
 *
 * Copy takes what the cell shows: the text of its box or the option chosen in its list, otherwise its first
 * line (a second line is a note under the value, like "dia 10" or "faltam 259 dias"). With several tables on
 * the page, Ctrl+C copies from the one the user worked in last. Inside a text box, or with page text selected,
 * Ctrl+C stays the browser's.
 *
 * Undo: a table that saves a cell tells the controller how to put the previous value back —
 *   sel.recordUndo({ col: "amount", rowId: row.id, label: "Valor · IPTU 2025", undo: () => save(row.id, previous) });
 * Ctrl+Z runs the newest `undo`, selects that cell and says what was undone; while the user is typing in a
 * text box it is left to the browser (its own undo of the typing). `undo` saves like an edit and answers
 * false when it could not.
 *
 * Column widths: useCellSum({ widths }) with the controller of `useColumnWidths` makes the cells of a
 * column the user resized follow its width (components/properties/TableColumnWidths.tsx).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Sigma, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dropUndoOwner, popUndo, pushUndo, undoDepth, type UndoEntry } from "@/lib/cell-undo";
import type { ColumnWidthsController } from "./TableColumnWidths";

export interface CellSumOptions {
    /** How to print the sum/average of a column's cells; columns without one are R$ */
    formatByCol?: Record<string, (v: number) => string>;
    /** Widths the user gave the columns (`useColumnWidths`): the cells of a resized column follow it */
    widths?: ColumnWidthsController;
}

/** An edit the user can take back with Ctrl+Z. */
export interface CellEdit {
    col: string;
    rowId: string;
    /** what was edited, for the notice: "Valor · IPTU 2025" */
    label?: string;
    /** puts the previous value back, saving it like an edit; false (or a rejection) = it could not */
    undo: () => unknown;
    /** a field that saves on every keystroke: the saves of one burst are a single edit */
    coalesce?: boolean;
}

export interface CellSumController {
    cellProps: (col: string, rowId: string, value: number | null | undefined, className?: string, onCancel?: () => void) => {
        onMouseDown: (e: React.MouseEvent) => void;
        onMouseEnter: (e: React.MouseEvent) => void;
        onDoubleClick: (e: React.MouseEvent) => void;
        onKeyDown: (e: React.KeyboardEvent) => void;
        className: string;
        style?: React.CSSProperties;
        title?: string;
        /** lets the keyboard navigation find the cell in the DOM */
        "data-cell": string;
    };
    isSelected: (col: string, rowId: string) => boolean;
    /** count / sum over the current selection (numeric cells only for the sum); `format` prints the sum in the selected column's unit; `money` = printed in R$ (hidden by the dollar privacy toggle) */
    stats: () => { count: number; numeric: number; total: number; format: (v: number) => string; money: boolean };
    count: number;
    clear: () => void;
    /** Call after a cell edit was saved, so Ctrl+Z can take it back. */
    recordUndo: (edit: CellEdit) => void;
    /** What the last Ctrl+Z or Ctrl+C did, shown for a few seconds by `CellSumBar`. */
    notice: { text: string; failed: boolean; kind: "undo" | "copy" } | null;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPlain = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const key = (col: string, rowId: string) => `${col}::${rowId}`;
const colOf = (k: string) => k.slice(0, k.indexOf("::"));
const rowOf = (k: string) => k.slice(k.indexOf("::") + 2);
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

// ── Ctrl+C ─────────────────────────────────────────────────────────────────

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * What a cell holds, as the user reads it: the text of its box, the option chosen in its list, Sim / Não for
 * a checkbox; otherwise its first line (a second line is a note under the value: "dia 10", "faltam 259 dias").
 */
function cellText(cell: HTMLElement): string {
    const control = cell.querySelector("input:not([type=hidden]):not([type=file]):not([type=button]), select, textarea");
    if (control instanceof HTMLSelectElement) return oneLine(control.selectedOptions[0]?.text ?? "");
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) return control.checked ? "Sim" : "Não";
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return oneLine(control.value);
    return oneLine(cell.innerText.split("\n").find(line => line.trim()) ?? "");
}

/**
 * The selected cells as a spreadsheet pastes them back into the same shape: a line per row, a tab between
 * columns, in the order the table shows them. Gaps of a Ctrl+click selection stay as empty cells.
 */
function selectionText(selected: Set<string>, g: Grid): string {
    const cols = new Set([...selected].map(colOf)), rows = new Set([...selected].map(rowOf));
    return g.rows.filter(r => rows.has(r)).map(r =>
        g.cols.filter(c => cols.has(c)).map(c => {
            const el = selected.has(key(c, r)) ? cellElement(key(c, r)) : null;
            return el ? cellText(el) : "";
        }).join("\t"),
    ).join("\r\n");
}

/** The table the user worked in last (clicked, moved in, undid an edit): Ctrl+C copies its selection. */
let activeTable: object | null = null;

// ── Ctrl+Z ─────────────────────────────────────────────────────────────────
// One listener for the page, however many tables are on it: the buffer is the page's (lib/cell-undo.ts).

/** The table an edit came from: told when its edit was undone, so it can show the cell and say so. */
interface UndoOwner { undone: (entry: UndoEntry, ok: boolean) => void }

const NOTICE_MS = 5000;
/** The text box the user typed in since it took the focus. */
let typedIn: EventTarget | null = null;
const onTyped = (e: Event) => { typedIn = e.target; };
const onFocusMoved = () => { typedIn = null; };
/** A text box (a select or a checkbox has no typing to undo). */
const isTextBox = (el: HTMLElement | null): el is HTMLElement => {
    if (!el) return false;
    if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
    return el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"].includes((el as HTMLInputElement).type);
};
/**
 * Typing in a text box: there Ctrl+Z is the browser's undo of the typing. A cell's box that only holds the
 * focus — Tab took it there after the edit in the cell before — is not typing: Ctrl+Z undoes that edit.
 */
const isTextEditing = () => {
    const el = document.activeElement as HTMLElement | null;
    return isTextBox(el) && (typedIn === el || !el.closest("[data-cell]"));
};
/** One undo at a time: each saves, and two saves of the same table must not cross. */
let undoQueue: Promise<void> = Promise.resolve();
const undoLast = () => {
    undoQueue = undoQueue.then(async () => {
        const entry = popUndo();
        if (!entry) return;
        let ok = true;
        try { ok = (await entry.undo()) !== false; } catch { ok = false; }
        (entry.owner as UndoOwner).undone(entry, ok);
    });
};
const onUndoKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (undoDepth() === 0 || isTextEditing()) return;
    if (document.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]')) return;   // a dialog is over the table
    e.preventDefault();
    // a cell's box that only held the focus lets go of it: the cell that changes back is the one shown as selected
    const el = document.activeElement as HTMLElement | null;
    if (isTextBox(el)) el.blur();
    undoLast();
};
/** Takes down the notice of the table that showed one last: with several tables on the page, only the latest undo is announced. */
let dismissNotice: (() => void) | null = null;
let undoListeners = 0;
const listenForUndo = () => {
    if (undoListeners++ === 0) {
        window.addEventListener("keydown", onUndoKey);
        window.addEventListener("input", onTyped, true);
        window.addEventListener("focusin", onFocusMoved, true);
    }
    return () => {
        if (--undoListeners > 0) return;
        window.removeEventListener("keydown", onUndoKey);
        window.removeEventListener("input", onTyped, true);
        window.removeEventListener("focusin", onFocusMoved, true);
    };
};

export function useCellSum(options: CellSumOptions = {}): CellSumController {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [notice, setNotice] = useState<CellSumController["notice"]>(null);
    /** This table, for the page-wide Ctrl+Z buffer and for Ctrl+C. */
    const [owner] = useState<UndoOwner>(() => ({ undone: () => { } }));
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    /** Shows what Ctrl+Z / Ctrl+C did; with several tables on the page, only the latest notice stays up. */
    const announce = useCallback((next: NonNullable<CellSumController["notice"]>) => {
        const hide = () => setNotice(null);
        dismissNotice?.();
        dismissNotice = hide;
        setNotice(next);
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(hide, NOTICE_MS);
    }, []);
    useEffect(() => () => clearTimeout(noticeTimer.current), []);
    const { widths } = options;
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
        activeTable = owner;
        requestAnimationFrame(() => cellElement(k)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }, [selectRect, owner]);

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
            title: "Clique: selecionar · arraste ou Shift+clique: intervalo · Ctrl+clique: adicionar · duplo clique ou Enter: editar · setas: navegar · Ctrl+C: copiar · Ctrl+Z: desfazer",
            className: cn(className, "cursor-cell", widths?.cellClass(col), selected.has(k) && "bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-inset ring-emerald-400"),
            style: widths?.cellStyle(col),
            onMouseDown: (e: React.MouseEvent) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;
                const control = target.closest("input, select, textarea, button, a") as HTMLElement | null;
                if (control && (control.tagName === "BUTTON" || control.tagName === "A")) return;      // buttons keep working on a single click
                if (control && document.activeElement === control) return;                             // already editing this cell
                e.preventDefault();                                                                     // no focus on single click
                if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();   // commits a pending edit
                window.getSelection()?.removeAllRanges();                                               // text selected earlier on the page must not win Ctrl+C
                activeTable = owner;
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
    }, [selected, selectRect, moveBy, widths, owner]);

    // ── Undo ────────────────────────────────────────────────────────────
    useEffect(() => {
        owner.undone = (entry, ok) => {
            // show the cell that changed back: it may be off screen, or the user may be looking elsewhere
            const k = key(entry.col, entry.rowId);
            const cell = { col: entry.col, rowId: entry.rowId };
            setSelected(new Set([k]));
            anchor.current = cell;
            cursor.current = cell;
            activeTable = owner;
            requestAnimationFrame(() => cellElement(k)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
            announce({ kind: "undo", failed: !ok, text: `${ok ? "Desfeito" : "Não foi possível desfazer"}${entry.label ? `: ${entry.label}` : ok ? ": a célula voltou ao valor anterior" : ""}` });
        };
        const stopListening = listenForUndo();
        return () => { stopListening(); dropUndoOwner(owner); owner.undone = () => { }; if (activeTable === owner) activeTable = null; };
    }, [owner, announce]);
    const recordUndo = useCallback(({ coalesce, ...edit }: CellEdit) => pushUndo({ ...edit, owner }, { coalesce }), [owner]);

    // ── Copy ────────────────────────────────────────────────────────────
    // Ctrl/Cmd+C writes the selected cells through the Clipboard API (Safari fires no copy event while nothing
    // is selected on the page); the browser's copy event covers its own Copy menu and pages without that API.
    useEffect(() => {
        if (selected.size === 0) return;
        /** The copy is the table's: it is the one worked in last, and no text box or page text is in the way. */
        const ours = () => activeTable === owner
            && !isTextBox(document.activeElement as HTMLElement | null)     // inside a text box: the browser copies its text
            && !window.getSelection()?.toString().trim();                    // text the user selected on the page: the browser copies it
        const copied = () => announce({ kind: "copy", failed: false, text: `Copiado: ${selected.size} ${selected.size === 1 ? "célula" : "células"}` });
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() !== "c" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !ours()) return;
            if (!navigator.clipboard?.writeText) return;
            e.preventDefault();
            navigator.clipboard.writeText(selectionText(selected, grid.current)).then(copied, () => announce({ kind: "copy", failed: true, text: "Não foi possível copiar: o navegador bloqueou a área de transferência" }));
        };
        const onCopy = (e: ClipboardEvent) => {
            if (!e.clipboardData || !ours()) return;
            e.preventDefault();
            e.clipboardData.setData("text/plain", selectionText(selected, grid.current));
            copied();
        };
        window.addEventListener("keydown", onKey);
        document.addEventListener("copy", onCopy);
        return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("copy", onCopy); };
    }, [selected, owner, announce]);

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
        return { count: selected.size, numeric, total: Math.round(total * 100) / 100, format, money: format === formatBRL };
    }, [selected]);
    return { cellProps, isSelected, stats, count: selected.size, clear, recordUndo, notice };
}

/** Floating status bar (bottom centre) with count, sum and average of the selected cells; above it, what the last Ctrl+Z / Ctrl+C did. */
export function CellSumBar({ ctl }: { ctl: CellSumController }) {
    if (ctl.count === 0 && !ctl.notice) return null;
    const { count, numeric, total, format, money } = ctl.stats();
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 text-xs">
            {ctl.notice && (
                <div role="status" className={cn("flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur px-4 py-2 shadow-lg max-w-[90vw]",
                    ctl.notice.failed ? "border-rose-300 text-rose-700 dark:text-rose-400" : "border-border text-foreground")}>
                    {ctl.notice.kind === "copy" ? <Copy className="w-4 h-4 shrink-0 text-muted-foreground" /> : <Undo2 className="w-4 h-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{ctl.notice.text}</span>
                </div>
            )}
            {count > 0 && (
                <div className="flex items-center gap-3 rounded-full border border-emerald-300 bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
                    <Sigma className="w-4 h-4 text-emerald-600" />
                    <span><span className="font-semibold text-foreground">{count}</span> {count === 1 ? "célula" : "células"}</span>
                    {numeric > 0 && (
                        <>
                            {/* sums in R$ follow the dollar privacy toggle (components/privacy); sums in another unit (kWh, m³) stay readable */}
                            <span>Soma <span className={cn("font-bold text-foreground tabular-nums", money && "privacy-money")}>{format(total)}</span></span>
                            <span className="text-muted-foreground">Média <span className={cn(money && "privacy-money")}>{format(total / numeric)}</span></span>
                        </>
                    )}
                    <button type="button" onClick={ctl.clear} className="text-muted-foreground hover:text-foreground" title="Limpar seleção (Esc)"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}
        </div>
    );
}
