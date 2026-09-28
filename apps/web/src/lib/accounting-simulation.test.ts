import { describe, expect, it } from "vitest";
import { simulateMeasurementModels, taxOnGain, type MeasurementSimulationInput } from "./accounting-simulation";

const base: MeasurementSimulationInput = {
    startYear: 2026,
    horizonYears: 1,
    annualGrossRent: 144000,
    rentGrowthPct: 0,
    annualExpenses: 0,
    landCost: 300000,
    buildingCost: 1200000,
    usefulLifeYears: 25,
    accumulatedDepreciationAtStart: 0,
    initialFairValue: 1500000,
    appreciationPct: 0,
    annualValuationCost: 0,
};

describe("simulateMeasurementModels", () => {
    it("2026: depreciation lowers the lucro efetivo, not the tax of the year", () => {
        const r = simulateMeasurementModels(base);
        const y = r.years[0];
        // PIS 936 + COFINS 4.320 + IRPJ 6.912 + CSLL 4.147,20; CBS/IBS excused in the test year
        expect(y.taxes).toBeCloseTo(16315.2, 2);
        expect(y.presumedDistributable).toBeCloseTo(46080 - 16315.2, 2);
        expect(y.depreciation).toBe(48000);
        expect(y.profitA).toBeCloseTo(144000 - 16315.2 - 48000, 2);
        expect(y.profitB).toBeCloseTo(144000 - 16315.2, 2);
        expect(y.distributableA).toBeCloseTo(y.profitA, 2);
        expect(y.distributableB - y.distributableA).toBeCloseTo(48000, 2);
    });

    it("the presumed profit is the floor of the exempt distribution", () => {
        const r = simulateMeasurementModels({ ...base, annualExpenses: 120000 });
        const y = r.years[0];
        expect(y.profitA).toBeLessThan(y.presumedDistributable);
        expect(y.distributableA).toBe(y.presumedDistributable);
    });

    it("sale after 10 years: depreciation becomes taxable gain in model A only", () => {
        const r = simulateMeasurementModels({ ...base, horizonYears: 10 });
        expect(r.totals.depreciation).toBe(480000);
        expect(r.sale.saleValue).toBe(1500000);
        expect(r.sale.bookValueA).toBe(1020000);
        expect(r.sale.bookValueB).toBe(1500000);
        expect(r.sale.gainA).toBe(480000);
        expect(r.sale.gainB).toBe(0);
        // IRPJ 72.000 + adicional (11.520 + 480.000 − 60.000) × 10% = 43.152 + CSLL 43.200
        expect(r.sale.taxA).toBeCloseTo(158352, 2);
        expect(r.sale.taxB).toBe(0);
    });

    it("fair-value gains go to the reserve; a loss lowers the distributable profit", () => {
        const up = simulateMeasurementModels({ ...base, appreciationPct: 5 });
        expect(up.years[0].fairValueChange).toBe(75000);
        expect(up.totals.fairValueReserve).toBe(75000);
        expect(up.years[0].profitB).toBeCloseTo(144000 - 16315.2, 2);   // the gain is not distributable

        const down = simulateMeasurementModels({ ...base, appreciationPct: -2 });
        expect(down.years[0].fairValueChange).toBe(-30000);
        expect(down.years[0].profitB).toBeCloseTo(144000 - 16315.2 - 30000, 2);
        expect(down.totals.fairValueReserve).toBe(0);
    });

    it("model B pays the valuation every year", () => {
        const r = simulateMeasurementModels({ ...base, annualValuationCost: 3000, horizonYears: 3 });
        expect(r.totals.valuationCost).toBe(9000);
        expect(r.years[2].profitB).toBeCloseTo(r.years[2].grossRent - r.years[2].taxes - 3000, 2);
    });

    it("stops depreciating when the building is fully depreciated", () => {
        const r = simulateMeasurementModels({ ...base, accumulatedDepreciationAtStart: 1180000, horizonYears: 2 });
        expect(r.years[0].depreciation).toBe(20000);
        expect(r.years[1].depreciation).toBe(0);
    });

    it("from 2027 CBS/IBS enter the taxes of the year", () => {
        const r = simulateMeasurementModels({ ...base, startYear: 2027 });
        expect(r.years[0].taxes).toBeGreaterThan(0);
        expect(r.years[0].taxes).not.toBeCloseTo(16315.2, 0);
    });
});

describe("taxOnGain", () => {
    it("adds the IRPJ additional only on what the gain pushes over R$ 60 mil in the quarter", () => {
        expect(taxOnGain(0, 11520)).toBe(0);
        expect(taxOnGain(40000, 11520)).toBeCloseTo(40000 * 0.24, 2);            // quarter stays under 60 mil
        expect(taxOnGain(100000, 70000)).toBeCloseTo(100000 * 0.24 + 10000, 2);  // already over: all 100 mil pay 10%
    });
});
