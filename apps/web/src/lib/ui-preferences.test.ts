import { describe, expect, it } from "vitest";
import { columnTableKey, hiddenColumnsPrefKey, sanitizeHiddenColumns, tableKeyFromPrefKey } from "./ui-preferences";

describe("hidden-column preferences", () => {
    it("names a table per kind of property", () => {
        expect(columnTableKey("income-ledger", "multi")).toBe("income-ledger:multi");
        expect(columnTableKey("income-ledger", "single")).toBe("income-ledger:single");
        expect(columnTableKey("income-ledger")).toBe("income-ledger");
    });

    it("builds and reads back the preference key, refusing anything else", () => {
        expect(hiddenColumnsPrefKey("income-ledger:multi")).toBe("hidden-columns:income-ledger:multi");
        expect(tableKeyFromPrefKey("hidden-columns:income-ledger:multi")).toBe("income-ledger:multi");
        expect(tableKeyFromPrefKey("hidden-columns:income-ledger")).toBe("income-ledger");
        for (const bad of ["", "Income Ledger", "a:b:c", "../x", "x".repeat(41)]) expect(hiddenColumnsPrefKey(bad)).toBeNull();
        expect(tableKeyFromPrefKey("theme")).toBeNull();
        expect(tableKeyFromPrefKey("hidden-columns:")).toBeNull();
    });

    it("accepts only a list of column keys", () => {
        expect(sanitizeHiddenColumns(["energy", "received", "energy"])).toEqual(["energy", "received"]);
        expect(sanitizeHiddenColumns([])).toEqual([]);   // "show all" is a choice too
        expect(sanitizeHiddenColumns("energy")).toBeNull();
        expect(sanitizeHiddenColumns(["energy", 3])).toBeNull();
        expect(sanitizeHiddenColumns(["<script>"])).toBeNull();
        expect(sanitizeHiddenColumns(Array.from({ length: 61 }, (_, i) => `c${i}`))).toBeNull();
    });
});
