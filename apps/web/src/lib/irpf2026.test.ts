import { describe, it, expect } from 'vitest';
import { calculateIrpf2026, Irpf2026Input, CONSTANTS_2026_ANNUAL, CONSTANTS_2026_MONTHLY } from './irpf2026';

describe('IRPF 2026 Calculator', () => {
    const createInput = (income: number, mode: 'monthly' | 'annual' = 'monthly', extra: Partial<Irpf2026Input> = {}): Irpf2026Input => ({
        grossIncome: income,
        dependents: 0,
        officialPension: 0,
        alimony: 0,
        otherDeductions: 0,
        isOver65: false,
        mode,
        ...extra,
    });

    describe('Monthly Calculation', () => {
        it('should return zero tax for very low income', () => {
            const result = calculateIrpf2026(createInput(2000));
            expect(result.dueTax).toBe(0);
            expect(result.baseCalculation).toBeLessThan(2428.80);
        });

        it('should apply Case A reduction (Zero Tax) for income <= 5000', () => {
            const result = calculateIrpf2026(createInput(4000));
            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toEqual(result.calculatedTax);
            expect(result.dueTax).toBe(0);
        });

        it('R$ 5.000 with the simplified discount owes exactly the law\'s R$ 312,89 before the reduction', () => {
            const result = calculateIrpf2026(createInput(5000));
            expect(result.simplifiedDiscountValue).toBe(607.20);
            expect(result.calculatedTax).toBeCloseTo(312.89, 2);
            expect(result.dueTax).toBe(0);
        });

        it('should apply Case B reduction for income 6000', () => {
            const result = calculateIrpf2026(createInput(6000));
            const expectedReduction = 978.62 - (0.133145 * 6000);
            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toBeCloseTo(expectedReduction, 1);
            expect(result.dueTax).toBeCloseTo(result.calculatedTax - result.reductionApplied, 2);
        });

        it('should NOT apply reduction for income > 7350 (Case C)', () => {
            const result = calculateIrpf2026(createInput(8000));
            expect(result.reductionApplied).toBe(0);
            expect(result.dueTax).toBe(result.calculatedTax);
        });

        it('65+ exempt portion is removed from income even when the simplified discount wins', () => {
            const result = calculateIrpf2026(createInput(6000, 'monthly', { isOver65: true }));
            expect(result.exemption65Value).toBe(CONSTANTS_2026_MONTHLY.exemption65);
            expect(result.taxableIncome).toBeCloseTo(6000 - 2428.80, 2);
            expect(result.deductionType).toBe('simplified');
            expect(result.baseCalculation).toBeCloseTo(6000 - 2428.80 - 607.20, 2);
            // 3.571,20 taxable is under the R$ 5.000 line: reduction wipes the tax.
            expect(result.dueTax).toBe(0);
        });
    });

    describe('Annual Calculation', () => {
        it('annual table and exempt portion are twelve times the monthly ones', () => {
            expect(CONSTANTS_2026_ANNUAL.table[0].limit).toBeCloseTo(CONSTANTS_2026_MONTHLY.table[0].limit * 12, 2);
            expect(CONSTANTS_2026_ANNUAL.table[3].limit).toBeCloseTo(CONSTANTS_2026_MONTHLY.table[3].limit * 12, 2);
            expect(CONSTANTS_2026_ANNUAL.exemption65).toBeCloseTo(CONSTANTS_2026_MONTHLY.exemption65 * 12, 2);
            expect(CONSTANTS_2026_ANNUAL.dependentDeduction).toBeCloseTo(CONSTANTS_2026_MONTHLY.dependentDeduction * 12, 2);
        });

        it('simplified discount is 20% of taxable income (R$ 40k → R$ 8k), not a fixed amount', () => {
            const result = calculateIrpf2026(createInput(40000, 'annual'));
            expect(result.simplifiedDiscountValue).toBeCloseTo(8000, 2);
            expect(result.baseCalculation).toBeCloseTo(32000, 2);
            expect(result.calculatedTax).toBeCloseTo((32000 - 29145.60) * 0.075, 2);
            expect(result.dueTax).toBe(0); // under R$ 60k the reduction waives it
        });

        it('simplified discount is capped at R$ 16.754,34', () => {
            const result = calculateIrpf2026(createInput(100000, 'annual'));
            expect(result.simplifiedDiscountValue).toBe(16754.34);
            expect(result.baseCalculation).toBeCloseTo(83245.66, 2);
            // 27,5% × 83.245,66 − 10.904,76
            expect(result.calculatedTax).toBeCloseTo(11987.80, 1);
            expect(result.reductionApplied).toBe(0);
            expect(result.dueTax).toBeCloseTo(11987.80, 1);
        });

        it('legal deductions win over the simplified discount when larger', () => {
            const result = calculateIrpf2026(createInput(40000, 'annual', { officialPension: 9000 }));
            expect(result.deductionType).toBe('legal');
            expect(result.usedDeduction).toBe(9000);
        });

        it('should apply Case A reduction for annual income <= 60000', () => {
            const result = calculateIrpf2026(createInput(50000, 'annual'));
            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toEqual(result.calculatedTax);
            expect(result.dueTax).toBe(0);
        });

        it('should apply Case B reduction for annual income 80000 (12 × the monthly formula)', () => {
            const result = calculateIrpf2026(createInput(80000, 'annual'));
            const expectedReduction = 11743.44 - (0.133145 * 80000); // 1.091,84
            expect(result.reductionApplied).toBeCloseTo(expectedReduction, 1);
            // base 64.000 → 27,5% × 64.000 − 10.904,76 = 6.695,24
            expect(result.calculatedTax).toBeCloseTo(6695.24, 1);
            expect(result.dueTax).toBeCloseTo(6695.24 - expectedReduction, 1);
        });

        it('no reduction above R$ 88.200', () => {
            const result = calculateIrpf2026(createInput(90000, 'annual'));
            expect(result.reductionApplied).toBe(0);
        });

        it('65+ exempt portion applies before the 20% simplified discount', () => {
            const result = calculateIrpf2026(createInput(60000, 'annual', { isOver65: true }));
            expect(result.exemption65Value).toBeCloseTo(29145.60, 2);
            expect(result.taxableIncome).toBeCloseTo(30854.40, 2);
            expect(result.simplifiedDiscountValue).toBeCloseTo(30854.40 * 0.20, 2);
            expect(result.deductionType).toBe('simplified');
            expect(result.dueTax).toBe(0);
        });
    });
});
