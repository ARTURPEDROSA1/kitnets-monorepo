import { describe, expect, it } from "vitest";
import { compareWord, placeWords } from "./fipezap-insights";

describe("placeWords", () => {
    it("writes places into Portuguese sentences with the right article", () => {
        expect(placeWords("pt", "Brasil", true)).toEqual({ place: "no Brasil", Place: "No Brasil", subject: "o Brasil" });
        expect(placeWords("pt", "São Paulo", false)).toEqual({ place: "em São Paulo", Place: "Em São Paulo", subject: "São Paulo" });
        expect(placeWords("pt", "Rio de Janeiro", false)).toEqual({ place: "no Rio de Janeiro", Place: "No Rio de Janeiro", subject: "o Rio de Janeiro" });
        expect(placeWords("pt", "Recife", false).place).toBe("no Recife");
    });
    it("handles English and Spanish", () => {
        expect(placeWords("en", "Brazil", true)).toEqual({ place: "in Brazil", Place: "In Brazil", subject: "Brazil" });
        expect(placeWords("en", "Curitiba", false).Place).toBe("In Curitiba");
        expect(placeWords("es", "x", true).place).toBe("en Brasil");
    });
});

describe("compareWord", () => {
    const t = { vsAbove: "acima do", vsBelow: "abaixo do", vsInline: "em linha com o", vsUnknown: "frente ao" };
    it("compares within a tolerance and tolerates missing figures", () => {
        expect(compareWord(5, 4, t)).toBe("acima do");
        expect(compareWord(4, 5, t)).toBe("abaixo do");
        expect(compareWord(4.02, 4, t)).toBe("em linha com o");
        expect(compareWord(null, 4, t)).toBe("frente ao");
    });
});
