import { IBS_CBS, YearRates } from "./ibs-cbs";

/**
 * Taxes on rent received by a company under Lucro Presumido (holding familiar).
 *
 * - PIS 0,65% and COFINS 3% (cumulative regime) on gross revenue while they
 *   exist; CBS/IBS on gross revenue with the 70% rental reduction.
 * - IRPJ 15% and CSLL 9% on the presumed profit, which is 32% of the GROSS
 *   revenue (receita bruta). Taxes on revenue do not reduce that base.
 * - IRPJ additional 10% on the part of the presumed profit that exceeds
 *   R$ 60.000 per QUARTER (R$ 20.000 × 3); it is assessed quarterly, not
 *   month by month.
 */
export const HOLDING = {
    presumedProfitShare: 0.32,
    irpjRate: 0.15,
    irpjAdditionalRate: 0.10,
    irpjAdditionalQuarterlyThreshold: 60000,
    csllRate: 0.09,
    rentalRateReduction: IBS_CBS.rentalRateReduction,
} as const;

export interface HoldingMonthTax {
    revenue: number;
    presumedProfit: number;
    /** Revenue after the taxes on revenue (informative; not the IRPJ base). */
    netRevenue: number;
    irpjBasic: number;
    irpjAdditional: number;
    csll: number;
    cbs: number;
    ibs: number;
    pis: number;
    cofins: number;
    totalIva: number;
    totalIrpjCsll: number;
    totalLegacy: number;
    totalTax: number;
}

export interface HoldingTaxes {
    months: HoldingMonthTax[];
    totals: HoldingMonthTax;
}

const ZERO: HoldingMonthTax = {
    revenue: 0, presumedProfit: 0, netRevenue: 0, irpjBasic: 0, irpjAdditional: 0, csll: 0,
    cbs: 0, ibs: 0, pis: 0, cofins: 0, totalIva: 0, totalIrpjCsll: 0, totalLegacy: 0, totalTax: 0,
};

/**
 * @param monthlyRevenues gross rent per month, January first (12 entries).
 * @param rates nominal rates in percent for the year (see nominalRatesForYear).
 */
export function computeHoldingTaxes(
    monthlyRevenues: number[],
    rates: Pick<YearRates, "cbs" | "ibs" | "pis" | "cofins">
): HoldingTaxes {
    const effectiveFactor = 1 - HOLDING.rentalRateReduction;

    const months: HoldingMonthTax[] = monthlyRevenues.map((revenue) => {
        const pis = revenue * (rates.pis / 100);
        const cofins = revenue * (rates.cofins / 100);
        const cbs = revenue * ((rates.cbs * effectiveFactor) / 100);
        const ibs = revenue * ((rates.ibs * effectiveFactor) / 100);

        const presumedProfit = revenue * HOLDING.presumedProfitShare;
        const irpjBasic = presumedProfit * HOLDING.irpjRate;
        const csll = presumedProfit * HOLDING.csllRate;

        return {
            ...ZERO,
            revenue,
            presumedProfit,
            netRevenue: revenue - (pis + cofins + cbs + ibs),
            irpjBasic,
            csll,
            cbs,
            ibs,
            pis,
            cofins,
        };
    });

    // IRPJ additional per quarter, spread over the quarter's months in
    // proportion to each month's presumed profit so monthly rows add up.
    for (let q = 0; q * 3 < months.length; q++) {
        const slice = months.slice(q * 3, q * 3 + 3);
        const presumedQuarter = slice.reduce((s, m) => s + m.presumedProfit, 0);
        const additional = Math.max(0, presumedQuarter - HOLDING.irpjAdditionalQuarterlyThreshold) * HOLDING.irpjAdditionalRate;
        if (additional > 0 && presumedQuarter > 0) {
            for (const m of slice) m.irpjAdditional = additional * (m.presumedProfit / presumedQuarter);
        }
    }

    for (const m of months) {
        m.totalIva = m.cbs + m.ibs;
        m.totalLegacy = m.pis + m.cofins;
        m.totalIrpjCsll = m.irpjBasic + m.irpjAdditional + m.csll;
        m.totalTax = m.totalIrpjCsll + m.totalIva + m.totalLegacy;
    }

    const totals = months.reduce<HoldingMonthTax>((acc, m) => {
        for (const k of Object.keys(ZERO) as (keyof HoldingMonthTax)[]) acc[k] += m[k];
        return acc;
    }, { ...ZERO });

    return { months, totals };
}
