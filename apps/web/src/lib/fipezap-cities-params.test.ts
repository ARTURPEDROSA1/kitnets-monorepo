import { describe, expect, it } from "vitest";
import { buildFipezapCitiesHref, DEFAULT_STATE, parseFipezapCitiesParams, periodStart } from "./fipezap-cities-params";

describe("parseFipezapCitiesParams", () => {
    it("falls back to the defaults and the national index", () => {
        expect(parseFipezapCitiesParams({})).toEqual(DEFAULT_STATE);
        expect(parseFipezapCitiesParams({ tipo: "x", dorm: "9", periodo: "7y" }, "atlantis")).toEqual(DEFAULT_STATE);
    });
    it("keeps valid values, drops unknown or duplicate cities and caps the comparison", () => {
        const s = parseFipezapCitiesParams({ tipo: "locacao", dorm: "2", comparar: "rio-de-janeiro,sao-paulo,rio-de-janeiro,nope,curitiba,recife,salvador,manaus,belem", periodo: "all" }, "sao-paulo");
        expect(s.cidade).toBe("sao-paulo");
        expect(s.tipo).toBe("locacao");
        expect(s.dorm).toBe("2");
        expect(s.comparar).toEqual(["rio-de-janeiro", "curitiba", "recife", "salvador", "manaus"]);
        expect(s.periodo).toBe("all");
    });
    it("accepts a custom period only with two valid months, ordered", () => {
        expect(parseFipezapCitiesParams({ periodo: "custom", de: "2024-06", ate: "2022-01" })).toMatchObject({ periodo: "custom", de: "2022-01", ate: "2024-06" });
        expect(parseFipezapCitiesParams({ periodo: "custom", de: "2024-06" })).toMatchObject({ periodo: "5y", de: null, ate: null });
        expect(parseFipezapCitiesParams({ periodo: "custom", de: "2024-13", ate: "2024-12" }).periodo).toBe("5y");
    });
    it("reads array-valued params", () => {
        expect(parseFipezapCitiesParams({ tipo: ["yield", "venda"] }).tipo).toBe("yield");
    });
});

describe("buildFipezapCitiesHref", () => {
    it("omits defaults and the locale prefix for pt", () => {
        expect(buildFipezapCitiesHref("pt", DEFAULT_STATE)).toBe("/indices/fipezap/cidades");
        expect(buildFipezapCitiesHref("en", DEFAULT_STATE)).toBe("/en/indices/fipezap/cidades");
        expect(buildFipezapCitiesHref("pt", { ...DEFAULT_STATE, cidade: "sao-paulo" })).toBe("/indices/fipezap/cidades/sao-paulo");
    });
    it("serialises the state and applies a patch", () => {
        const s = parseFipezapCitiesParams({ tipo: "locacao", dorm: "3", comparar: "rio-de-janeiro,sao-paulo", periodo: "all" }, "curitiba");
        expect(buildFipezapCitiesHref("es", s)).toBe("/es/indices/fipezap/cidades/curitiba?tipo=locacao&dorm=3&comparar=rio-de-janeiro%2Csao-paulo&periodo=all");
        expect(buildFipezapCitiesHref("pt", s, { cidade: "rio-de-janeiro", periodo: "5y" })).toBe("/indices/fipezap/cidades/rio-de-janeiro?tipo=locacao&dorm=3&comparar=sao-paulo");
        expect(buildFipezapCitiesHref("pt", { ...DEFAULT_STATE, periodo: "custom", de: "2020-01", ate: "2021-12" })).toBe("/indices/fipezap/cidades?periodo=custom&de=2020-01&ate=2021-12");
    });
});

describe("periodStart", () => {
    it("counts whole months back from the newest month", () => {
        expect(periodStart({ periodo: "ytd", de: null }, "2026-08-01")).toBe("2026-01-01");
        expect(periodStart({ periodo: "1y", de: null }, "2026-08-01")).toBe("2025-09-01");
        expect(periodStart({ periodo: "5y", de: null }, "2026-08-01")).toBe("2021-09-01");
        expect(periodStart({ periodo: "10y", de: null }, "2026-01-01")).toBe("2016-02-01");
        expect(periodStart({ periodo: "all", de: null }, "2026-08-01")).toBeNull();
        expect(periodStart({ periodo: "custom", de: "2019-03" }, "2026-08-01")).toBe("2019-03-01");
    });
});
