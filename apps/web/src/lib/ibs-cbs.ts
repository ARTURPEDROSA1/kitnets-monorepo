/**
 * IBS/CBS (Reforma Tributária, LC 214/2025) transition schedule shared by the
 * rental-tax calculators.
 *
 * Reference full rate 28% (CBS 8.8% + IBS 19.2%, official estimate); the
 * caller may pass another total and the CBS/IBS split is kept.
 *
 * Schedule (LC 214, arts. 343-349 and ADCT arts. 125-130):
 * - 2026: test year. CBS 0.9% + IBS 0.1%, compensable with PIS/COFINS; taxpayers
 *   that comply with the accessory obligations are excused from paying.
 *   PIS/COFINS still apply.
 * - 2027-2028: CBS at the full rate minus 0.1 pp, IBS 0.1%; PIS/COFINS extinct.
 * - 2029-2032: CBS full; IBS phases in at 10/20/30/40% of its rate while
 *   ICMS/ISS shrink accordingly.
 * - 2033: full CBS and IBS.
 *
 * Real-estate rentals get a 70% rate reduction (art. 261) and residential
 * leases a social reducer of R$ 600 per property per month (art. 260).
 */
export const IBS_CBS = {
    referenceTotal: 28.0,
    referenceCbs: 8.8,
    referenceIbs: 19.2,
    testYear: 2026,
    /** Rate reduction for locação de imóveis (art. 261). */
    rentalRateReduction: 0.70,
    /** Redutor social for residential leases, per property per month (art. 260). */
    residentialSocialReducerMonthly: 600,
} as const;

/** Nominal rates in percent for one calendar year. */
export interface YearRates {
    year: number;
    cbs: number;
    ibs: number;
    pis: number;
    cofins: number;
    /** 2026: amounts are compensable/excused, so nothing is effectively due. */
    testYear: boolean;
}

export function nominalRatesForYear(year: number, targetTotal: number = IBS_CBS.referenceTotal): YearRates {
    const scale = targetTotal / IBS_CBS.referenceTotal;
    const fullCbs = IBS_CBS.referenceCbs * scale;
    const fullIbs = IBS_CBS.referenceIbs * scale;

    if (year < IBS_CBS.testYear) {
        return { year, cbs: 0, ibs: 0, pis: 0.65, cofins: 3.0, testYear: false };
    }
    if (year === IBS_CBS.testYear) {
        return { year, cbs: 0.9, ibs: 0.1, pis: 0.65, cofins: 3.0, testYear: true };
    }
    if (year <= 2028) {
        return { year, cbs: fullCbs - 0.1, ibs: 0.1, pis: 0, cofins: 0, testYear: false };
    }
    if (year <= 2032) {
        const share = (year - 2028) / 10; // 0.1, 0.2, 0.3, 0.4
        return { year, cbs: fullCbs, ibs: fullIbs * share, pis: 0, cofins: 0, testYear: false };
    }
    return { year, cbs: fullCbs, ibs: fullIbs, pis: 0, cofins: 0, testYear: false };
}

/** Combined IBS+CBS rate (fraction) after the 70% rental reduction. */
export function rentalEffectiveRate(rates: Pick<YearRates, "cbs" | "ibs">): number {
    return ((rates.cbs + rates.ibs) / 100) * (1 - IBS_CBS.rentalRateReduction);
}
