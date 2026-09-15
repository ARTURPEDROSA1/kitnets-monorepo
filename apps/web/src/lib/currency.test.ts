import { describe, expect, it } from "vitest";
import { parseCurrencyBR } from "./currency";

describe("parseCurrencyBR", () => {
    it("reads the UI mask output", () => {
        expect(parseCurrencyBR("R$ 1.234,56")).toBe(1234.56);
        expect(parseCurrencyBR("R$ 1.234,56")).toBe(1234.56);
        expect(parseCurrencyBR("1.234,50")).toBe(1234.5);
        expect(parseCurrencyBR("0,99")).toBe(0.99);
    });

    it("reads machine notation instead of multiplying it by 100", () => {
        expect(parseCurrencyBR("1234.56")).toBe(1234.56);
        expect(parseCurrencyBR("1234.5")).toBe(1234.5);
        expect(parseCurrencyBR("10.5")).toBe(10.5);
    });

    it("treats a dot followed by three digits as a thousands separator", () => {
        expect(parseCurrencyBR("1.234")).toBe(1234);
        expect(parseCurrencyBR("1.234.567")).toBe(1234567);
    });

    it("reads English thousands with commas", () => {
        expect(parseCurrencyBR("1,234,567.89")).toBe(1234567.89);
    });

    it("handles plain integers, numbers, negatives and garbage", () => {
        expect(parseCurrencyBR("1500")).toBe(1500);
        expect(parseCurrencyBR(1500.25)).toBe(1500.25);
        expect(parseCurrencyBR("-1.234,56")).toBe(-1234.56);
        expect(parseCurrencyBR("(200,00)")).toBe(-200);
        expect(parseCurrencyBR("")).toBe(0);
        expect(parseCurrencyBR(null)).toBe(0);
        expect(parseCurrencyBR("abc")).toBe(0);
        expect(parseCurrencyBR(Number.NaN)).toBe(0);
    });
});
