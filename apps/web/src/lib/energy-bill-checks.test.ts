import { describe, expect, it } from "vitest";
import { extractionWarnings, normalizeExtractedNumbers } from "./energy-bill-checks";

describe("normalizeExtractedNumbers", () => {
    it("coerces numeric strings and leaves numbers, nulls and text fields alone", () => {
        const out = normalizeExtractedNumbers({
            totalAmount: "1.234,56",
            gridConsumptionKwh: "138 kWh",
            unitPrice: 0.95,
            solarCompensatedKwh: null,
            taxesIcms: "abc",
            consumerUnit: "3001234567",
        });
        expect(out.totalAmount).toBe(1234.56);
        expect(out.gridConsumptionKwh).toBe(138);
        expect(out.unitPrice).toBe(0.95);
        expect(out.solarCompensatedKwh).toBeNull();
        expect(out.taxesIcms).toBeNull();
        expect(out.consumerUnit).toBe("3001234567");
    });
});

describe("extractionWarnings", () => {
    const clean = {
        referenceMonth: "2026-08",
        gridReadingPrevious: 1000,
        gridReadingCurrent: 1138,
        gridConsumptionKwh: 138,
        totalAmount: 142.1,
        confidence: 0.93,
    };

    it("is silent for a consistent bill without solar", () => {
        expect(extractionWarnings(clean)).toEqual([]);
    });

    it("asks for the compensated kWh when there is solar activity and none was read", () => {
        const w = extractionWarnings({ ...clean, solarInjectedKwh: 320, energyCompensatedAmount: -110, solarCompensatedKwh: 0 });
        expect(w).toHaveLength(1);
        expect(w[0]).toContain("energia compensada");
        expect(extractionWarnings({ ...clean, solarInjectedKwh: 320, solarCompensatedKwh: 118 })).toEqual([]);
    });

    it("flags a consumption that disagrees with the meter readings", () => {
        const w = extractionWarnings({ ...clean, gridConsumptionKwh: 68 });
        expect(w.some((m) => m.includes("difere"))).toBe(true);
    });

    it("flags a missing month, a missing total and low confidence", () => {
        const w = extractionWarnings({ ...clean, referenceMonth: "AGO/26", totalAmount: 0, confidence: 0.4 });
        expect(w).toHaveLength(3);
    });

    it("tolerates null input", () => {
        expect(extractionWarnings(null)).toEqual([]);
    });
});
