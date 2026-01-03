import { describe, it, expect } from 'vitest';
import { calculateIrpf2026, Irpf2026Input } from './irpf2026';

describe('IRPF 2026 Calculator', () => {
    // Helper to create basic input
    const createInput = (income: number, mode: 'monthly' | 'annual' = 'monthly'): Irpf2026Input => ({
        grossIncome: income,
        dependents: 0,
        officialPension: 0,
        alimony: 0,
        otherDeductions: 0,
        isOver65: false,
        mode
    });

    describe('Monthly Calculation', () => {
        it('should return zero tax for very low income', () => {
            const input = createInput(2000);
            const result = calculateIrpf2026(input);
            expect(result.dueTax).toBe(0);
            expect(result.baseCalculation).toBeLessThan(2428.80); // Exempt bracket
        });

        it('should apply Case A reduction (Zero Tax) for income <= 5000', () => {
            // Income 4000
            // Base ~ 3392.80
            // Tax ~ 114.76
            // Reduction Limit A (312.89) covers full tax.
            const input = createInput(4000);
            const result = calculateIrpf2026(input);

            expect(result.grossIncome).toBe(4000);
            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toEqual(result.calculatedTax);
            expect(result.dueTax).toBe(0);
        });

        it('should apply Case B reduction for income 6000', () => {
            // Income 6000 is between 5000 and 7350
            const input = createInput(6000);
            const result = calculateIrpf2026(input);

            // Reduction Formula: 978.62 - (0.133145 * 6000)
            const expectedReduction = 978.62 - (0.133145 * 6000);

            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toBeCloseTo(expectedReduction, 1);
            expect(result.dueTax).toBeCloseTo(result.calculatedTax - result.reductionApplied, 2);
        });

        it('should NOT apply reduction for income > 7350 (Case C)', () => {
            const input = createInput(8000);
            const result = calculateIrpf2026(input);

            expect(result.reductionApplied).toBe(0);
            expect(result.dueTax).toBe(result.calculatedTax);
        });
    });

    describe('Annual Calculation', () => {
        it('should apply Case A reduction for annual income <= 60000', () => {
            const input = createInput(50000, 'annual');
            const result = calculateIrpf2026(input);

            expect(result.calculatedTax).toBeGreaterThan(0);
            expect(result.reductionApplied).toEqual(result.calculatedTax);
            expect(result.dueTax).toBe(0);
        });

        it('should apply Case B reduction for annual income 80000', () => {
            const input = createInput(80000, 'annual');
            const result = calculateIrpf2026(input);

            // 8429.73 - (0.095575 * 80000)
            const expectedReduction = 8429.73 - (0.095575 * 80000);

            expect(result.reductionApplied).toBeCloseTo(expectedReduction, 1);
        });
    });
});
