/**
 * Undo for the spreadsheet tables: the last cell edits made on the page, newest last. Ctrl+Z takes the
 * newest and puts the previous value back.
 *
 * One buffer for the whole page, so with several tables open (a property's rents, taxes and investment)
 * Ctrl+Z undoes the edit made last, whichever table it was in. Each table says how its own cell is
 * restored (`undo`); components/properties/TableCellSum.tsx listens for the key and shows what was undone.
 */

/** How many edits can be undone: the oldest leaves when one more arrives. */
export const UNDO_LIMIT = 5;
/** Saves of one cell this close together are one edit (a field that saves on every keystroke). */
const COALESCE_MS = 1500;

export interface UndoEntry {
    /** The table that made the edit; its entries leave the buffer with it. */
    owner: object;
    col: string;
    rowId: string;
    /** What was edited, for the notice: "Valor · IPTU 2025". */
    label?: string;
    /** Puts the previous value back, saving it like an edit. `false` (or a rejection) = it could not. */
    undo: () => unknown;
    at: number;
}

const stack: UndoEntry[] = [];

/**
 * Remembers an edit. With `coalesce`, an edit of the cell that was edited just before joins it: the buffer
 * keeps the older `undo`, the one that knows the value the cell had before the typing started.
 */
export function pushUndo(entry: Omit<UndoEntry, "at">, opts: { coalesce?: boolean; now?: number } = {}): void {
    const now = opts.now ?? Date.now();
    const top = stack[stack.length - 1];
    if (opts.coalesce && top && top.owner === entry.owner && top.col === entry.col && top.rowId === entry.rowId && now - top.at <= COALESCE_MS) {
        top.at = now;
        return;
    }
    stack.push({ ...entry, at: now });
    if (stack.length > UNDO_LIMIT) stack.splice(0, stack.length - UNDO_LIMIT);
}

/** Takes the newest edit out of the buffer. */
export const popUndo = (): UndoEntry | undefined => stack.pop();

/** A table left the page: its edits cannot be undone any more. */
export function dropUndoOwner(owner: object): void {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].owner === owner) stack.splice(i, 1);
}

export const undoDepth = (): number => stack.length;

export const clearUndo = (): void => { stack.length = 0; };
