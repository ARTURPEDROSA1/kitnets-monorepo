import { describe, expect, it } from "vitest";
import type { LeaseCharge } from "@/types/lease";
import { NEGATIVE_NOTE, adjustableCondo, adjusted, contractTotals, cycleOf, dueAdjustments, initialValues, pastAdjustmentDates, rentChangePct, withAddendum, type AdjustableLease, type AdjustmentRow } from "./lease-adjustments";
import type { IndexPoint } from "./lease-summary";

/** `n` months of the same rate from `from` (`YYYY-MM`). */
const flat = (from: string, n: number, value: number): IndexPoint[] => {
    const [y, m] = from.split("-").map(Number);
    return Array.from({ length: n }, (_, i) => {
        const total = y * 12 + (m - 1) + i;
        return { month: `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`, value };
    });
};

// the Casa 35D: started on 29/08/2025, R$ 1.900, IVAR, yearly
const lease = (over: Partial<AdjustableLease> = {}): AdjustableLease => ({
    start_date: "2025-08-29", monthly_rent: 1900, adjustment_index: "IVAR", adjustment_frequency: 12, next_adjustment_date: null, charges: [], ...over,
});
const condo = (over: Record<string, unknown> = {}) => ({ charge_type: "CONDOMINIUM" as const, amount: 400, adjustment_index: null, adjusts_with_rent: true, ...over });
const TODAY = "2026-10-03";

describe("pastAdjustmentDates + cycleOf", () => {
    it("lists the anniversaries behind today, never the start itself", () => {
        expect(pastAdjustmentDates(lease(), TODAY)).toEqual(["2026-08-29"]);
        expect(pastAdjustmentDates(lease({ start_date: "2023-03-10" }), TODAY)).toEqual(["2024-03-10", "2025-03-10", "2026-03-10"]);
        expect(pastAdjustmentDates(lease({ start_date: "2026-09-16" }), TODAY)).toEqual([]);
        expect(pastAdjustmentDates(lease({ adjustment_index: "NONE" }), TODAY)).toEqual([]);
    });
    it("follows a stored adjustment date that is not the start's anniversary", () => {
        expect(pastAdjustmentDates(lease({ next_adjustment_date: "2027-01-01" }), TODAY)).toEqual(["2026-01-01"]);
    });
    it("gives each date the cycle that closes on it, cut at the lease's start", () => {
        expect(cycleOf(lease(), "2026-08-29")).toEqual({ start: "2025-08-29", periods: 12 });
        // a first adjustment moved to 01/01: the cycle is only the four months since the start
        expect(cycleOf(lease(), "2026-01-01")).toEqual({ start: "2025-08-29", periods: 4 });
    });
});

describe("dueAdjustments", () => {
    it("adjusts by the whole cycle's index, on top of the rent in force", () => {
        // August/2025 … July/2026 at 0.5 % a month
        const due = dueAdjustments(lease(), [], { ivar: flat("2025-08", 14, 0.5) }, TODAY);
        const factor = Math.pow(1.005, 12);
        expect(due.waiting).toBeNull();
        expect(due.rows).toHaveLength(1);
        expect(due.rows[0]).toMatchObject({ effective_date: "2026-08-29", source: "CALCULATED", index_code: "IVAR", index_pct: 6.17, previous_rent: 1900, new_rent: 2017.19, previous_condo: null, new_condo: null, condo_factor: null, notes: null });
        expect(due.rows[0].index_factor).toBeCloseTo(factor, 12);
        expect(due.rent).toBe(2017.19);
    });
    it("chains every anniversary a lease owes, each from the one before", () => {
        const old = lease({ start_date: "2023-03-10", monthly_rent: 1000, adjustment_index: "IPCA" });
        const due = dueAdjustments(old, [], { ipca: flat("2023-01", 48, 1) }, TODAY);
        const f = Math.pow(1.01, 12);
        expect(due.rows.map(r => r.effective_date)).toEqual(["2024-03-10", "2025-03-10", "2026-03-10"]);
        expect(due.rows.map(r => r.previous_rent)).toEqual([1000, due.rows[0].new_rent, due.rows[1].new_rent]);
        expect(due.rows[0].new_rent).toBe(1126.83);
        expect(due.rent).toBeCloseTo(1000 * f * f * f, 0);
    });
    it("starts after the last adjustment recorded, from the lease's current rent", () => {
        const old = lease({ start_date: "2023-03-10", monthly_rent: 1300, adjustment_index: "IPCA" });
        const due = dueAdjustments(old, [{ effective_date: "2025-03-10" }], { ipca: flat("2023-01", 48, 1) }, TODAY);
        expect(due.rows.map(r => r.effective_date)).toEqual(["2026-03-10"]);
        expect(due.rows[0].previous_rent).toBe(1300);
    });
    it("takes an addendum dated a little before the anniversary as that anniversary's adjustment", () => {
        expect(dueAdjustments(lease(), [{ effective_date: "2026-08-10" }], { ivar: flat("2025-08", 14, 0.5) }, TODAY).rows).toEqual([]);
        expect(dueAdjustments(lease(), [{ effective_date: "2026-09-01" }], { ivar: flat("2025-08", 14, 0.5) }, TODAY).rows).toEqual([]);
        // one from long before does not
        expect(dueAdjustments(lease(), [{ effective_date: "2026-03-01" }], { ivar: flat("2025-08", 14, 0.5) }, TODAY).rows).toHaveLength(1);
    });
    it("waits while the cycle is not fully published, and says so", () => {
        // July/2026 missing
        const due = dueAdjustments(lease(), [], { ivar: flat("2025-08", 11, 0.5) }, TODAY);
        expect(due.rows).toEqual([]);
        expect(due.rent).toBe(1900);
        expect(due.waiting).toEqual({ date: "2026-08-29", reason: "NOT_PUBLISHED" });
        expect(dueAdjustments(lease(), [], {}, TODAY).waiting).toEqual({ date: "2026-08-29", reason: "NOT_PUBLISHED" });
    });
    it("cannot calculate an index Kitnets has no series for: only an addendum says the value", () => {
        expect(dueAdjustments(lease({ adjustment_index: "CUSTOM" }), [], {}, TODAY).waiting).toEqual({ date: "2026-08-29", reason: "NO_SERIES" });
        expect(dueAdjustments(lease({ adjustment_index: "NONE" }), [], {}, TODAY)).toMatchObject({ rows: [], waiting: null });
    });
    it("keeps the amount when the cycle's index is negative, and shows the index", () => {
        const due = dueAdjustments(lease(), [], { ivar: flat("2025-08", 14, -0.2) }, TODAY);
        expect(due.rows[0]).toMatchObject({ index_pct: -2.37, previous_rent: 1900, new_rent: 1900, notes: NEGATIVE_NOTE });
        expect(due.rent).toBe(1900);
    });
    it("adjusts the condominium with the rent, or by its own index", () => {
        const series = { ivar: flat("2025-08", 14, 0.5), ipca: flat("2025-08", 14, 1) };
        const withRent = dueAdjustments(lease({ charges: [condo()] }), [], series, TODAY);
        expect(withRent.rows[0]).toMatchObject({ previous_condo: 400, new_condo: 424.67 });
        expect(withRent.rows[0].condo_factor).toBeCloseTo(Math.pow(1.005, 12), 12);
        expect(withRent.condo).toBe(424.67);

        const own = dueAdjustments(lease({ charges: [condo({ adjusts_with_rent: false, adjustment_index: "IPCA" })] }), [], series, TODAY);
        expect(own.rows[0]).toMatchObject({ new_rent: 2017.19, new_condo: 450.73 });

        // a fixed condominium is left alone
        const fixed = dueAdjustments(lease({ charges: [condo({ adjusts_with_rent: false, adjustment_index: "NONE" })] }), [], series, TODAY);
        expect(fixed.rows[0]).toMatchObject({ previous_condo: null, new_condo: null });
        expect(adjustableCondo(lease({ charges: [condo({ adjusts_with_rent: false })] }))).toBeNull();
    });
    it("holds the whole adjustment until the condominium's own index is out too", () => {
        const due = dueAdjustments(lease({ charges: [condo({ adjusts_with_rent: false, adjustment_index: "IPCA" })] }), [], { ivar: flat("2025-08", 14, 0.5), ipca: flat("2025-08", 11, 1) }, TODAY);
        expect(due.rows).toEqual([]);
        expect(due.waiting).toEqual({ date: "2026-08-29", reason: "NOT_PUBLISHED" });
    });
});

describe("withAddendum", () => {
    const calculated = (date: string, previous: number, factor: number, over: Partial<AdjustmentRow> = {}): AdjustmentRow => ({
        effective_date: date, source: "CALCULATED", index_code: "IPCA", index_pct: Math.round((factor - 1) * 10000) / 100, index_factor: factor,
        previous_rent: previous, new_rent: adjusted(previous, factor), previous_condo: null, new_condo: null, condo_factor: null, notes: null, ...over,
    });
    it("is the first row of a lease without history, on top of the contract's values", () => {
        const out = withAddendum([], { effective_date: "2026-08-29", new_rent: 2000, document_id: "d1" }, { rent: 1900, condo: 400 });
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0]).toMatchObject({ source: "ADDENDUM", previous_rent: 1900, new_rent: 2000, previous_condo: 400, new_condo: null, document_id: "d1" });
        expect(out).toMatchObject({ rent: 2000, condo: 400 });
    });
    it("replaces the calculated row of its date and chains the later ones again", () => {
        const rows = [calculated("2024-03-10", 1000, 1.1), calculated("2025-03-10", 1100, 1.1), calculated("2026-03-10", 1210, 1.1)];
        const out = withAddendum(rows, { effective_date: "2024-03-10", new_rent: 1050 }, { rent: 1000, condo: null });
        expect(out.rows.map(r => [r.effective_date, r.source, r.previous_rent, r.new_rent])).toEqual([
            ["2024-03-10", "ADDENDUM", 1000, 1050],
            ["2025-03-10", "CALCULATED", 1050, 1155],
            ["2026-03-10", "CALCULATED", 1155, 1270.5],
        ]);
        expect(out.rent).toBe(1270.5);
    });
    it("stands for the anniversary next to it: that date's calculated row gives way", () => {
        const rows = [calculated("2025-03-10", 1000, 1.1), calculated("2026-03-10", 1100, 1.1)];
        const out = withAddendum(rows, { effective_date: "2026-03-25", new_rent: 1150 }, { rent: 1000, condo: null });
        expect(out.rows.map(r => [r.effective_date, r.source, r.previous_rent, r.new_rent])).toEqual([
            ["2025-03-10", "CALCULATED", 1000, 1100],
            ["2026-03-25", "ADDENDUM", 1100, 1150],
        ]);
    });
    it("leaves a later addendum's own value alone and only moves what it started from", () => {
        const rows: AdjustmentRow[] = [
            calculated("2024-03-10", 1000, 1.1),
            { ...calculated("2025-03-10", 1100, 1), source: "ADDENDUM", index_factor: null, index_pct: null, new_rent: 1180 },
        ];
        const out = withAddendum(rows, { effective_date: "2024-03-10", new_rent: 1050 }, { rent: 1000, condo: null });
        expect(out.rows[1]).toMatchObject({ source: "ADDENDUM", previous_rent: 1050, new_rent: 1180 });
        expect(out.rent).toBe(1180);
    });
    it("carries the condominium when the addendum does not mention it, and takes it when it does", () => {
        const rows = [calculated("2026-03-10", 1000, 1.1, { previous_condo: 200, new_condo: 220, condo_factor: 1.1 })];
        const silent = withAddendum(rows, { effective_date: "2025-03-10", new_rent: 900 }, { rent: 800, condo: 200 });
        expect(silent.rows[0]).toMatchObject({ previous_condo: 200, new_condo: null });
        expect(silent.rows[1]).toMatchObject({ previous_rent: 900, new_rent: 990, previous_condo: 200, new_condo: 220 });
        const said = withAddendum(rows, { effective_date: "2025-03-10", new_rent: 900, new_condo: 250 }, { rent: 800, condo: 200 });
        expect(said.rows[1]).toMatchObject({ previous_condo: 250, new_condo: 275 });
        expect(said.condo).toBe(275);
    });
    it("keeps a calculated row's amount when its index was negative", () => {
        const out = withAddendum([calculated("2026-03-10", 1000, 0.98)], { effective_date: "2025-03-10", new_rent: 1100 }, { rent: 1000, condo: null });
        expect(out.rows[1]).toMatchObject({ previous_rent: 1100, new_rent: 1100 });
    });
});

describe("initialValues + rentChangePct", () => {
    it("reads the contract's original amounts from the first adjustment, else from the lease", () => {
        expect(initialValues(lease({ monthly_rent: 2017.19, charges: [condo({ amount: 424.67 })] }), [{ effective_date: "2026-08-29", previous_rent: 1900, previous_condo: 400 }])).toEqual({ rent: 1900, condo: 400 });
        expect(initialValues(lease({ charges: [condo()] }), [])).toEqual({ rent: 1900, condo: 400 });
        expect(initialValues(lease(), [])).toEqual({ rent: 1900, condo: null });
    });
    it("gives the variation an adjustment made", () => {
        expect(rentChangePct({ previous_rent: 1900, new_rent: 2017.19 })).toBe(6.17);
        expect(rentChangePct({ previous_rent: 0, new_rent: 100 })).toBeNull();
    });
});

describe("contractTotals", () => {
    const tenantCharge = (charge_type: LeaseCharge["charge_type"], amount: number, responsibility: LeaseCharge["responsibility"] = "TENANT"): LeaseCharge =>
        ({ id: charge_type, lease_id: "l1", charge_type, label: null, responsibility, amount, adjustment_index: null, adjustment_notes: null });
    // the Kitnet 35: 30 months from 20/12/2024, adjusted on 20/12/2025
    const kitnet = { start_date: "2024-12-20", monthly_rent: 1603.53, charges: [tenantCharge("CONDOMINIUM", 267.25)] };
    const adjustments = [{ effective_date: "2025-12-20", previous_rent: 1500, new_rent: 1603.53, previous_condo: 250, new_condo: 267.25 }];

    it("adds each month at the amount in force then, and the months ahead at today's", () => {
        // 12 months at 1.500 / 250, then 18 at 1.603,53 / 267,25
        expect(contractTotals(kitnet, 30, adjustments, "2026-10-03")).toEqual({ rent: 46863.54, condo: 7810.5, total: 54674.04 });
    });
    it("is the monthly amount times the term for a lease that was never adjusted", () => {
        expect(contractTotals({ start_date: "2026-09-16", monthly_rent: 1260, charges: [tenantCharge("CONDOMINIUM", 250)] }, 30, [], "2026-10-03")).toEqual({ rent: 37800, condo: 7500, total: 45300 });
    });
    it("counts the tenant's other fixed charges at today's amount, and leaves out what the tenant does not pay", () => {
        const withIptu = { ...kitnet, charges: [tenantCharge("CONDOMINIUM", 267.25, "LANDLORD"), tenantCharge("IPTU", 40)] };
        expect(contractTotals(withIptu, 30, adjustments, "2026-10-03")).toEqual({ rent: 46863.54, condo: null, total: 48063.54 });
    });
    it("takes a rent edited by hand for the months ahead only", () => {
        const edited = contractTotals({ ...kitnet, monthly_rent: 1700 }, 30, adjustments, "2026-10-03")!;
        // 12 at 1.500, 10 at 1.603,53 (20/12/2025 … 20/09/2026), 8 at 1.700
        expect(edited.rent).toBe(47635.3);
    });
    it("has no total for an open-ended lease", () => {
        expect(contractTotals(kitnet, null, adjustments, "2026-10-03")).toBeNull();
        expect(contractTotals(kitnet, 0, adjustments, "2026-10-03")).toBeNull();
    });
});
