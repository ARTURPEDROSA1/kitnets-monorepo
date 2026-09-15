import { describe, expect, it } from "vitest";
import { cnpjCheckDigits, formatCNPJ, maskCNPJ, normalizeCNPJ, parseCNPJ, validateCNPJ } from "./validators";

describe("validateCNPJ", () => {
    it("accepts valid numeric CNPJs, formatted or not", () => {
        expect(validateCNPJ("11.222.333/0001-81")).toBe(true);
        expect(validateCNPJ("11222333000181")).toBe(true);
        expect(validateCNPJ("00.000.000/0001-91")).toBe(true);
    });

    it("rejects wrong check digits, wrong length and repeated digits", () => {
        expect(validateCNPJ("11.222.333/0001-82")).toBe(false);
        expect(validateCNPJ("1122233300018")).toBe(false);
        expect(validateCNPJ("11111111111111")).toBe(false);
        expect(validateCNPJ("")).toBe(false);
    });

    it("accepts the alphanumeric CNPJ in force since July 2026", () => {
        const base = "12ABC34501DE";
        const full = base + cnpjCheckDigits(base);
        expect(validateCNPJ(full)).toBe(true);
        expect(validateCNPJ(formatCNPJ(full))).toBe(true);
        expect(validateCNPJ(full.toLowerCase())).toBe(true);
    });

    it("rejects an alphanumeric CNPJ with a wrong check digit or letters in the check digits", () => {
        const base = "12ABC34501DE";
        const dv = cnpjCheckDigits(base);
        const wrong = String((Number(dv[1]) + 1) % 10);
        expect(validateCNPJ(base + dv[0] + wrong)).toBe(false);
        expect(validateCNPJ(base + "AB")).toBe(false);
    });
});

describe("cnpjCheckDigits", () => {
    it("reproduces the classic numeric example", () => {
        expect(cnpjCheckDigits("112223330001")).toBe("81");
    });
});

describe("formatting helpers", () => {
    it("format, parse, mask and normalize keep letters", () => {
        expect(formatCNPJ("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
        expect(parseCNPJ("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
        expect(normalizeCNPJ("12.abc.345/01de-35")).toBe("12ABC34501DE35");
        expect(maskCNPJ("12abc3")).toBe("12.ABC.3");
        expect(maskCNPJ("11222333000181")).toBe("11.222.333/0001-81");
    });
});
