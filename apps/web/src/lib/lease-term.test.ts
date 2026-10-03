import { describe, expect, it } from "vitest";
import type { LeaseCharge } from "@/types/lease";
import { days360, leaseTermTotals, paymentSchedule, type RealizedMonth, type TermLease } from "./lease-term";

const charge = (charge_type: LeaseCharge["charge_type"], amount: number, responsibility: LeaseCharge["responsibility"] = "TENANT"): LeaseCharge =>
    ({ id: charge_type, lease_id: "l1", charge_type, label: null, responsibility, amount, adjustment_index: null, adjustment_notes: null });

/** `n` months from `from` (`YYYY-MM`). */
const months = (from: string, n: number): string[] => {
    const [y, m] = from.split("-").map(Number);
    return Array.from({ length: n }, (_, i) => { const t = y * 12 + (m - 1) + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; });
};

// the Kitnet 35: 20/12/2024 → 20/06/2027 (30 months), due every 10th, adjusted on 20/12/2025
const kitnet: TermLease = { start_date: "2024-12-20", end_date: "2027-06-20", rent_due_day: 10, monthly_rent: 1603.53, charges: [charge("CONDOMINIUM", 267.25)] };
const adjustments = [{ effective_date: "2025-12-20", previous_rent: 1500, new_rent: 1603.53, previous_condo: 250, new_condo: 267.25 }];
const TODAY = "2026-10-03";

describe("days360", () => {
    it("counts in the commercial month", () => {
        expect(days360("2024-12-20", "2025-01-10")).toBe(20);
        expect(days360("2027-06-10", "2027-06-20")).toBe(10);
        expect(days360("2025-01-10", "2025-02-10")).toBe(30);
        expect(days360("2025-01-31", "2025-02-28")).toBe(28);
    });
});

describe("paymentSchedule", () => {
    it("pays the first month pro rata to the first due day, whole months after it, and the rest of the term at the end", () => {
        const s = paymentSchedule("2024-12-20", "2027-06-20", 10);
        expect(s[0]).toEqual({ due: "2025-01-10", month: "2025-01", fraction: 20 / 30 });
        expect(s[1]).toEqual({ due: "2025-02-10", month: "2025-02", fraction: 1 });
        expect(s[s.length - 2]).toEqual({ due: "2027-06-10", month: "2027-06", fraction: 1 });
        expect(s[s.length - 1]).toEqual({ due: "2027-06-20", month: "2027-06", fraction: 10 / 30 });
        expect(s).toHaveLength(31);
        // 20/30 + 29 whole + 10/30: the 30 months of the term
        expect(s.reduce((sum, p) => sum + p.fraction, 0)).toBeCloseTo(30, 10);
    });
    it("has a due day later in the start's own month as the first payment", () => {
        const s = paymentSchedule("2026-09-05", "2027-03-05", 10);
        expect(s[0]).toEqual({ due: "2026-09-10", month: "2026-09", fraction: 5 / 30 });
        expect(s.reduce((sum, p) => sum + p.fraction, 0)).toBeCloseTo(6, 10);
    });
    it("is whole months when the lease starts on the due day, or ends on the eve of its anniversary", () => {
        expect(paymentSchedule("2026-01-10", "2026-07-10", 10).map(p => p.fraction)).toEqual([1, 1, 1, 1, 1, 1]);
        const eve = paymentSchedule("2025-03-01", "2026-02-28", 1);
        expect(eve).toHaveLength(12);
        expect(eve.every(p => p.fraction === 1)).toBe(true);
    });
    it("keeps a due day past a month's end on its last day", () => {
        expect(paymentSchedule("2026-01-15", "2026-04-15", 31).map(p => p.due)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-15"]);
    });
    it("has no schedule without an end, or for an end before the start", () => {
        expect(paymentSchedule("2024-12-20", null, 10)).toEqual([]);
        expect(paymentSchedule("2024-12-20", "2024-12-01", 10)).toEqual([]);
    });
});

describe("leaseTermTotals", () => {
    it("is all forecast without a ledger: the contract's schedule at the amounts in force", () => {
        const t = leaseTermTotals(kitnet, adjustments, [], TODAY);
        // 1.500 × 20/30 + 11 × 1.500 (10/02 … 10/12/2025) + 18 × 1.603,53 (10/01/2026 … 10/06/2027) + 1.603,53 × 10/30
        expect(t.rent).toEqual({ realized: 0, forecast: 46898.05, total: 46898.05 });
        // 250 × 20/30 + 11 × 250 + 18 × 267,25 + 267,25 × 10/30
        expect(t.condo).toEqual({ realized: 0, forecast: 7816.25, total: 7816.25 });
        expect(t.total.total).toBe(54714.3);
        expect(t).toMatchObject({ forecastKnown: true, months: 30 });
    });
    it("counts a confirmed month at what the ledger says and forecasts only the rest", () => {
        // January/2025 pro rata, then eleven months at 1.500 and nine at 1.603,53: 21 months realized
        const ledger: RealizedMonth[] = months("2025-01", 21).map((month, i) => ({ month, rent: i === 0 ? 1000 : i < 12 ? 1500 : 1603.53, condo: i === 0 ? 166.67 : i < 12 ? 250 : 267.25 }));
        const t = leaseTermTotals(kitnet, adjustments, ledger, TODAY);
        expect(t.rent.realized).toBe(1000 + 11 * 1500 + 9 * 1603.53);
        // 10/10/2026 … 10/06/2027 whole (9) + the last 10 days
        expect(t.rent.forecast).toBe(Math.round((9 + 10 / 30) * 1603.53 * 100) / 100);
        expect(t.rent.total).toBe(Math.round((t.rent.realized + t.rent.forecast) * 100) / 100);
        expect(t.condo!.realized).toBe(Math.round((166.67 + 11 * 250 + 9 * 267.25) * 100) / 100);
        expect(t.total.realized).toBe(Math.round((t.rent.realized + t.condo!.realized) * 100) / 100);
    });
    it("takes what the ledger says even when it is not what the contract expected", () => {
        const t = leaseTermTotals(kitnet, adjustments, [{ month: "2025-01", rent: 1050, condo: 0 }, { month: "2024-12", rent: 300, condo: 0 }], TODAY);
        expect(t.rent.realized).toBe(1350);                       // the pro rata as paid, plus a month the schedule did not have
        expect(t.rent.forecast).toBe(Math.round((46898.05 - 1000) * 100) / 100);
    });
    it("forecasts a month behind today that the ledger does not have, at the amount in force then", () => {
        const ledger: RealizedMonth[] = months("2025-01", 21).filter(m => m !== "2025-06").map(month => ({ month, rent: 1500, condo: 250 }));
        const gap = leaseTermTotals(kitnet, adjustments, ledger, TODAY);
        const full = leaseTermTotals(kitnet, adjustments, months("2025-01", 21).map(month => ({ month, rent: 1500, condo: 250 })), TODAY);
        expect(gap.rent.forecast - full.rent.forecast).toBeCloseTo(1500, 2);
    });
    it("uses today's amounts for the payments ahead, a rent edited by hand included", () => {
        const t = leaseTermTotals({ ...kitnet, monthly_rent: 1700 }, adjustments, months("2025-01", 21).map(month => ({ month, rent: 1500, condo: 250 })), TODAY);
        expect(t.rent.forecast).toBe(Math.round((9 + 10 / 30) * 1700 * 100) / 100);
    });
    it("adds the tenant's other fixed charges to the forecast, and leaves out a condominium the tenant does not pay", () => {
        const t = leaseTermTotals({ ...kitnet, charges: [charge("CONDOMINIUM", 267.25, "LANDLORD"), charge("IPTU", 40)] }, adjustments, [], TODAY);
        expect(t.condo).toBeNull();
        expect(t.total.forecast).toBe(Math.round((46898.05 + 30 * 40) * 100) / 100);
    });
    it("gives a fixed energy charge its own line: what the ledger says, then today's amount", () => {
        // a house with solar panels: 36 months from 10/12/2025, R$ 4.000 + R$ 350 of energy
        const house: TermLease = { start_date: "2025-12-10", end_date: "2028-12-09", rent_due_day: 10, monthly_rent: 4000, charges: [charge("ELECTRICITY", 350)] };
        const ledger: RealizedMonth[] = months("2026-01", 9).map(month => ({ month, rent: 4000, condo: 0, energy: 350 }));
        const t = leaseTermTotals(house, [], ledger, TODAY);
        expect(t.condo).toBeNull();
        expect(t.energy).toEqual({ realized: 3150, forecast: 9450, total: 12600 });   // 9 months in, 27 to come
        expect(t.total.realized).toBe(36000 + 3150);
        expect(t.total.forecast).toBe(108000 + 9450);
        expect(leaseTermTotals(kitnet, adjustments, [], TODAY).energy).toBeNull();
    });
    it("has only the realized side for an open-ended lease", () => {
        const t = leaseTermTotals({ ...kitnet, end_date: null }, adjustments, [{ month: "2025-01", rent: 1000, condo: 166.67 }], TODAY);
        expect(t).toMatchObject({ forecastKnown: false, rent: { realized: 1000, forecast: 0, total: 1000 } });
    });
    it("stops the schedule at the termination", () => {
        const t = leaseTermTotals({ ...kitnet, termination_date: "2025-03-20" }, [], [], TODAY);
        // 20/30 + 10/02 + 10/03 + 10/30: three months
        expect(t.months).toBe(3);
    });
});
