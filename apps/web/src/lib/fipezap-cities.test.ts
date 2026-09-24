import { describe, expect, it } from "vitest";
import { FIPEZAP_CAPITALS, FIPEZAP_CITIES, FIPEZAP_CITY_LIST, FIPEZAP_NATIONAL_SLUG, fipezapCityBySheetTitle, fipezapCityBySlug, fipezapCityLabel, matchFipezapCity, normalizeCityKey } from "./fipezap-cities";

describe("catalogue", () => {
    it("has the national index plus 36 cities, 22 of them capitals, with unique slugs and titles", () => {
        expect(FIPEZAP_CITIES[0].slug).toBe(FIPEZAP_NATIONAL_SLUG);
        expect(FIPEZAP_CITY_LIST).toHaveLength(36);
        expect(FIPEZAP_CAPITALS).toHaveLength(22);
        expect(new Set(FIPEZAP_CITIES.map(c => c.slug)).size).toBe(37);
        expect(new Set(FIPEZAP_CITIES.map(c => normalizeCityKey(c.sheetTitle))).size).toBe(37);
        for (const c of FIPEZAP_CITY_LIST) {
            expect(c.slug).toMatch(/^[a-z0-9-]+$/);
            expect(c.uf).toMatch(/^[A-Z]{2}$/);
            expect(c.region).toBeTruthy();
            expect(c.lat).toBeLessThan(6); expect(c.lat).toBeGreaterThan(-34);
            expect(c.lng).toBeLessThan(-34); expect(c.lng).toBeGreaterThan(-74);
        }
    });
    it("normalises accents, case and punctuation", () => {
        expect(normalizeCityKey("São José (SC)")).toBe("sao jose sc");
        expect(normalizeCityKey("  BRASÍLIA ")).toBe("brasilia");
    });
});

describe("sheet titles", () => {
    it("recognises the national sheet and city sheets by their title cell", () => {
        expect(fipezapCityBySheetTitle("Índice FipeZAP")?.slug).toBe("brasil");
        expect(fipezapCityBySheetTitle("São Bernardo do Campo")?.slug).toBe("sao-bernardo-do-campo");
        expect(fipezapCityBySheetTitle("sao jose")?.slug).toBe("sao-jose");
        expect(fipezapCityBySheetTitle("Florianópolis (SC)")?.slug).toBe("florianopolis");
    });
    it("ignores sheets the app does not store", () => {
        expect(fipezapCityBySheetTitle("Resumo")).toBeUndefined();
        expect(fipezapCityBySheetTitle("Guarujá")).toBeUndefined();   // sales-only city
        expect(fipezapCityBySheetTitle("")).toBeUndefined();
        expect(fipezapCityBySheetTitle(null)).toBeUndefined();
    });
});

describe("matchFipezapCity", () => {
    it("matches an address city by name, with or without the UF", () => {
        expect(matchFipezapCity("Sao Paulo")?.slug).toBe("sao-paulo");
        expect(matchFipezapCity("BELO HORIZONTE", "mg")?.slug).toBe("belo-horizonte");
        expect(matchFipezapCity("Niterói", "RJ")?.slug).toBe("niteroi");
    });
    it("refuses a wrong UF, an ambiguous name without UF, and unknown cities", () => {
        expect(matchFipezapCity("São Paulo", "RJ")).toBeNull();
        expect(matchFipezapCity("São José")).toBeNull();
        expect(matchFipezapCity("São José", "SC")?.slug).toBe("sao-jose");
        expect(matchFipezapCity("São José", "SP")).toBeNull();
        expect(matchFipezapCity("Uberlândia", "MG")).toBeNull();
        expect(matchFipezapCity("Brasil")).toBeNull();   // the national row is not an address
        expect(matchFipezapCity(null)).toBeNull();
    });
});

describe("labels", () => {
    it("names the series for the UI", () => {
        expect(fipezapCityLabel("sao-paulo", "2")).toBe("FipeZap São Paulo (2 dorm.)");
        expect(fipezapCityLabel("brasil", "total")).toBe("FipeZap Brasil (todos)");
        expect(fipezapCityLabel("brasil")).toBe("FipeZap Brasil");
        expect(fipezapCityLabel("x-y")).toBe("FipeZap x-y");
        expect(fipezapCityBySlug("nope")).toBeUndefined();
    });
});
