export interface Irpf2026Constants {
    simplifiedDiscount: number;
    dependentDeduction: number;
    exemption65: number;
    table: {
        limit: number;
        rate: number;
        deduction: number;
    }[];
    reduction: {
        thresholdA: number;
        fixedA: number;
        thresholdB: number;
        fixedB: number;
        factorB: number;
        thresholdC: number;
    };
}

export const CONSTANTS_2026_MONTHLY: Irpf2026Constants = {
    simplifiedDiscount: 607.20,
    dependentDeduction: 189.59,
    exemption65: 2428.80,
    table: [
        { limit: 2428.80, rate: 0, deduction: 0 },
        { limit: 2826.65, rate: 0.075, deduction: 182.16 },
        { limit: 3751.05, rate: 0.15, deduction: 394.16 },
        { limit: 4664.68, rate: 0.225, deduction: 675.49 },
        { limit: Infinity, rate: 0.275, deduction: 908.73 },
    ],
    reduction: {
        thresholdA: 5000.00,
        fixedA: 312.89,
        thresholdB: 7350.00,
        fixedB: 978.62,
        factorB: 0.133145,
        thresholdC: 7350.00
    }
};

export const CONSTANTS_2026_ANNUAL: Irpf2026Constants = {
    simplifiedDiscount: 17640.00,
    dependentDeduction: 2275.08,
    exemption65: 28467.20,
    table: [
        { limit: 28467.20, rate: 0, deduction: 0 },
        { limit: 33919.80, rate: 0.075, deduction: 2135.04 },
        { limit: 45012.60, rate: 0.15, deduction: 4679.03 },
        { limit: 55976.16, rate: 0.225, deduction: 8054.97 },
        { limit: Infinity, rate: 0.275, deduction: 10853.78 },
    ],
    reduction: {
        thresholdA: 60000.00,
        fixedA: 2694.15,
        thresholdB: 88200.00,
        fixedB: 8429.73,
        factorB: 0.095575,
        thresholdC: 88200.00
    }
};

export interface CalculationResult {
    grossIncome: number;
    legalDeductionsTotal: number;
    simplifiedDiscountValue: number;
    usedDeduction: number;
    deductionType: 'simplified' | 'legal';
    baseCalculation: number;
    calculatedTax: number;
    reductionApplied: number;
    dueTax: number;
    effectiveRate: number;
    tableSteps: {
        range: string;
        base: number;
        rate: number;
        tax: number;
    }[];
}

export interface Irpf2026Input {
    grossIncome: number;
    dependents: number;
    officialPension: number;
    alimony: number;
    otherDeductions: number;
    isOver65: boolean;
    mode: 'monthly' | 'annual';
}

export function calculateIrpf2026(input: Irpf2026Input): CalculationResult {
    const { grossIncome, dependents, officialPension, alimony, otherDeductions, isOver65, mode } = input;
    const constants = mode === 'monthly' ? CONSTANTS_2026_MONTHLY : CONSTANTS_2026_ANNUAL;

    // 1. Calculate Deductions

    // Exemption for 65+
    let exemption65Value = 0;
    if (isOver65) {
        exemption65Value = Math.min(grossIncome, constants.exemption65);
    }

    const dependentValue = dependents * constants.dependentDeduction;
    const totalLegalDeductions = dependentValue + officialPension + alimony + otherDeductions + exemption65Value;

    // Simplified Discount
    const simplifiedValue = constants.simplifiedDiscount;

    // Choose best
    const useSimplified = simplifiedValue > totalLegalDeductions;
    const usedDeduction = useSimplified ? simplifiedValue : totalLegalDeductions;

    // Base Calculation
    const baseCalculation = Math.max(0, grossIncome - usedDeduction);

    // Calculate Tax based on Progressive Table
    let calculatedTax = 0;
    const tableSteps = [];

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    let previousLimit = 0;

    for (let i = 0; i < constants.table.length; i++) {
        const row = constants.table[i];
        const limit = row.limit;
        const rate = row.rate;

        const lower = previousLimit;
        const upper = i === constants.table.length - 1 ? Infinity : limit;

        let portion = 0;
        if (baseCalculation > lower) {
            portion = Math.min(baseCalculation, upper) - lower;
        }

        const taxForPortion = portion * rate;

        // Build table step
        let rangeLabel = "";
        if (i === 0) rangeLabel = `Até ${formatCurrency(limit)}`;
        else if (i === constants.table.length - 1) rangeLabel = `Acima de ${formatCurrency(previousLimit)}`;
        else rangeLabel = `De ${formatCurrency(previousLimit + 0.01)} até ${formatCurrency(limit)}`;

        tableSteps.push({
            range: rangeLabel,
            base: portion,
            rate: rate,
            tax: taxForPortion
        });

        calculatedTax += taxForPortion;
        previousLimit = limit;
    }

    // 6. Reduction Logic (Lei 15.270/2025)
    let reduction = 0;
    let dueTax = 0;

    // Reduction depends on GROSS INCOME (Rendimentos Tributáveis), NOT Base.
    const r_income = grossIncome;

    if (mode === 'monthly') {
        if (r_income <= constants.reduction.thresholdA) {
            // Case A
            reduction = Math.min(calculatedTax, constants.reduction.fixedA);
            dueTax = 0;
        } else if (r_income <= constants.reduction.thresholdB) {
            // Case B
            const calculatedReduction = constants.reduction.fixedB - (constants.reduction.factorB * r_income);
            reduction = Math.max(0, calculatedReduction);
            reduction = Math.min(reduction, calculatedTax);
            dueTax = Math.max(0, calculatedTax - reduction);
        } else {
            // Case C
            reduction = 0;
            dueTax = calculatedTax;
        }
    } else {
        if (r_income <= constants.reduction.thresholdA) {
            // Case A
            reduction = Math.min(calculatedTax, constants.reduction.fixedA);
            dueTax = 0;
        } else if (r_income <= constants.reduction.thresholdB) {
            // Case B
            const calculatedReduction = constants.reduction.fixedB - (constants.reduction.factorB * r_income);
            reduction = Math.max(0, calculatedReduction);
            reduction = Math.min(reduction, calculatedTax);
            dueTax = Math.max(0, calculatedTax - reduction);
        } else {
            reduction = 0;
            dueTax = calculatedTax;
        }
    }

    // Final effective rate
    const effectiveRate = grossIncome > 0 ? dueTax / grossIncome : 0;

    return {
        grossIncome,
        legalDeductionsTotal: totalLegalDeductions,
        simplifiedDiscountValue: simplifiedValue,
        usedDeduction,
        deductionType: useSimplified ? 'simplified' : 'legal',
        baseCalculation,
        calculatedTax,
        reductionApplied: reduction,
        dueTax,
        effectiveRate,
        tableSteps
    };
}
