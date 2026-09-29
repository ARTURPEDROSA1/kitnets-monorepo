import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, pendingDecisions, validateSettings } from "./accounting-policies";

describe("validateSettings", () => {
    it("keeps the current values for fields not sent", () => {
        const r = validateSettings({ nire: " 31 2 0000000 1 " });
        expect(r).toHaveProperty("value");
        if ("value" in r) {
            expect(r.value.nire).toBe("31 2 0000000 1");
            expect(r.value.accounting_standard).toBeNull();
        }
    });

    it("has no default standard or measurement model and lets them go back to undecided", () => {
        expect(DEFAULT_SETTINGS.accounting_standard).toBeNull();
        expect(DEFAULT_SETTINGS.property_measurement).toBeNull();
        const decided = { ...DEFAULT_SETTINGS, accounting_standard: "NBC_TG_1002" as const, property_measurement: "COST" as const };
        const r = validateSettings({ accounting_standard: "", property_measurement: null }, decided);
        expect("value" in r && [r.value.accounting_standard, r.value.property_measurement]).toEqual([null, null]);
        expect(validateSettings({ property_measurement: "OUTRO" })).toHaveProperty("error");
    });

    it("refuses fair value under NBC TG 1002 or with no standard and accepts it under the full standards", () => {
        expect(validateSettings({ property_measurement: "FAIR_VALUE" })).toHaveProperty("error");
        expect(validateSettings({ accounting_standard: "NBC_TG_1002", property_measurement: "FAIR_VALUE" })).toHaveProperty("error");
        const r = validateSettings({ accounting_standard: "NBC_TG_COMPLETAS", property_measurement: "FAIR_VALUE" });
        expect("value" in r && r.value.property_measurement).toBe("FAIR_VALUE");
    });

    it("pins the useful life to 25 years when it follows the Receita", () => {
        const r = validateSettings({ useful_life_basis: "RFB", building_useful_life_years: 40 });
        expect("value" in r && r.value.building_useful_life_years).toBe(25);
        const e = validateSettings({ useful_life_basis: "ESTIMATIVA", building_useful_life_years: 40 });
        expect("value" in e && e.value.building_useful_life_years).toBe(40);
        expect(validateSettings({ useful_life_basis: "ESTIMATIVA", building_useful_life_years: 0 })).toHaveProperty("error");
    });

    it("validates the contador's UF and e-mail and the opening date", () => {
        expect(validateSettings({ accountant_crc_uf: "XX" })).toHaveProperty("error");
        const r = validateSettings({ accountant_crc_uf: "sp" });
        expect("value" in r && r.value.accountant_crc_uf).toBe("SP");
        expect(validateSettings({ accountant_email: "nope" })).toHaveProperty("error");
        expect(validateSettings({ opening_date: "2026-01-15" })).toHaveProperty("error");
        const set = validateSettings({ opening_date: "2025-01-01" });
        expect("value" in set && set.value.opening_date).toBe("2025-01-01");
        expect(DEFAULT_SETTINGS.opening_date).toBeNull();   // no default: the owner decides
        const cleared = validateSettings({ opening_date: "" }, { ...DEFAULT_SETTINGS, opening_date: "2025-01-01" });
        expect("value" in cleared && cleared.value.opening_date).toBeNull();
    });
});

describe("pendingDecisions", () => {
    it("lists everything open on a fresh holding and nothing once decided", () => {
        expect(pendingDecisions(DEFAULT_SETTINGS)).toHaveLength(7);
        expect(pendingDecisions(DEFAULT_SETTINGS)[0]).toMatch(/início da escrituração/);
        expect(pendingDecisions(DEFAULT_SETTINGS).some((p) => /modelo de mensuração dos imóveis/.test(p))).toBe(true);
        expect(pendingDecisions({
            ...DEFAULT_SETTINGS,
            accounting_standard: "NBC_TG_1002", property_measurement: "COST",
            accountant_name: "Fulana", accountant_crc: "MG-123456/O", accountant_crc_uf: "MG",
            policies_decided_by: "Fulana (CRC-MG 123456/O)", policies_decided_on: "2026-10-01",
            tax_basis: "COMPETENCIA", reimbursements_policy: "REPASSE", first_adoption_deemed_cost: false, opening_date: "2025-01-01",
        })).toEqual([]);
    });
});
