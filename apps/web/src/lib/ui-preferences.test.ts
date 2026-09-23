import { describe, expect, it } from "vitest";
import {
    columnTableKey, filtersPrefKey, hiddenColumnsPrefKey, recordTableKey, sanitizeFilters, sanitizeHiddenColumns, sanitizeSort, sortPrefKey,
    tableKeyFromFiltersPrefKey, tableKeyFromPrefKey, tableKeyFromSortPrefKey,
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

describe("filter preferences", () => {
    it("is kept per record: the table plus the property's id", () => {
        const id = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
        expect(recordTableKey("income-ledger", id)).toBe("income-ledger:3f2504e0-4f89-11d3-9a0c-0305e82c3301");
        expect(filtersPrefKey(recordTableKey("income-ledger", id))).toBe("filters:income-ledger:3f2504e0-4f89-11d3-9a0c-0305e82c3301");
        expect(tableKeyFromFiltersPrefKey("filters:income-ledger:3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe("income-ledger:3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    });

    it("builds and reads back the preference key", () => {
        expect(filtersPrefKey("income-ledger:multi")).toBe("filters:income-ledger:multi");
        expect(tableKeyFromFiltersPrefKey("filters:income-ledger:multi")).toBe("income-ledger:multi");
        expect(tableKeyFromFiltersPrefKey("sort:income-ledger:multi")).toBeNull();
        expect(filtersPrefKey("a:b:c")).toBeNull();
    });

    it("keeps each column's filter as typed and drops the ones that say nothing", () => {
        expect(sanitizeFilters({
            status: { values: ["PAID", "PAID", "OPEN"] },
            tenant: { text: "ana" },
            amount: { min: "100", max: "" },
            month: { min: " ", max: "" },
            note: { text: "" },
            paid_on: {},
        })).toEqual({
            status: { values: ["PAID", "OPEN"] },
            tenant: { text: "ana" },
            amount: { min: "100" },
        });
        expect(sanitizeFilters({})).toEqual({});   // "no filters" is a choice too
        expect(sanitizeFilters({ status: { values: [] } })).toEqual({ status: { values: [] } });   // "none of them" filters everything out
    });

    it("refuses junk", () => {
        expect(sanitizeFilters([])).toBeNull();
        expect(sanitizeFilters("status")).toBeNull();
        expect(sanitizeFilters({ "<script>": { text: "x" } })).toBeNull();
        expect(sanitizeFilters({ status: "PAID" })).toBeNull();
        expect(sanitizeFilters({ status: { values: "PAID" } })).toBeNull();
        expect(sanitizeFilters({ status: { values: [1] } })).toBeNull();
        expect(sanitizeFilters({ tenant: { text: 3 } })).toBeNull();
        expect(sanitizeFilters({ tenant: { text: "x".repeat(201) } })).toBeNull();
        expect(sanitizeFilters(Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`c${i}`, { text: "a" }])))).toBeNull();
    });
});
