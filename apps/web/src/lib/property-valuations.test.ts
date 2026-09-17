import { describe, expect, it } from "vitest";
import { fipezapEstimate, latestValuation, priceLevelFactors, purchaseAppraisal, type PropertyValuation } from "./property-valuations";

const v = (valued_on: string, amount: number, over: Partial<PropertyValuation> = {}): PropertyValuation => ({
    id: valued_on + amount, property_id: "p", valued_on, amount, source: "MANUAL", note: null, ...over,
});

describe("latestValuation", () => {
    it("picks the newest on or before asOf", () => {
        const rows = [v("2024-01-10", 100), v("2026-03-01", 130), v("2025-06-15", 120)];
        expect(latestValuation(rows)?.amount).toBe(130);
        expect(latestValuation(rows, "2025-12")?.amount).toBe(120);
        expect(latestValuation(rows, "2023-12")).toBeNull();
    });
});

describe("fipezapEstimate", () => {
    it("compounds the months strictly after the acquisition month", () => {
        const series = [
            { month: "2024-01", value: 1 }, { month: "2024-02", value: 1 }, { month: "2024-03", value: 2 }, { month: "2024-04", value: -1 },
        ];
        const e = fipezapEstimate(100000, "2024-01-15", series);
        expect(e.from).toBe("2024-02");
        expect(e.to).toBe("2024-04");
        expect(e.months).toBe(3);
        expect(e.amount).toBeCloseTo(100000 * 1.01 * 1.02 * 0.99, 2);
        expect(fipezapEstimate(100000, "2024-01-15", series, "2024-03").amount).toBeCloseTo(100000 * 1.01 * 1.02, 2);
        expect(fipezapEstimate(100000, "2024-06-01", series).months).toBe(0);
    });
});

describe("priceLevelFactors", () => {
    it("builds levels relative to the base month and carries gaps", () => {
        const ipca = [{ month: "2024-02", value: 1 }, { month: "2024-03", value: 1 }];   // Jan and Apr missing
        const f = priceLevelFactors(ipca, "2024-01", "2024-04", "2024-04");
        expect(f.get("2024-04")).toBeCloseTo(1, 6);
        expect(f.get("2024-03")).toBeCloseTo(1, 6);                  // no change in Apr → same level as Mar
        expect(f.get("2024-02")).toBeCloseTo(1.01 / 1.0201, 6);
        expect(f.get("2024-01")).toBeCloseTo(1 / 1.0201, 6);
    });
});

describe("purchaseAppraisal", () => {
    const v = (valued_on: string, amount: number, source: PropertyValuation["source"]) => ({ valued_on, amount, source });
    it("picks the laudo closest to the purchase date, within 120 days", () => {
        const rows = [v("2018-04-10", 377000, "APPRAISAL"), v("2018-07-01", 380000, "APPRAISAL"), v("2026-08-31", 513723, "FIPEZAP"), v("2018-04-24", 400000, "MANUAL")];
        expect(purchaseAppraisal(rows, "2018-04-24")).toEqual({ valued_on: "2018-04-10", amount: 377000 });
    });
    it("ignores later appraisals, other sources and a missing purchase date", () => {
        expect(purchaseAppraisal([v("2019-04-24", 390000, "APPRAISAL")], "2018-04-24")).toBeNull();
        expect(purchaseAppraisal([v("2018-04-24", 377000, "LISTING")], "2018-04-24")).toBeNull();
        expect(purchaseAppraisal([v("2018-04-24", 377000, "APPRAISAL")], null)).toBeNull();
    });
});
