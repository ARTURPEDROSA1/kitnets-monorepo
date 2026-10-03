import { beforeEach, describe, expect, it } from "vitest";
import { clearUndo, dropUndoOwner, popUndo, pushUndo, undoDepth, UNDO_LIMIT } from "./cell-undo";

const table = {}, other = {};
const edit = (rowId: string, owner: object = table, col = "amount") => ({ owner, col, rowId, undo: () => rowId });

describe("cell undo buffer", () => {
    beforeEach(clearUndo);

    it("gives the edits back newest first", () => {
        pushUndo(edit("a"));
        pushUndo(edit("b"));
        expect(popUndo()?.rowId).toBe("b");
        expect(popUndo()?.rowId).toBe("a");
        expect(popUndo()).toBeUndefined();
    });

    it("keeps only the last five", () => {
        for (const id of ["1", "2", "3", "4", "5", "6", "7"]) pushUndo(edit(id));
        expect(undoDepth()).toBe(UNDO_LIMIT);
        const left: string[] = [];
        for (let e = popUndo(); e; e = popUndo()) left.push(e.rowId);
        expect(left).toEqual(["7", "6", "5", "4", "3"]);
    });

    it("is one buffer for the page: the edit made last comes first, whichever table made it", () => {
        pushUndo(edit("rent", table));
        pushUndo(edit("tax", other));
        expect(popUndo()?.owner).toBe(other);
        expect(popUndo()?.owner).toBe(table);
    });

    it("forgets the edits of a table that left the page", () => {
        pushUndo(edit("a", table));
        pushUndo(edit("b", other));
        pushUndo(edit("c", table));
        dropUndoOwner(table);
        expect(undoDepth()).toBe(1);
        expect(popUndo()?.rowId).toBe("b");
    });

    it("joins the saves of one cell made in a row, keeping the value from before the typing", () => {
        const first = { ...edit("a"), undo: () => "before typing" };
        pushUndo(first, { coalesce: true, now: 1000 });
        pushUndo({ ...edit("a"), undo: () => "half typed" }, { coalesce: true, now: 1400 });
        pushUndo({ ...edit("a"), undo: () => "almost" }, { coalesce: true, now: 2600 });
        expect(undoDepth()).toBe(1);
        expect(popUndo()?.undo()).toBe("before typing");
    });

    it("does not join another cell, a later edit, or an edit that did not ask for it", () => {
        pushUndo(edit("a"), { coalesce: true, now: 1000 });
        pushUndo(edit("b"), { coalesce: true, now: 1100 });        // another row
        pushUndo(edit("b", table, "notes"), { coalesce: true, now: 1200 });   // another column
        pushUndo(edit("b", table, "notes"), { coalesce: true, now: 9000 });   // much later
        pushUndo(edit("b", table, "notes"), { now: 9100 });        // a committed edit, not typing
        expect(undoDepth()).toBe(5);
    });
});
