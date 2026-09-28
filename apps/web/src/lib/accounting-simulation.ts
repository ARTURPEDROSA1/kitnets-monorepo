/**
 * Side-by-side simulation of the two measurement models for the holding's rented
 * properties, under Lucro Presumido (Contábil & Fiscal › Políticas contábeis):
 *
 *   A — NBC TG 1002, cost less depreciation (straight line, the building only);
 *   B — full standards, CPC 28 at fair value (no depreciation, annual valuation).
 *
 * What differs is not the tax of the year (presumed profit ignores expenses) but:
 *   1. the exempt distribution: above the presumed profit less the taxes (RIR/2018 art. 725
 *      §1), the holding may distribute the "lucro efetivo" shown by its books (§2).
 *      Depreciation lowers it; unrealised fair-value gains are kept in a reserve and not
 *      distributed (a fair-value loss does lower it);
 *   2. the tax on a sale: the capital gain is sale − book value (Lei 9.430 art. 25 §1).
 *      Depreciation lowers the book value; fair-value adjustments are left out of it (§4).
 *
 * Taxes of the year come from lib/holding-rental-tax (PIS/COFINS or CBS/IBS, IRPJ with the
 * quarterly additional, CSLL). In 2026, the test year, CBS/IBS are excused (compliance
 * with the accessory obligations) and left out.
 */
import { computeHoldingTaxes, HOLDING } from "./holding-rental-tax";
import { nominalRatesForYear } from "./ibs-cbs";

export interface MeasurementSimulationInput {
    startYear: number;
    horizonYears: number;
    /** gross rent of the first year (contract values, before the agency fee) */
    annualGrossRent: number;
    /** yearly rent adjustment, % (also applied to the expenses) */
    rentGrowthPct: number;
    /** operating expenses of the first year, without depreciation and without taxes */
    annualExpenses: number;
    landCost: number;
    /** building + improvements (the depreciable part) */
    buildingCost: number;
    usefulLifeYears: number;
    /** depreciation already booked before the first simulated year (model A) */
    accumulatedDepreciationAtStart: number;
    /** market value at the start (model B); 0 → land + building cost */
    initialFairValue: number;
    /** yearly appreciation of the market value, % (can be negative) */
    appreciationPct: number;
    /** yearly cost of the valuation (laudo) in model B */
    annualValuationCost: number;
}

export interface SimulationYear {
    year: number;
    grossRent: number;
    expenses: number;
    /** taxes of the year (on revenue and on the presumed profit) */
    taxes: number;
    /** presumed profit less the taxes: exempt without looking at the books */
    presumedDistributable: number;
    depreciation: number;
    /** lucro efetivo, model A */
    profitA: number;
    /** lucro efetivo, model B, without unrealised fair-value gains */
    profitB: number;
    fairValue: number;
    /** change in fair value booked in the year (model B) */
    fairValueChange: number;
    distributableA: number;
    distributableB: number;
}

export interface SimulationSale {
    saleValue: number;
    bookValueA: number;
    bookValueB: number;
    gainA: number;
    gainB: number;
    taxA: number;
    taxB: number;
}

export interface SimulationResult {
    years: SimulationYear[];
    totals: {
        depreciation: number;
        distributableA: number;
        distributableB: number;
        /** unrealised fair-value gains kept in reserve at the end (model B) */
        fairValueReserve: number;
        valuationCost: number;
    };
    sale: SimulationSale;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/** IRPJ (15% + 10% over R$ 60 mil in the quarter) + CSLL (9%) on a gain booked in one quarter. */
export function taxOnGain(gain: number, quarterPresumedProfit: number): number {
    if (!(gain > 0)) return 0;
    const t = HOLDING.irpjAdditionalQuarterlyThreshold;
    const additional = (Math.max(0, quarterPresumedProfit + gain - t) - Math.max(0, quarterPresumedProfit - t)) * HOLDING.irpjAdditionalRate;
    return r2(gain * HOLDING.irpjRate + additional + gain * HOLDING.csllRate);
}

function yearTaxes(year: number, annualRent: number): { total: number; presumed: number } {
    const rates = nominalRatesForYear(year);
    const { totals } = computeHoldingTaxes(Array(12).fill(annualRent / 12), rates);
    const total = rates.testYear ? totals.totalTax - totals.totalIva : totals.totalTax;
    return { total: r2(total), presumed: r2(totals.presumedProfit) };
}

export function simulateMeasurementModels(raw: MeasurementSimulationInput): SimulationResult {
    const horizon = Math.min(40, Math.max(1, Math.round(num(raw.horizonYears, 10))));
    const startYear = Math.round(num(raw.startYear, new Date().getFullYear()));
    const growth = num(raw.rentGrowthPct) / 100;
    const appreciation = num(raw.appreciationPct) / 100;
    const land = Math.max(0, num(raw.landCost));
    const building = Math.max(0, num(raw.buildingCost));
    const life = Math.max(1, num(raw.usefulLifeYears, 25));
    const valuationCost = Math.max(0, num(raw.annualValuationCost));
    let accumulated = Math.min(building, Math.max(0, num(raw.accumulatedDepreciationAtStart)));
    let fairValue = num(raw.initialFairValue) > 0 ? num(raw.initialFairValue) : land + building;
    let rent = Math.max(0, num(raw.annualGrossRent));
    let expenses = Math.max(0, num(raw.annualExpenses));

    const years: SimulationYear[] = [];
    let reserve = 0;
    for (let i = 0; i < horizon; i++) {
        const year = startYear + i;
        if (i > 0) { rent *= 1 + growth; expenses *= 1 + growth; }
        const { total: taxes, presumed } = yearTaxes(year, rent);
        const presumedDistributable = r2(Math.max(0, presumed - taxes));
        const depreciation = r2(Math.min(building / life, building - accumulated));
        accumulated += depreciation;
        const previousFv = fairValue;
        fairValue = fairValue * (1 + appreciation);
        const fvChange = r2(fairValue - previousFv);
        reserve += Math.max(0, fvChange);

        const base = rent - expenses - taxes;
        const profitA = r2(base - depreciation);
        const profitB = r2(base - valuationCost + Math.min(0, fvChange));
        years.push({
            year,
            grossRent: r2(rent),
            expenses: r2(expenses),
            taxes,
            presumedDistributable,
            depreciation,
            profitA,
            profitB,
            fairValue: r2(fairValue),
            fairValueChange: fvChange,
            distributableA: r2(Math.max(presumedDistributable, profitA)),
            distributableB: r2(Math.max(presumedDistributable, profitB)),
        });
    }

    const last = years[years.length - 1];
    const quarterPresumed = (last.grossRent / 4) * HOLDING.presumedProfitShare;
    const saleValue = r2(fairValue);
    const bookValueA = r2(land + building - accumulated);
    const bookValueB = r2(land + building);   // fair-value adjustments stay out (Lei 9.430 art. 25 §4)
    const gainA = r2(Math.max(0, saleValue - bookValueA));
    const gainB = r2(Math.max(0, saleValue - bookValueB));

    return {
        years,
        totals: {
            depreciation: r2(years.reduce((s, y) => s + y.depreciation, 0)),
            distributableA: r2(years.reduce((s, y) => s + y.distributableA, 0)),
            distributableB: r2(years.reduce((s, y) => s + y.distributableB, 0)),
            fairValueReserve: r2(reserve),
            valuationCost: r2(valuationCost * horizon),
        },
        sale: { saleValue, bookValueA, bookValueB, gainA, gainB, taxA: taxOnGain(gainA, quarterPresumed), taxB: taxOnGain(gainB, quarterPresumed) },
    };
}
