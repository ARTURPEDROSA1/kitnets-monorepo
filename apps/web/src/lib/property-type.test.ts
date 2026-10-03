import { describe, expect, it } from "vitest";
import { garageSpaces, garageSummary, parsePropertyType } from "./property-type";

describe("parsePropertyType", () => {
    it("keeps the known types and reads anything else as single-family", () => {
        expect(parsePropertyType("multi")).toBe("multi");
        expect(parsePropertyType("garage")).toBe("garage");
        expect(parsePropertyType("single")).toBe("single");
        expect(parsePropertyType(null)).toBe("single");
        expect(parsePropertyType("kitnet")).toBe("single");
    });
});

describe("garage", () => {
    it("counts at least one space", () => {
        expect(garageSpaces({})).toBe(1);
        expect(garageSpaces({ parkingSpaces: "0" })).toBe(1);
        expect(garageSpaces({ parkingSpaces: "abc" })).toBe(1);
        expect(garageSpaces({ parkingSpaces: "3" })).toBe(3);
    });

    it("summarises only what was filled in", () => {
        expect(garageSummary({})).toBe("1 vaga");
        expect(garageSummary({ parkingSpaces: "1", garageCover: "covered", garageLocation: "building", garageSpotLabel: " Vaga 23 G2 " })).toBe("1 vaga · coberta · Prédio / condomínio · Vaga 23 G2");
        expect(garageSummary({ parkingSpaces: "2", garageCover: "uncovered", garageLocation: "house" })).toBe("2 vagas · descobertas · Casa de rua");
        expect(garageSummary({ parkingSpaces: "2", garageCover: "", garageLocation: "" })).toBe("2 vagas");
    });
});
