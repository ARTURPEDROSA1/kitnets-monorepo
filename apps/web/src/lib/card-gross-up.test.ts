import { describe, expect, it } from "vitest";
import { cardFeeDecided, grossUp } from "./card-gross-up";

describe("grossUp", () => {
    it("charges enough for the owner to receive the invoice in full", () => {
        const g = grossUp(249.9, { pct: 3.99, fixed: 0.39 });
        expect(g.gross).toBe(260.7);
        expect(g.surcharge).toBe(10.8);
        // the processor keeps 3.99 % of 260.70 + 0.39 = 10.79: the owner gets 249.91
        expect(Math.round((g.gross - g.gross * 0.0399 - 0.39) * 100) / 100).toBeGreaterThanOrEqual(249.9);
    });

    it("rounds up, never down", () => {
        // 100 / 0.97 = 103.0927… → 103.10, not 103.09 (which would leave 99.99)
        expect(grossUp(100, { pct: 3, fixed: 0 }).gross).toBe(103.1);
        expect(103.09 * 0.97).toBeLessThan(100);
        expect(103.1 * 0.97).toBeGreaterThanOrEqual(100);
    });

    it("a zero fee charges the invoice itself", () => {
        expect(grossUp(150, { pct: 0, fixed: 0 })).toEqual({ gross: 150, surcharge: 0, net: 150 });
    });

    it("is exact on round figures (no floating-point creep)", () => {
        expect(grossUp(1000, { pct: 2, fixed: 0 })).toEqual({ gross: 1020.41, surcharge: 20.41, net: 1000 });
        expect(grossUp(0.01, { pct: 50, fixed: 0 }).gross).toBe(0.02);
    });

    it("nothing to charge", () => {
        expect(grossUp(0, { pct: 3.99, fixed: 0.39 })).toEqual({ gross: 0, surcharge: 0, net: 0 });
    });
});

describe("cardFeeDecided", () => {
    it("needs both parts; zero counts as decided", () => {
        expect(cardFeeDecided(3.99, 0.39)).toBe(true);
        expect(cardFeeDecided(0, 0)).toBe(true);
        expect(cardFeeDecided(null, 0.39)).toBe(false);
        expect(cardFeeDecided(3.99, null)).toBe(false);
        expect(cardFeeDecided(undefined, undefined)).toBe(false);
    });
});
