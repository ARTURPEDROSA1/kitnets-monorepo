import { describe, expect, it } from "vitest";
import type { LeaseCharge } from "@/types/lease";
import { chargeKindOf, contractTotal, featuredCharge, monthlyTotal, tenantCharges } from "./lease-charges";

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
