
import { calculateIrpf2026, Irpf2026Input, CalculationResult } from './irpf2026';

export interface RentalTaxInput {
    numberOfProperties: number;
    annualRentalRevenue: number;
    otherTaxableIncome: number;
    dependents: number;
    deductibleExpenses: number;
    taxYear: number;
    referenceYear: number;
}

export interface RentalTaxResult {
    isLargeLandlord: boolean;
    ibsCbsApplicable: boolean;
    ibsCbsStartYear: string;

    // IRPF Results
    irpfBase: number;
    irpfTaxDue: number;
    irpfEffectiveRate: number;
    irpfCalculation: CalculationResult;

    // IBS/CBS Results
    vatBase: number;
    vatRate: number; // 0.084 normally
    vatTaxDue: number;

    // Total
    totalTaxDue: number;
    totalEffectiveRate: number;
}

export const RENTAL_TAX_CONFIG = {
    propertyThreshold: 3,
    revenueThreshold: 240000,
    acceleratedThreshold: 288000,
    standardVatRate: 0.28,
    residentialReduction: 0.70,
};

export function calculateRentalTax(input: RentalTaxInput): RentalTaxResult {
    const {
        numberOfProperties,
        annualRentalRevenue,
        otherTaxableIncome,
        dependents,
        deductibleExpenses
    } = input;

    // 1. Classification
    // "An individual becomes a mandatory taxpayer ... when, in the previous calendar year, BOTH conditions are met"
    // We assume the inputs represent the relevant period for classification AND tax base for simplicity
    // or as a scenario builder.
    const isLargeLandlord = numberOfProperties > RENTAL_TAX_CONFIG.propertyThreshold &&
        annualRentalRevenue > RENTAL_TAX_CONFIG.revenueThreshold;

    // 2. Timing / Applicability
    // IF Large Landlord = YES:
    //    IF revenue > 288,000: IBS/CBS applies in the current tax year
    //    ELSE: IBS/CBS applies in the following tax year
    let ibsCbsApplicable = false;
    let ibsCbsStartYear = 'N/A';

    if (isLargeLandlord) {
        if (annualRentalRevenue > RENTAL_TAX_CONFIG.acceleratedThreshold) {
            ibsCbsApplicable = true;
            ibsCbsStartYear = input.taxYear.toString();
        } else {
            ibsCbsApplicable = false; // Applies next year
            ibsCbsStartYear = (input.taxYear + 1).toString();
        }
    }

    // 3. IRPF Calculation
    // Base = Rental Income + Other Taxable Income
    // Note: If IBS/CBS is paid, is it deductible from IRPF base?
    // The prompt says: "Taxation (cumulative): IRPF + CBS + IBS. There is no replacement of IRPF."
    // It does NOT explicitly say IBS/CBS is deductible from IRPF base.
    // However, usually taxes paid are not deductible unless specified (like Book Cash).
    // Prompt 6.1 says "Taxation (cumulative)". 
    // Prompt 7.1 IRPF Tax Base: "Rental income + Other taxable income - Legally allowed deductions".
    // It doesn't mention IBS/CBS deduction. I will assume it's NOT deductible for now.

    const grossIncome = annualRentalRevenue + otherTaxableIncome;

    const irpfInput: Irpf2026Input = {
        grossIncome: grossIncome,
        dependents: dependents,
        officialPension: 0, // Not separated in input
        alimony: 0, // Not separated
        otherDeductions: deductibleExpenses,
        isOver65: false, // Not asked
        mode: 'annual'
    };

    const irpfResult = calculateIrpf2026(irpfInput);

    // 4. IBS + CBS Calculation
    // Tax base: 100% of gross rental revenue
    // Effective VAT rate = 28% * (1 - 70%) = 8.4%
    // Only if applicable in current year.

    let vatRate = 0;
    let vatTaxDue = 0;
    const effectiveVatRate = RENTAL_TAX_CONFIG.standardVatRate * (1 - RENTAL_TAX_CONFIG.residentialReduction); // 0.084

    if (ibsCbsApplicable) {
        vatRate = effectiveVatRate;
        vatTaxDue = annualRentalRevenue * vatRate;
    }

    // 5. Total
    const totalTaxDue = irpfResult.dueTax + vatTaxDue;
    const totalEffectiveRate = grossIncome > 0 ? totalTaxDue / grossIncome : 0; // Effective over Total Gross Income? Or just Rental?
    // Prompt 8.2 Card 4 says "Effective rate over gross revenue". Usually implies Total Revenue (Rental + Other).
    // Let's use Total Gross Income (Rental + Other).

    return {
        isLargeLandlord,
        ibsCbsApplicable,
        ibsCbsStartYear,

        irpfBase: irpfResult.baseCalculation,
        irpfTaxDue: irpfResult.dueTax,
        irpfEffectiveRate: irpfResult.effectiveRate,
        irpfCalculation: irpfResult,

        vatBase: annualRentalRevenue,
        vatRate: vatRate,
        vatTaxDue,

        totalTaxDue,
        totalEffectiveRate
    };
}
