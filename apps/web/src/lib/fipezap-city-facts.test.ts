import { describe, expect, it } from "vitest";
import { cityFacts, FIPEZAP_CITY_FACTS, rentShareOfIncome, yearsOfIncome } from "./fipezap-city-facts";
import { FIPEZAP_CAPITALS, FIPEZAP_CITY_LIST } from "./fipezap-cities";

describe("city facts", () => {
    it("covers every capital and nothing else, with plausible figures", () => {
        const slugs = Object.keys(FIPEZAP_CITY_FACTS);
        expect(slugs.sort()).toEqual(FIPEZAP_CAPITALS.map(c => c.slug).sort());
        for (const c of FIPEZAP_CITY_LIST.filter(c => !c.isCapital)) expect(cityFacts(c.slug)).toBeNull();
        for (const f of Object.values(FIPEZAP_CITY_FACTS)) {
            expect(f.population).toBeGreaterThan(300_000);
            expect(f.households).toBeLessThan(f.population);
            expect(f.apartments).toBeLessThan(f.households);
            expect(f.areaKm2).toBeGreaterThan(50);
            expect(f.gdpPerCapita).toBeGreaterThan(10_000);
            expect(f.householdIncome).toBeGreaterThan(3_000);
        }
        expect(cityFacts("sao-paulo")?.population).toBe(11_452_000);
        expect(cityFacts("vitoria")?.gdpPerCapita).toBe(69_628);
    });
    it("derives affordability figures for a 50 m² apartment", () => {
        const sp = cityFacts("sao-paulo");
        expect(yearsOfIncome(12143, sp)).toBeCloseTo((12143 * 50) / (8994 * 12), 6);
        expect(rentShareOfIncome(65.4, sp)).toBeCloseTo((65.4 * 50) / 8994 * 100, 6);
        expect(yearsOfIncome(null, sp)).toBeNull();
        expect(rentShareOfIncome(50, null)).toBeNull();
    });
});
