import { describe, expect, it } from "vitest";
import { splitTitle } from "./lease-title";

describe("splitTitle", () => {
    it("finds the tenant inside the suggested reference", () => {
        expect(splitTitle("SANTO ANTONIO · Kitnet 35 - Robson Soares Mesquita - 2024", "Robson Soares Mesquita"))
            .toEqual({ before: "SANTO ANTONIO · Kitnet 35 - ", match: "Robson Soares Mesquita", after: " - 2024" });
    });

    it("ignores case and accents but returns the title's own spelling", () => {
        expect(splitTitle("VALE DO SOL - DANILO SUPERBI DA SILVA - 2025", "Danilo Superbi da Silva")?.match).toBe("DANILO SUPERBI DA SILVA");
        expect(splitTitle("Casa 35D - Adriana de Aguiar - 2025", "ADRIANA DE AGUIAR")?.match).toBe("Adriana de Aguiar");
        expect(splitTitle("Kitnet 1 - José Antônio - 2025", "Jose Antonio")).toEqual({ before: "Kitnet 1 - ", match: "José Antônio", after: " - 2025" });
    });

    it("is null when the name is not in the title or there is no tenant", () => {
        expect(splitTitle("Contrato da loja", "Robson")).toBeNull();
        expect(splitTitle("Contrato da loja", null)).toBeNull();
        expect(splitTitle("Contrato da loja", "  ")).toBeNull();
    });

    it("copes with a decomposed character in the title", () => {
        const title = "Kitnet 2 - José Lima - 2025";   // "é" as e + combining acute
        expect(splitTitle(title, "José Lima")).toEqual({ before: "Kitnet 2 - ", match: "José Lima", after: " - 2025" });
    });
});
