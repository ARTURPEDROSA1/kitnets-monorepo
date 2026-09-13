import { calculateIrpf2026, Irpf2026Input, CalculationResult } from './irpf2026';
import { IBS_CBS, nominalRatesForYear, rentalEffectiveRate } from './ibs-cbs';

/**
 * Taxes on rent received by an individual (pessoa física): IRPF on the annual
 * adjustment plus, for "large landlords" (LC 214/2025 art. 251), IBS + CBS.
 */
export interface RentalTaxInput {
    numberOfProperties: number;
    annualRentalRevenue: number;
    otherTaxableIncome: number;
    dependents: number;
    deductibleExpenses: number;
    taxYear: number;
    referenceYear: number;
    /** Residential leases get the R$ 600/property/month social reducer (art. 260). Default true. */
    residential?: boolean;
}

export interface RentalTaxResult {
    isLargeLandlord: boolean;
    ibsCbsApplicable: boolean;
    ibsCbsStartYear: string;

    // IRPF
    irpfBase: number;
    irpfTaxDue: number;
    irpfEffectiveRate: number;
    irpfCalculation: CalculationResult;

    // IBS/CBS
    /** Gross rental revenue minus the social reducer. */
    vatBase: number;
    /** Social reducer subtracted from the revenue (0 when not residential or not applicable). */
    vatSocialReducer: number;
    /** Nominal IBS+CBS rate for the year, before the 70% rental reduction. */
    vatNominalRate: number;
    /** Effective rate applied to the base (nominal × 30%). */
    vatRate: number;
    /** 2026: test year, the amounts are compensable/excused, nothing is due. */
    vatTestYear: boolean;
    vatTaxDue: number;

    // Total
    totalTaxDue: number;
    totalEffectiveRate: number;
}

export const RENTAL_TAX_CONFIG = {
    propertyThreshold: 3,
    revenueThreshold: 240000,
    acceleratedThreshold: 288000,
    standardVatRate: IBS_CBS.referenceTotal / 100,
    residentialReduction: IBS_CBS.rentalRateReduction,
    socialReducerMonthly: IBS_CBS.residentialSocialReducerMonthly,
};

export function calculateRentalTax(input: RentalTaxInput): RentalTaxResult {
    const {
        numberOfProperties,
        annualRentalRevenue,
        otherTaxableIncome,
        dependents,
        deductibleExpenses,
        taxYear,
        residential = true,
    } = input;

    // 1. Classification (art. 251): an individual is an IBS/CBS taxpayer when,
    //    in the previous year, revenue exceeded R$ 240k AND more than three
    //    properties were rented; above R$ 288k it applies in the current year.
    const isLargeLandlord = numberOfProperties > RENTAL_TAX_CONFIG.propertyThreshold &&
        annualRentalRevenue > RENTAL_TAX_CONFIG.revenueThreshold;

    let ibsCbsApplicable = false;
    let ibsCbsStartYear = 'N/A';

    if (isLargeLandlord) {
        if (annualRentalRevenue > RENTAL_TAX_CONFIG.acceleratedThreshold) {
            ibsCbsApplicable = true;
            ibsCbsStartYear = taxYear.toString();
        } else {
            ibsCbsApplicable = false; // from next year on
            ibsCbsStartYear = (taxYear + 1).toString();
        }
    }

    // 2. IRPF: rent + other taxable income, annual adjustment. IBS/CBS paid is
    //    not deductible from the IRPF base.
    const grossIncome = annualRentalRevenue + otherTaxableIncome;

    const irpfInput: Irpf2026Input = {
        grossIncome,
        dependents,
        officialPension: 0,
        alimony: 0,
        otherDeductions: deductibleExpenses,
        isOver65: false,
        mode: 'annual',
    };
    const irpfResult = calculateIrpf2026(irpfInput);

    // 3. IBS + CBS for the chosen year: nominal rate from the transition
    //    schedule, 70% rental reduction, R$ 600/property/month off the base
    //    for residential leases. 2026 is the test year: nothing is due.
    const rates = nominalRatesForYear(taxYear);
    const vatNominalRate = (rates.cbs + rates.ibs) / 100;
    const effectiveRate = rentalEffectiveRate(rates);

    let vatSocialReducer = 0;
    let vatBase = 0;
    let vatRate = 0;
    let vatTaxDue = 0;
    const vatTestYear = ibsCbsApplicable && rates.testYear;

    if (ibsCbsApplicable) {
        vatSocialReducer = residential
            ? Math.min(annualRentalRevenue, RENTAL_TAX_CONFIG.socialReducerMonthly * 12 * Math.max(0, numberOfProperties))
            : 0;
        vatBase = Math.max(0, annualRentalRevenue - vatSocialReducer);
        vatRate = effectiveRate;
        vatTaxDue = rates.testYear ? 0 : vatBase * vatRate;
    }

    // 4. Total
    const totalTaxDue = irpfResult.dueTax + vatTaxDue;
    const totalEffectiveRate = grossIncome > 0 ? totalTaxDue / grossIncome : 0;

    return {
        isLargeLandlord,
        ibsCbsApplicable,
        ibsCbsStartYear,

        irpfBase: irpfResult.baseCalculation,
        irpfTaxDue: irpfResult.dueTax,
        irpfEffectiveRate: irpfResult.effectiveRate,
        irpfCalculation: irpfResult,

        vatBase,
        vatSocialReducer,
        vatNominalRate,
        vatRate,
        vatTestYear,
        vatTaxDue,

        totalTaxDue,
        totalEffectiveRate,
    };
}
