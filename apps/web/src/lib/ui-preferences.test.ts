import { describe, expect, it } from "vitest";
import {
    columnTableKey, hiddenColumnsPrefKey, sanitizeHiddenColumns, sanitizeSort, sortPrefKey, tableKeyFromPrefKey, tableKeyFromSortPrefKey,
} from "./ui-preferences";

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

describe("sort preferences", () => {
    it("builds and reads back the preference key, refusing anything else", () => {
        expect(sortPrefKey("investment-payments")).toBe("sort:investment-payments");
        expect(sortPrefKey("income-ledger:multi")).toBe("sort:income-ledger:multi");
        expect(tableKeyFromSortPrefKey("sort:investment-payments")).toBe("investment-payments");
        for (const bad of ["", "Payments", "a:b:c", "../x"]) expect(sortPrefKey(bad)).toBeNull();
        expect(tableKeyFromSortPrefKey("hidden-columns:investment-payments")).toBeNull();
        expect(tableKeyFromSortPrefKey("sort:")).toBeNull();
    });

    it("accepts only a column key and a direction", () => {
        expect(sanitizeSort({ key: "due_on", dir: "asc" })).toEqual({ key: "due_on", dir: "asc" });
        expect(sanitizeSort({ key: "paid_on", dir: "desc", extra: 1 })).toEqual({ key: "paid_on", dir: "desc" });
        expect(sanitizeSort({ key: "due_on", dir: "up" })).toBeNull();
        expect(sanitizeSort({ key: "<script>", dir: "asc" })).toBeNull();
        expect(sanitizeSort({ dir: "asc" })).toBeNull();
        expect(sanitizeSort(["due_on", "asc"])).toBeNull();
        expect(sanitizeSort("due_on")).toBeNull();
        expect(sanitizeSort(null)).toBeNull();
    });
});
