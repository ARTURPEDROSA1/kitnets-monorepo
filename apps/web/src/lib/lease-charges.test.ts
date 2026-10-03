import { describe, expect, it } from "vitest";
import type { LeaseCharge } from "@/types/lease";
import { chargeAdjustment, chargeAdjustmentRule, chargeKindOf, contractTotal, featuredCharge, inheritRentAdjustment, monthlyTotal, tenantCharges } from "./lease-charges";
import type { LeaseForSummary } from "./lease-summary";

const charge = (charge_type: LeaseCharge["charge_type"], responsibility: LeaseCharge["responsibility"], amount: number | null): LeaseCharge =>
    ({ id: `${charge_type}-${responsibility}`, lease_id: "l1", charge_type, label: null, responsibility, amount, adjustment_index: null, adjustment_notes: null });

const condo = charge("CONDOMINIUM", "TENANT", 350);
const energy = charge("ELECTRICITY", "TENANT", 120);
const water = charge("WATER", "LANDLORD", 80);
const iptu = charge("IPTU", "TENANT", null);

describe("featuredCharge", () => {
    it("names the condominium for a multi-unit property and the energy for a single-family one", () => {
        expect(featuredCharge([condo, energy], "multi")).toEqual({ label: "Condomínio", charge: condo });
        expect(featuredCharge([condo, energy], "single")).toEqual({ label: "Energia", charge: energy });
        expect(featuredCharge([energy], "multi")).toEqual({ label: "Condomínio", charge: null });
    });

    it("takes whichever the contract has when the kind is unknown", () => {
        expect(featuredCharge([energy], null)).toEqual({ label: "Energia", charge: energy });
        expect(featuredCharge([condo, energy], null)).toEqual({ label: "Condomínio", charge: condo });
        expect(featuredCharge([water], null)).toEqual({ label: "Encargos", charge: null });
    });

    it("leaves a garage without a kind, so its card shows whichever charge the contract has", () => {
        expect(chargeKindOf("single")).toBe("single");
        expect(chargeKindOf("multi")).toBe("multi");
        expect(chargeKindOf("garage")).toBeNull();
        expect(featuredCharge([condo], chargeKindOf("garage"))).toEqual({ label: "Condomínio", charge: condo });
    });
});

describe("totals", () => {
    it("adds the rent and the charges the tenant pays with an amount", () => {
        expect(tenantCharges([condo, energy, water, iptu])).toEqual({ items: [condo, energy], total: 470 });
        expect(monthlyTotal(1500, [condo, energy, water, iptu])).toBe(1970);
        expect(monthlyTotal(1500, [])).toBe(1500);
    });

    it("multiplies the monthly total over the term, or says nothing for an open-ended lease", () => {
        expect(contractTotal(1970, 30)).toBe(59100);
        expect(contractTotal(1970, null)).toBeNull();
        expect(contractTotal(1970, 0)).toBeNull();
    });
});

describe("inheritRentAdjustment", () => {
    const previous = [
        { charge_type: "CONDOMINIUM", label: null, adjusts_with_rent: true },
        { charge_type: "OTHER", label: "Limpeza", adjusts_with_rent: false },
    ];
    it("keeps the answer a save does not mention, matched by type and label", () => {
        const out = inheritRentAdjustment([{ charge_type: "OTHER", label: " limpeza " }, { charge_type: "CONDOMINIUM", label: null }, { charge_type: "IPTU", label: null }], previous);
        expect(out.map(c => c.adjusts_with_rent)).toEqual([false, true, false]);
    });
    it("takes the form's answer over the stored one", () => {
        expect(inheritRentAdjustment([{ charge_type: "CONDOMINIUM", label: null, adjusts_with_rent: false }], previous)[0].adjusts_with_rent).toBe(false);
        expect(inheritRentAdjustment([{ charge_type: "CONDOMINIUM", label: null, adjusts_with_rent: true }], [])[0].adjusts_with_rent).toBe(true);
    });
    it("is the condominium's alone", () => {
        expect(inheritRentAdjustment([{ charge_type: "IPTU", label: null, adjusts_with_rent: true }], [])[0].adjusts_with_rent).toBe(false);
    });
});

describe("chargeAdjustment", () => {
    // the pilot's lease: started on 16/09/2026, IGP-M, seen on 03/10/2026 with September published
    const lease: LeaseForSummary = { start_date: "2026-09-16", end_date: "2029-03-16", rent_due_day: 10, monthly_rent: 1260, adjustment_index: "IGP_M", adjustment_frequency: 12, next_adjustment_date: null };
    const series = { igpm: [{ month: "2026-09", value: 1.57 }], ipca: [{ month: "2026-09", value: 0.5 }] };
    const today = "2026-10-03";
    const condominium = (over: Partial<LeaseCharge> = {}): LeaseCharge => ({ ...charge("CONDOMINIUM", "TENANT", 250), ...over });

    it("follows the rent: same index, same date, the amount corrected day by day", () => {
        const a = chargeAdjustment(condominium({ adjusts_with_rent: true }), lease, series, today)!;
        expect(a).toMatchObject({ withRent: true, index: "IGP_M", indexLabel: "IGP-M", nextDate: "2027-09-16", cycleStart: "2026-09-16", indexThroughDate: "2026-09-30", daysCounted: 14 });
        expect(a.accumulatedPct).toBe(0.73);          // 1.0157^(14/30) − 1
        expect(a.adjustedAmount).toBe(251.82);
    });
    it("ignores the charge's own index while it follows the rent", () => {
        expect(chargeAdjustment(condominium({ adjusts_with_rent: true, adjustment_index: "IPCA" }), lease, series, today)!.index).toBe("IGP_M");
    });
    it("uses the charge's own published index on the lease's dates", () => {
        const a = chargeAdjustment(condominium({ adjustment_index: "IPCA" }), lease, series, today)!;
        expect(a).toMatchObject({ withRent: false, index: "IPCA", nextDate: "2027-09-16" });
        expect(a.accumulatedPct).toBe(0.23);          // 1.005^(14/30) − 1
        expect(a.adjustedAmount).toBe(250.58);
    });
    it("has a date but no figure without a series, or before the cycle's first month is out", () => {
        expect(chargeAdjustment(condominium({ adjusts_with_rent: true }), lease, {}, today)).toMatchObject({ nextDate: "2027-09-16", accumulatedPct: null, adjustedAmount: null });
        expect(chargeAdjustment(condominium({ adjusts_with_rent: true }), lease, { igpm: [{ month: "2026-08", value: 1 }] }, today)).toMatchObject({ accumulatedPct: null, adjustedAmount: null });
    });
    it("is nothing for a fixed amount, a rule in words, or a rent that is not readjusted", () => {
        expect(chargeAdjustment(condominium(), lease, series, today)).toBeNull();
        expect(chargeAdjustment(condominium({ adjustment_index: "NONE" }), lease, series, today)).toBeNull();
        expect(chargeAdjustment(condominium({ adjustment_index: "CUSTOM" }), lease, series, today)).toBeNull();
        expect(chargeAdjustment(condominium({ adjusts_with_rent: true }), { ...lease, adjustment_index: "NONE" }, series, today)).toBeNull();
        expect(chargeAdjustment(null, lease, series, today)).toBeNull();
    });
    it("names the rule", () => {
        expect(chargeAdjustmentRule({ adjustment_index: "IPCA", adjusts_with_rent: true }, "IGP_M")).toEqual({ index: "IGP_M", withRent: true });
        expect(chargeAdjustmentRule({ adjustment_index: "INPC", adjusts_with_rent: false }, "IGP_M")).toEqual({ index: "INPC", withRent: false });
        expect(chargeAdjustmentRule({ adjustment_index: null, adjusts_with_rent: true }, null)).toEqual({ index: null, withRent: true });
        expect(chargeAdjustmentRule({ adjustment_index: null }, "IGP_M")).toBeNull();
    });
});
