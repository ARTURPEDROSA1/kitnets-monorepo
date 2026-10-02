import { describe, expect, it } from "vitest";
import { leaseComponents } from "./invoice-collection";
import { planInvoice, type PlanInput, type PlanLease } from "./invoice-generate";
import type { PayerTenant } from "./invoice-payer";
import type { BillingSettingsView } from "./invoice-views";

const UNDECIDED: BillingSettingsView = { days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null };

const lease = (over: Partial<PlanLease> = {}): PlanLease => ({
    id: "l1", property_id: "p1", unit_id: "u35c", unit_name: "Kitnet 35C", primary_tenant_id: "t1",
    status: "ACTIVE", start_date: "2026-01-10", termination_date: null, rent_due_day: 10, billing_due_day: null, billing_email: null, billing_paused: false, ...over,
});
const tenant: PayerTenant = { full_name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", use_property_address: true };
const property = { address: "Rua Santo Antônio, 35", city: "Nova Lima", state: "MG", zip: "34000123" };

/** Kitnet 35C: agency-managed, the owner collects the condominium. */
const kitnet35C = leaseComponents({
    management_type: "AGENCY", monthly_rent: 1000,
    charges: [{ id: "c1", charge_type: "CONDOMINIUM", label: null, responsibility: "TENANT", amount: 150, collected_by: "OWNER" }],
});
const selfManaged = leaseComponents({
    management_type: "SELF_MANAGED", monthly_rent: 1200,
    charges: [{ id: "c1", charge_type: "CONDOMINIUM", label: null, responsibility: "TENANT", amount: 150, collected_by: null }],
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({ lease: lease(), components: kitnet35C, tenant, property, settings: UNDECIDED, month: "2026-10", origin: "MANUAL", ...over });

describe("planInvoice", () => {
    it("Kitnet 35C: an invoice with the condominium only", () => {
        const out = planInvoice(input());
        if (!("plan" in out)) throw new Error("expected a plan");
        expect(out.plan.items).toEqual([{ kind: "CONDOMINIUM", description: "Condomínio", amount: 150 }]);
        expect(out.plan.head).toMatchObject({
            lease_id: "l1", property_id: "p1", unit_id: "u35c", unit_name: "Kitnet 35C", tenant_id: "t1",
            reference_month: "2026-10-01", due_date: "2026-10-10", origin: "MANUAL", blockers: [],
            payer_name: "Ana Souza", payer_cpf: "52998224725", payer_email: "ana@example.com",
        });
        expect(out.plan.head.payer_address).toMatchObject({ city: "Nova Lima", complement: "Kitnet 35C" });
    });

    it("a self-managed lease is invoiced for rent and condominium", () => {
        const out = planInvoice(input({ components: selfManaged }));
        if (!("plan" in out)) throw new Error("expected a plan");
        expect(out.plan.items.map(i => [i.kind, i.amount])).toEqual([["RENT", 1200], ["CONDOMINIUM", 150]]);
    });

    it("states the owner's terms as decided, and none while undecided", () => {
        const undecided = planInvoice(input());
        const decided = planInvoice(input({ settings: { days_in_advance: 10, fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 30 } }));
        if (!("plan" in undecided) || !("plan" in decided)) throw new Error("expected plans");
        expect(undecided.plan.head).toMatchObject({ fine_pct: null, interest_pct_month: null, days_payable_after_due: null });
        expect(decided.plan.head).toMatchObject({ fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 30 });
    });

    it("uses the lease's own billing day and e-mail", () => {
        const out = planInvoice(input({ lease: lease({ billing_due_day: 31, billing_email: "financeiro@example.com" }), month: "2027-02" }));
        if (!("plan" in out)) throw new Error("expected a plan");
        expect(out.plan.head).toMatchObject({ due_date: "2027-02-28", reference_month: "2027-02-01", payer_email: "financeiro@example.com" });
    });

    it("carries what is missing to issue it", () => {
        const out = planInvoice(input({ tenant: { ...tenant, email: null }, property: { ...property, zip: null } }));
        if (!("plan" in out)) throw new Error("expected a plan");
        expect(out.plan.head.blockers).toEqual(["NO_EMAIL", "NO_CEP"]);
    });

    it("says why a lease gets no invoice", () => {
        expect(planInvoice(input({ lease: lease({ billing_paused: true }) }))).toEqual({ skip: "PAUSED" });
        expect(planInvoice(input({ components: leaseComponents({ management_type: "AGENCY", monthly_rent: 1000 }) }))).toEqual({ skip: "NOTHING_TO_BILL" });
        expect(planInvoice(input({ lease: lease({ status: "TERMINATED" }) }))).toEqual({ skip: "NOT_IN_FORCE" });
        expect(planInvoice(input({ month: "2026-01" , lease: lease({ start_date: "2026-01-15" }) }))).toEqual({ skip: "BEFORE_START" });
        expect(planInvoice(input({ lease: lease({ termination_date: "2026-10-01" }) }))).toEqual({ skip: "AFTER_TERMINATION" });
        expect(planInvoice(input({ tenant: null }))).toEqual({ skip: "NO_TENANT" });
    });
});
