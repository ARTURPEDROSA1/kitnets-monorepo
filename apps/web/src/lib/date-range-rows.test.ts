import { describe, expect, it } from "vitest";
import { sliceByDateRange } from "./date-range-rows";

const rows = [
    { reference_date: "2024-11-01", v: 1 },
    { reference_date: "2024-12-01", v: 2 },
    { reference_date: "2025-01-01", v: 3 },
    { reference_date: "2025-02-01", v: 4 },
];

describe("sliceByDateRange", () => {
    it("keeps the rows inside the window, bounds included, in the same order", () => {
        expect(sliceByDateRange(rows, "2024-12-01", "2025-01-01").map(r => r.v)).toEqual([2, 3]);
    });

    it("takes one bound alone", () => {
        expect(sliceByDateRange(rows, "2025-01-01").map(r => r.v)).toEqual([3, 4]);
        expect(sliceByDateRange(rows, undefined, "2024-12-01").map(r => r.v)).toEqual([1, 2]);
        expect(sliceByDateRange(rows, null, null).map(r => r.v)).toEqual([1, 2, 3, 4]);
    });

    it("returns a copy, never the cached list itself", () => {
        const copy = sliceByDateRange(rows);
        expect(copy).toEqual(rows);
        expect(copy).not.toBe(rows);
    });

    it("is empty when the window misses the series", () => {
        expect(sliceByDateRange(rows, "2026-01-01")).toEqual([]);
    });
});
