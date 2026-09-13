/**
 * IRPF 2026 (ano-calendário 2026): monthly withholding table and annual
 * adjustment, both with the reduction created by Lei 15.270/2025.
 *
 * Sources: Lei 15.191/2025 (table in force since May 2025, monthly simplified
 * discount R$ 607,20, 65+ exempt portion R$ 2.428,80) and Lei 15.270/2025
 * (reduction for taxable income up to R$ 5.000/month, phased out until
 * R$ 7.350; annually R$ 60.000 and R$ 88.200).
 *
 * Annual figures are twelve times the monthly ones because the May-2025
 * table applies to the whole of 2026. The annual simplified discount is the
 * classic 20% of taxable income capped at R$ 16.754,34 (Lei 9.250 art. 10),
 * not a fixed amount.
 */
export type SimplifiedDiscountRule =
    | { kind: "fixed"; value: number }
    | { kind: "percent"; rate: number; cap: number };

export interface Irpf2026Constants {
    simplified: SimplifiedDiscountRule;
    dependentDeduction: number;
    /** Extra exempt portion for taxpayers aged 65+ (Lei 7.713 art. 6º XV). */
    exemption65: number;
    table: {
        limit: number;
        rate: number;
        deduction: number;
    }[];
    reduction: {
        /** Taxable income up to which the tax is fully waived (capped at maxReduction). */
        fullUpTo: number;
        maxReduction: number;
        /** Taxable income up to which a partial reduction applies. */
        partialUpTo: number;
        /** reduction = intercept - slope * taxableIncome */
        intercept: number;
        slope: number;
    };
}

export const CONSTANTS_2026_MONTHLY: Irpf2026Constants = {
    simplified: { kind: "fixed", value: 607.20 },
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
        fullUpTo: 5000.00,
        maxReduction: 312.89,
        partialUpTo: 7350.00,
        intercept: 978.62,
        slope: 0.133145,
    },
};

export const CONSTANTS_2026_ANNUAL: Irpf2026Constants = {
    simplified: { kind: "percent", rate: 0.20, cap: 16754.34 },
    dependentDeduction: 2275.08,
    // 12 × 2.428,80. The 13º salário's exempt portion is applied at source,
    // outside the annual adjustment, so it is not included here.
    exemption65: 29145.60,
    table: [
        { limit: 29145.60, rate: 0, deduction: 0 },
        { limit: 33919.80, rate: 0.075, deduction: 2185.92 },
        { limit: 45012.60, rate: 0.15, deduction: 4729.92 },
        { limit: 55976.16, rate: 0.225, deduction: 8105.88 },
        { limit: Infinity, rate: 0.275, deduction: 10904.76 },
    ],
    reduction: {
        fullUpTo: 60000.00,
        maxReduction: 3754.68,
        partialUpTo: 88200.00,
        intercept: 11743.44,
        slope: 0.133145,
    },
};

export interface CalculationResult {
    grossIncome: number;
    /** Gross income minus the 65+ exempt portion: the "rendimentos tributáveis". */
    taxableIncome: number;
    exemption65Value: number;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

export function simplifiedDiscountFor(rule: SimplifiedDiscountRule, taxableIncome: number): number {
    if (rule.kind === "fixed") return rule.value;
    return Math.min(taxableIncome * rule.rate, rule.cap);
}

export function calculateIrpf2026(input: Irpf2026Input): CalculationResult {
    const { grossIncome, dependents, officialPension, alimony, otherDeductions, isOver65, mode } = input;
    const constants = mode === 'monthly' ? CONSTANTS_2026_MONTHLY : CONSTANTS_2026_ANNUAL;

    // 1. The 65+ portion is exempt income, not a deduction: it leaves the
    //    taxable income before either deduction regime is chosen, so it is
    //    never lost when the simplified discount wins.
    const exemption65Value = isOver65 ? Math.min(grossIncome, constants.exemption65) : 0;
    const taxableIncome = Math.max(0, grossIncome - exemption65Value);

    // 2. Deductions: legal (itemised) versus simplified; the taxpayer takes the larger.
    const dependentValue = dependents * constants.dependentDeduction;
    const totalLegalDeductions = dependentValue + officialPension + alimony + otherDeductions;
    const simplifiedValue = simplifiedDiscountFor(constants.simplified, taxableIncome);

    const useSimplified = simplifiedValue > totalLegalDeductions;
    const usedDeduction = useSimplified ? simplifiedValue : totalLegalDeductions;

    const baseCalculation = Math.max(0, taxableIncome - usedDeduction);

    // 3. Progressive table. The tax is base × rate − "parcela a deduzir" of the
    //    bracket the base falls in, which is how the Receita computes it and
    //    what its published deduction constants (rounded to cents) assume.
    //    The bracket-by-bracket split below is for display only.
    const bracket = constants.table.find((row) => baseCalculation <= row.limit) ?? constants.table[constants.table.length - 1];
    const calculatedTax = round2(Math.max(0, baseCalculation * bracket.rate - bracket.deduction));

    const tableSteps = [];
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    let previousLimit = 0;
    for (let i = 0; i < constants.table.length; i++) {
        const row = constants.table[i];
        const lower = previousLimit;
        const upper = i === constants.table.length - 1 ? Infinity : row.limit;
        const portion = baseCalculation > lower ? Math.min(baseCalculation, upper) - lower : 0;

        let rangeLabel = "";
        if (i === 0) rangeLabel = `Até ${formatCurrency(row.limit)}`;
        else if (i === constants.table.length - 1) rangeLabel = `Acima de ${formatCurrency(previousLimit)}`;
        else rangeLabel = `De ${formatCurrency(previousLimit + 0.01)} até ${formatCurrency(row.limit)}`;

        tableSteps.push({ range: rangeLabel, base: portion, rate: row.rate, tax: portion * row.rate });
        previousLimit = row.limit;
    }

    // 4. Reduction (Lei 15.270/2025). It is driven by the taxable income
    //    (rendimentos tributáveis), not by the calculation base.
    const { fullUpTo, maxReduction, partialUpTo, intercept, slope } = constants.reduction;
    let reduction = 0;
    if (taxableIncome <= fullUpTo) {
        reduction = Math.min(calculatedTax, maxReduction);
    } else if (taxableIncome <= partialUpTo) {
        reduction = Math.min(calculatedTax, Math.max(0, intercept - slope * taxableIncome));
    }
    reduction = round2(reduction);
    const dueTax = round2(Math.max(0, calculatedTax - reduction));

    const effectiveRate = grossIncome > 0 ? dueTax / grossIncome : 0;

    return {
        grossIncome,
        taxableIncome,
        exemption65Value,
        legalDeductionsTotal: totalLegalDeductions,
        simplifiedDiscountValue: simplifiedValue,
        usedDeduction,
        deductionType: useSimplified ? 'simplified' : 'legal',
        baseCalculation,
        calculatedTax,
        reductionApplied: reduction,
        dueTax,
        effectiveRate,
        tableSteps,
    };
}
