import { describe, expect, it } from "vitest";
import { hasSolarActivity, solarSavings } from "./energy-savings";

describe("solarSavings", () => {
    it("uses the amount credited on the bill, whatever its sign", () => {
        expect(solarSavings({ energy_compensated_amount: -187.43, solar_compensated_kwh: 250, unit_price: 0.95 }))
            .toEqual({ amount: 187.43, estimated: false, missingCompensatedKwh: false });
        expect(solarSavings({ energy_compensated_amount: "187.43", solar_compensated_kwh: 250 }).amount).toBe(187.43);
    });

    it("does not overstate: the credited amount wins over kWh × tariff", () => {
        // 250 kWh × 0,95 = 237,50 would ignore the Fio B share the bill already deducted
        expect(solarSavings({ energy_compensated_amount: -187.43, solar_compensated_kwh: 250, unit_price: 0.95 }).amount).toBe(187.43);
    });

    it("falls back to kWh × tariff, flagged as an estimate", () => {
        expect(solarSavings({ solar_compensated_kwh: 100, unit_price: 0.9 }))
            .toEqual({ amount: 90, estimated: true, missingCompensatedKwh: false });
    });

    it("is zero when there is nothing to go on", () => {
        expect(solarSavings({})).toEqual({ amount: 0, estimated: false, missingCompensatedKwh: false });
        expect(solarSavings({ solar_compensated_kwh: 100 }).amount).toBe(0);
    });

    it("flags a bill with solar activity but no compensated kWh", () => {
        expect(solarSavings({ solar_injected_kwh: 300, generation_balance_kwh: 120 }).missingCompensatedKwh).toBe(true);
        expect(solarSavings({ energy_compensated_amount: -50 }).missingCompensatedKwh).toBe(true);
        expect(solarSavings({ solar_injected_kwh: 300, solar_compensated_kwh: 200 }).missingCompensatedKwh).toBe(false);
    });
});

describe("hasSolarActivity", () => {
    it("is false for a plain consumer unit", () => {
        expect(hasSolarActivity({ unit_price: 0.95 })).toBe(false);
        expect(hasSolarActivity({ solar_injected_kwh: 0, energy_compensated_amount: 0 })).toBe(false);
    });
});
