import { describe, expect, it } from "vitest";
import { addMonths, inWaterView, monthLabel, monthsBetween, summarizeWaterBills, waterAttention, waterHubTotals, waterRows, type WaterBillLike } from "./water-hub";
import type { WaterPropertySummary } from "./water-properties-server";

const TODAY = "2026-09-25";

const bill = (month: string, over: Partial<WaterBillLike> = {}): WaterBillLike => ({ reference_month: month, due_date: null, total_amount: 150, consumption_m3: 12, ...over });

function unit(over: Partial<WaterPropertySummary> = {}): WaterPropertySummary {
    return {
        id: "p1", name: "Ed. Flores", address: "Rua das Flores, 10", city: "Nova Lima", state: "MG", zip: null, connectionCode: "12345678", meterNumber: "Y21SG1602635",
        billsCount: 14, latestMonth: "2026-09", latestConsumptionM3: 14, latestTotalAmount: 182.4, latestDueDate: "2026-10-02", latestRatePerM3: 13.03, avgConsumptionM3: 12, avgTotalAmount: 150,
        latestBillPdfUrl: "https://example.com/bill.pdf", logoUrl: "https://example.com/logo.png",
        latest: { month: "2026-09", dueDate: "2026-10-02", readingDate: "2026-09-18", total: 182.4, consumptionM3: 14, billedM3: 14, ratePerM3: 13.03, meterNumber: "Y21SG1602635", occurrence: null },
        last12: { months: 12, consumptionM3: 144, paidAmount: 1800, avgConsumptionM3: 12, avgAmount: 150, avgRate: 12.5 },
        ...over,
    };
}

describe("month helpers", () => {
    it("adds months and labels them", () => {
        expect(addMonths("2026-09", -11)).toBe("2025-10");
        expect(monthsBetween("2026-06", "2026-09")).toBe(3);
        expect(monthLabel("2026-09")).toBe("set/2026");
    });
});

describe("summarizeWaterBills", () => {
    it("takes the newest bill and the twelve months up to it", () => {
        const bills = [
            bill("2026-09", { total_amount: 182.4, consumption_m3: 14, due_date: "2026-10-02T00:00:00Z", effective_rate_per_m3: "13.03", meter_number: "Y21" }),
            ...Array.from({ length: 14 }, (_, i) => bill(addMonths("2026-08", -i))),
        ];
        const { latest, last12 } = summarizeWaterBills(bills);
        expect(latest).toMatchObject({ month: "2026-09", dueDate: "2026-10-02", total: 182.4, consumptionM3: 14, ratePerM3: 13.03, meterNumber: "Y21" });
        expect(last12.months).toBe(12);
        expect(last12.consumptionM3).toBe(14 + 11 * 12);
        expect(last12.paidAmount).toBe(182.4 + 11 * 150);
        expect(last12.avgRate).toBeCloseTo((182.4 + 1650) / 146, 2);
    });
    it("derives the rate when the column is missing and handles no bills", () => {
        expect(summarizeWaterBills([bill("2026-05", { total_amount: 100, consumption_m3: 8 })]).latest?.ratePerM3).toBe(12.5);
        expect(summarizeWaterBills([]).latest).toBeNull();
    });
});

describe("waterRows", () => {
    it("classifies due state, staleness, spikes and the kept files", () => {
        const r = waterRows([unit()], TODAY)[0];
        expect(r).toMatchObject({ hasBills: true, daysToDue: 7, dueState: "due_soon", monthsSinceLatest: 0, stale: false, spike: false, hasPdf: true, hasLogo: true, place: "Nova Lima/MG" });
        expect(r.haystack).toContain("12345678");
        const old = waterRows([unit({ latestBillPdfUrl: null, logoUrl: null, latest: { ...unit().latest!, month: "2026-06", dueDate: "2026-07-05", consumptionM3: 30 } })], TODAY)[0];
        expect(old).toMatchObject({ stale: true, dueState: "ok", spike: true, hasPdf: false, hasLogo: false });
        const overdue = waterRows([unit({ latest: { ...unit().latest!, dueDate: "2026-09-20" } })], TODAY)[0];
        expect(overdue.dueState).toBe("overdue");
    });
});

describe("waterHubTotals / waterAttention / views", () => {
    const rows = waterRows([
        unit(),
        unit({ id: "p2", name: "Av. Brasil 1200", latestBillPdfUrl: null, logoUrl: null, latest: { ...unit().latest!, total: 90, consumptionM3: 8, dueDate: "2026-09-20" }, last12: { months: 6, consumptionM3: 48, paidAmount: 540, avgConsumptionM3: 8, avgAmount: 90, avgRate: 11.25 } }),
        unit({ id: "p3", name: "Sem contas", billsCount: 0, latest: null, last12: undefined, latestBillPdfUrl: null, logoUrl: null }),
    ], TODAY);
    it("adds the properties up", () => {
        expect(waterHubTotals(rows)).toMatchObject({ units: 3, withBills: 2, consumptionLatest: 22, billsLatest: 272.4, dueSoon: 1, overdue: 1, withPdf: 1, withLogo: 1, stale: 0, spikes: 0 });
        expect(waterHubTotals(rows).rateLatest).toBeCloseTo(272.4 / 22, 2);
    });
    it("lists the problems worst first", () => {
        expect(waterAttention(rows).map(i => i.kind)).toEqual(["overdue", "due_soon", "no_pdf", "no_bills"]);
        expect(waterAttention(rows)[2].text).toContain("ler o logo");
    });
    it("filters by view", () => {
        expect(rows.filter(r => inWaterView(r.hasBills, "com-contas")).length).toBe(2);
        expect(rows.filter(r => inWaterView(r.hasBills, "sem-contas")).length).toBe(1);
    });
});
