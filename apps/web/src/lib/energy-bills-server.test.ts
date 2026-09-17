import { describe, expect, it } from "vitest";
import {
    buildBillUpdatePayload,
    buildHistoricalRows,
    buildMainBillPayload,
    buildPropertyAddressUpdates,
    parseMonthLabelToIso,
} from "./energy-bills-server";

describe("parseMonthLabelToIso", () => {
    it("reads Portuguese month labels and ISO months", () => {
        expect(parseMonthLabelToIso("AGO/26")).toBe("2026-08");
        expect(parseMonthLabelToIso(" dez/2025 ")).toBe("2025-12");
        expect(parseMonthLabelToIso("2026-03")).toBe("2026-03");
    });

    it("returns null for unreadable labels", () => {
        expect(parseMonthLabelToIso("AUG/26")).toBeNull();
        expect(parseMonthLabelToIso("")).toBeNull();
        expect(parseMonthLabelToIso(null)).toBeNull();
    });
});

describe("buildMainBillPayload", () => {
    const now = new Date("2026-09-17T12:00:00Z");

    it("applies the defaults for a minimal bill", () => {
        const p = buildMainBillPayload("prop-1", { referenceMonth: "2026-08" }, undefined, now);
        expect(p).toMatchObject({
            property_id: "prop-1",
            utility_company: "CEMIG",
            consumer_unit: "Não informado",
            reference_month: "2026-08",
            billing_days: 30,
            grid_consumption_kwh: 0,
            grid_reading_previous: null,
            solar_compensated_kwh: null,
            flag_type: "Verde",
            availability_cost_kwh: 30,
            total_amount: 0,
            is_historical_only: false,
            historical_consumption_raw: [],
            updated_at: "2026-09-17T12:00:00.000Z",
        });
    });

    it("coerces numeric strings and derives the availability minimum from the connection type", () => {
        const p = buildMainBillPayload("prop-1", {
            referenceMonth: "2026-08",
            installationClass: "Residencial Trifásico",
            gridConsumptionKwh: "412",
            totalAmount: "389.12",
            unitPrice: "0.95",
            billingDays: "31",
            taxesIcms: "12.5",
        }, [{ month: "JUL/26" }], now);
        expect(p.availability_cost_kwh).toBe(100);
        expect(p.grid_consumption_kwh).toBe(412);
        expect(p.total_amount).toBe(389.12);
        expect(p.unit_price).toBe(0.95);
        expect(p.billing_days).toBe(31);
        expect(p.taxes_icms).toBe(12.5);
        expect(p.historical_consumption_raw).toEqual([{ month: "JUL/26" }]);
    });

    it("keeps the minimum printed on the bill when present", () => {
        expect(buildMainBillPayload("p", { referenceMonth: "2026-08", availabilityCostKwh: 50, installationClass: "Residencial Trifásico" }, []).availability_cost_kwh).toBe(50);
    });
});

describe("buildHistoricalRows", () => {
    it("maps the 13-month table, skipping the bill's own month and bad labels", () => {
        const rows = buildHistoricalRows("prop-1", { referenceMonth: "2026-08", consumerUnit: "123", utilityCompany: "CPFL" }, [
            { month: "AGO/26", consumptionKwh: 400 },
            { month: "JUL/26", consumptionKwh: "380", dailyAvgKwh: "12.6", days: "30" },
            { month: "???", consumptionKwh: 1 },
        ]);
        expect(rows).toEqual([{
            property_id: "prop-1",
            consumer_unit: "123",
            utility_company: "CPFL",
            reference_month: "2026-07",
            reference_month_label: "JUL/26",
            grid_consumption_kwh: 380,
            daily_avg_kwh: 12.6,
            billing_days: 30,
            is_historical_only: true,
            total_amount: 0,
        }]);
    });

    it("tolerates a missing table", () => {
        expect(buildHistoricalRows("p", { referenceMonth: "2026-08" }, undefined)).toEqual([]);
    });
});

describe("buildBillUpdatePayload", () => {
    const now = new Date("2026-09-17T12:00:00Z");

    it("writes only the provided fields", () => {
        const p = buildBillUpdatePayload({ total_amount: "250.5", notes: "ok" }, now);
        expect(p).toEqual({ updated_at: "2026-09-17T12:00:00.000Z", total_amount: 250.5, notes: "ok" });
    });

    it("derives the daily average when it is missing or zero", () => {
        const p = buildBillUpdatePayload({ grid_consumption_kwh: 300, billing_days: 30, daily_avg_kwh: 0 }, now);
        expect(p.daily_avg_kwh).toBe(10);
        expect(buildBillUpdatePayload({ grid_consumption_kwh: 300, billing_days: 30, daily_avg_kwh: 9.5 }, now).daily_avg_kwh).toBe(9.5);
    });

    it("clears an emptied due date and nulls an emptied unit price", () => {
        const p = buildBillUpdatePayload({ due_date: "", unit_price: null }, now);
        expect(p.due_date).toBeNull();
        expect(p.unit_price).toBeNull();
    });
});

describe("buildPropertyAddressUpdates", () => {
    it("accepts both the extractor's and the edit modal's field names", () => {
        expect(buildPropertyAddressUpdates({ installationAddress: " Rua A, 10 ", installationCity: "BH", installationState: "MG", installationZip: "30000-000" }))
            .toEqual({ address: "Rua A, 10", city: "BH", state: "MG", zip: "30000-000" });
        expect(buildPropertyAddressUpdates({ address: "Rua B", city: "SP" })).toEqual({ address: "Rua B", city: "SP" });
        expect(buildPropertyAddressUpdates({})).toEqual({});
    });
});
