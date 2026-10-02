import { describe, expect, it } from "vitest";
import { RENT_KEY, billableItems, billableTotal, inheritCollectors, leaseComponents, resolveCollector, type CollectionLease } from "./invoice-collection";

const charge = (over: Partial<NonNullable<CollectionLease["charges"]>[number]> = {}) => ({
    id: "c1", charge_type: "CONDOMINIUM" as const, label: null, responsibility: "TENANT" as const, amount: 150, collected_by: null, ...over,
});

describe("resolveCollector", () => {
    it("keeps the owner's answer whatever the management", () => {
        expect(resolveCollector("RENT", "THIRD_PARTY", "SELF_MANAGED")).toEqual({ collector: "THIRD_PARTY", derived: false, undecided: false });
        expect(resolveCollector("IPTU", "OWNER", "AGENCY")).toEqual({ collector: "OWNER", derived: false, undecided: false });
    });

    it("reads rent and condominium from the management when nobody answered", () => {
        expect(resolveCollector("RENT", null, "SELF_MANAGED")).toEqual({ collector: "OWNER", derived: true, undecided: false });
        expect(resolveCollector("CONDOMINIUM", null, "AGENCY")).toEqual({ collector: "AGENCY", derived: true, undecided: false });
    });

    it("leaves a lease brokered by a corretor open until the owner says", () => {
        expect(resolveCollector("RENT", null, "AGENT")).toEqual({ collector: null, derived: false, undecided: true });
    });

    it("never assumes a collector for the other charges", () => {
        for (const kind of ["IPTU", "WATER", "ELECTRICITY", "GAS", "INTERNET", "OTHER"] as const) {
            expect(resolveCollector(kind, null, "SELF_MANAGED")).toEqual({ collector: null, derived: false, undecided: false });
        }
    });
});

describe("leaseComponents", () => {
    it("Kitnet 35C: the agency collects the rent, the owner collects the condominium", () => {
        const components = leaseComponents({ management_type: "AGENCY", monthly_rent: 1000, rent_collected_by: null, charges: [charge({ collected_by: "OWNER" })] });
        expect(components.map(c => [c.key, c.collector, c.billable])).toEqual([[RENT_KEY, "AGENCY", false], ["c1", "OWNER", true]]);
        expect(billableItems(components)).toEqual([{ kind: "CONDOMINIUM", description: "Condomínio", amount: 150 }]);
        expect(billableTotal(components)).toBe(150);
    });

    it("a self-managed lease bills rent and condominium, and any charge the owner marked", () => {
        const components = leaseComponents({
            management_type: "SELF_MANAGED", monthly_rent: "1200.00",
            charges: [charge(), charge({ id: "c2", charge_type: "IPTU", amount: 80, collected_by: "OWNER" }), charge({ id: "c3", charge_type: "WATER", amount: 60 })],
        });
        expect(billableItems(components).map(i => i.kind)).toEqual(["RENT", "CONDOMINIUM", "IPTU"]);
        expect(billableTotal(components)).toBe(1430);
        // the water bill is the tenant's own: listed, not billed
        expect(components.find(c => c.key === "c3")).toMatchObject({ collector: null, billable: false, undecided: false });
    });

    it("lists only what the tenant pays", () => {
        const components = leaseComponents({
            management_type: "SELF_MANAGED", monthly_rent: 900,
            charges: [charge({ responsibility: "LANDLORD" }), charge({ id: "c2", charge_type: "WATER", responsibility: "INCLUDED_IN_CONDO" }), charge({ id: "c3", charge_type: "INTERNET", responsibility: "INCLUDED" })],
        });
        expect(components.map(c => c.key)).toEqual([RENT_KEY]);
    });

    it("a charge without a fixed amount is the owner's but not billable", () => {
        const [, condo] = leaseComponents({ management_type: "SELF_MANAGED", monthly_rent: 900, charges: [charge({ amount: null })] });
        expect(condo).toMatchObject({ collector: "OWNER", amount: null, billable: false });
    });

    it("names an 'Outro' by what was typed", () => {
        const [, other] = leaseComponents({ management_type: "AGENCY", monthly_rent: 900, charges: [charge({ charge_type: "OTHER", label: "Taxa de lixo", collected_by: "OWNER", amount: 25 })] });
        expect(other.label).toBe("Taxa de lixo");
    });

    it("asks who collects on a corretor's lease", () => {
        const components = leaseComponents({ management_type: "AGENT", monthly_rent: 900, charges: [charge()] });
        expect(components.every(c => c.undecided && !c.billable)).toBe(true);
    });

    it("ignores junk in the stored answer", () => {
        const [rent] = leaseComponents({ management_type: "AGENCY", monthly_rent: 900, rent_collected_by: "SOMEONE" });
        expect(rent).toMatchObject({ stored: null, collector: "AGENCY", derived: true });
    });
});

describe("inheritCollectors", () => {
    const incoming = (over: Record<string, unknown> = {}) => ({ charge_type: "CONDOMINIUM", label: null as string | null, responsibility: "TENANT", ...over });

    it("an import (no answer sent) keeps what the owner had answered", () => {
        const out = inheritCollectors([incoming(), incoming({ charge_type: "IPTU" })], [{ charge_type: "CONDOMINIUM", label: null, collected_by: "OWNER" }]);
        expect(out.map(c => c.collected_by)).toEqual(["OWNER", null]);
    });

    it("the form's answer wins, including a cleared one", () => {
        const previous = [{ charge_type: "CONDOMINIUM", label: null, collected_by: "OWNER" }];
        expect(inheritCollectors([incoming({ collected_by: "THIRD_PARTY" })], previous)[0].collected_by).toBe("THIRD_PARTY");
        expect(inheritCollectors([incoming({ collected_by: null })], previous)[0].collected_by).toBeNull();
    });

    it("matches an 'Outro' by its label and two charges of a type one to one", () => {
        const previous = [
            { charge_type: "OTHER", label: "Taxa de lixo", collected_by: "OWNER" },
            { charge_type: "OTHER", label: "Seguro", collected_by: "AGENCY" },
            { charge_type: "IPTU", label: null, collected_by: "THIRD_PARTY" },
        ];
        const out = inheritCollectors([incoming({ charge_type: "OTHER", label: " seguro " }), incoming({ charge_type: "OTHER", label: "Taxa de Lixo" }), incoming({ charge_type: "IPTU" }), incoming({ charge_type: "IPTU" })], previous);
        expect(out.map(c => c.collected_by)).toEqual(["AGENCY", "OWNER", "THIRD_PARTY", null]);
    });

    it("a charge the tenant does not pay has no collector", () => {
        const out = inheritCollectors([incoming({ responsibility: "INCLUDED_IN_CONDO", collected_by: "OWNER" }), incoming({ charge_type: "IPTU", responsibility: "LANDLORD" })], [{ charge_type: "IPTU", label: null, collected_by: "OWNER" }]);
        expect(out.map(c => c.collected_by)).toEqual([null, null]);
    });

    it("drops junk", () => {
        expect(inheritCollectors([incoming({ collected_by: "SOMEONE" })], [])[0].collected_by).toBeNull();
    });
});
