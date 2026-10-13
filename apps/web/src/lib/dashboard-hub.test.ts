import { describe, expect, it } from "vitest";
import {
    boardMonths, calendarWeeks, contractDates, contractedRent, freshRentIds, isEmptyPortfolio, latestConfirmedMonth, leaseRowsOf, monthOutflows, monthRents,
    monthResult, newestLedgerChange, occupancyOf, owesRentIn, rentDueIn, rentTotals,
} from "./dashboard-hub";
import type { DashboardView } from "./dashboard-views";
import type { InvestmentCardSummary } from "./new-investment-metrics";
import type { NewInvestment } from "./new-investments";
import type { PropertyEntry } from "./property-entries-server";
import type { PropertyIncomeRow } from "./property-income";
import type { PropertyTax } from "./property-taxes";
import type { InvoiceView } from "./invoice-views";
import type { LeaseWithDetails } from "@/types/lease";

const TODAY = "2026-10-12";

const entry = (over: Partial<PropertyEntry>): PropertyEntry => ({
    id: "p1", key: "p1", index: 0, name: "Santo Antonio", propertyType: "multi", units: 3, unitIds: ["u1", "u2", "u3"], subUnitCount: 3,
    address: { street: "Rua A", city: "Itabirito", state: "MG" }, addressText: "Rua A · Itabirito/MG", photos: [], hasSolar: true, isSaved: true,
    ...over,
});

const lease = (id: string, over: Partial<LeaseWithDetails> = {}): LeaseWithDetails => ({
    id, property_id: "p1", unit_id: "u1", primary_tenant_id: "t1", status: "ACTIVE", start_date: "2026-01-01", end_date: "2026-12-31", termination_date: null,
    monthly_rent: 1000, rent_due_day: 5, security_deposit: 1000, deposit_months: 1, adjustment_index: "IPCA", adjustment_frequency: 12, next_adjustment_date: null,
    management_type: "SELF_MANAGED", agency_id: null, agent_id: null, reference_name: null, property_name: "Santo Antonio", unit_name: "Kitnet 35",
    primary_tenant_name: "Maria", agency_name: null, agent_name: null, document_count: 1, additional_tenants: [], charges: [], documents: [],
    ...over,
}) as unknown as LeaseWithDetails;

const income = (over: Partial<PropertyIncomeRow>): PropertyIncomeRow => ({
    id: "r", property_id: "p1", month: "2026-10-01", unit_id: "u1", received_on: "2026-10-06", received_amount: 0, energy_portion: 0, other_income: 0, other_expenses: 0,
    condo_amount: 0, fee_on_condo: false, condo_direct: false, direct_rent: 0, direct_condo: 0, direct_energy: 0, direct_other: 0, iptu_amount: 0, agency_fee_pct: 0,
    status: "CONFIRMED", source: "MANUAL", bank_reference: null, notes: null, updated_at: "2026-10-06T12:00:00+00:00",
    ...over,
});

const invoice = (over: Partial<InvoiceView>): InvoiceView => ({
    id: "f1", number: 14, lease_id: "l3", property_id: "p2", unit_id: null, unit_name: null, tenant_id: "t3", reference_month: "2026-10-01", due_date: "2026-10-05",
    amount: 2000, status: "ISSUED", origin: "AUTO", blockers: [], payer_name: null, payer_email: null, issued_at: "2026-09-25T00:00:00Z", paid_on: null, paid_amount: null,
    late_fee_amount: 0, surcharge_amount: 0, paid_via: null, cancelled_at: null, cancel_reason: null, notes: null, created_at: "2026-09-25T00:00:00Z",
    property_name: "Casa X", tenant_name: "Ana", items: [], charge: null, delivery: null,
    ...over,
}) as unknown as InvoiceView;

const tax = (over: Partial<PropertyTax>): PropertyTax => ({ id: "x", property_id: "p1", year: 2026, kind: "IPTU", amount: 0, paid_by: "LANDLORD", paid_on: null, comment: null, installments: [], document_path: null, extracted_at: null, ...over }) as PropertyTax;
const inv = (id: string, over: Partial<NewInvestment> = {}): NewInvestment => ({ id, name: id, unit_label: null, status: "ACTIVE", promoted_property_id: null, strategy: "NA_PLANTA", developer: null, address: null, city: null, state: null, zip: null, ...over }) as unknown as NewInvestment;
const summary = (id: string, over: Partial<InvestmentCardSummary> = {}): InvestmentCardSummary => ({ id, paidToDate: 0, committed: 0, paidPct: 0, remaining: 0, nextDueOn: null, nextDueAmount: 0, overdueCount: 0, monthsToKeys: null, keysOn: null, netYieldPct: null, documents: 0, coverUrl: null, photoUrls: [], saleNet: null, realizedGain: null, ...over });

const leases = [
    // unit u1, self-managed, paid on the 6th
    lease("l1"),
    // unit u2, through an agency at 10%, due on the 15th: still ahead
    lease("l2", { unit_id: "u2", unit_name: "Kitnet 35A", rent_due_day: 15, management_type: "AGENCY", agency_name: "Lar BH", primary_tenant_name: "João", monthly_rent: 1200 }),
    // a house, billed by invoice, due on the 5th, not paid: overdue
    lease("l3", { property_id: "p2", unit_id: null, unit_name: null, property_name: "Casa X", primary_tenant_name: "Ana", monthly_rent: 2000 }),
    // started this month: owes nothing before November
    lease("l4", { unit_id: "u3", unit_name: "Kitnet 35B", start_date: "2026-10-03", primary_tenant_name: "Bia" }),
    // closed in August
    lease("l5", { unit_id: "u3", status: "TERMINATED", end_date: "2026-12-31", termination_date: "2026-08-20" }),
    lease("l6", { status: "DRAFT" }),
];

const view: DashboardView = {
    profile: { fullName: "Artur", email: "x@y" },
    properties: [entry({}), entry({ id: "p2", key: "p2", index: 1, name: "Casa X", propertyType: "single", units: 1, unitIds: [], subUnitCount: 0, hasSolar: false })],
    leases,
    ledger: {
        from: "2025-11",
        to: "2026-10",
        rows: [
            income({ id: "a", received_amount: 1000, updated_at: "2026-10-06T12:00:00+00:00" }),
            // September: both kitnets in, the agency kept 10% of u2
            income({ id: "b", month: "2026-09-01", received_amount: 1000, updated_at: "2026-09-06T12:00:00+00:00" }),
            income({ id: "c", month: "2026-09-01", unit_id: "u2", received_amount: 1080, agency_fee_pct: 10, updated_at: "2026-09-17T12:00:00+00:00" }),
            income({ id: "d", month: "2026-09-01", property_id: "p2", unit_id: null, received_amount: 2000, other_expenses: 100, updated_at: "2026-09-08T12:00:00+00:00" }),
            // October, still only expected for the house
            income({ id: "e", property_id: "p2", unit_id: null, received_amount: 2000, status: "EXPECTED", updated_at: "2026-09-30T12:00:00+00:00" }),
        ],
        feeAllTime: 1500,
        fee12m: 1200,
    },
    housed: 4,
    invoices: [invoice({})],
    energy: null,
    water: null,
    projects: {
        investments: [inv("i1"), inv("i2", { status: "SOLD" })],
        summaries: { i1: summary("i1", { nextDueOn: "2026-10-20", nextDueAmount: 3200, overdueCount: 1 }), i2: summary("i2", { nextDueOn: "2026-10-21", nextDueAmount: 99 }) },
    },
    taxes: [tax({ id: "x1", property_id: "p2", amount: 300, paid_on: "2026-09-10" })],
    failed: [],
};

describe("rentDueIn / owesRentIn", () => {
    it("puts the due day in the month, the last day when the month is shorter", () => {
        expect(rentDueIn("2026-10", 5)).toBe("2026-10-05");
        expect(rentDueIn("2026-02", 31)).toBe("2026-02-28");
        expect(rentDueIn("2026-10", null)).toBe("2026-10-01");
    });
    it("owes nothing in the first month, as a draft, or after a closed contract's end", () => {
        expect(owesRentIn(leases[3], "2026-10", "2026-10-05")).toBe(false);
        expect(owesRentIn(leases[3], "2026-11", "2026-11-05")).toBe(true);
        expect(owesRentIn(leases[4], "2026-08", "2026-08-05")).toBe(true);
        expect(owesRentIn(leases[4], "2026-09", "2026-09-05")).toBe(false);
        expect(owesRentIn(leases[5], "2026-10", "2026-10-05")).toBe(false);
    });
    it("keeps a contract in force paying past its term, until the move-out day of a notice", () => {
        const past = lease("x", { end_date: "2026-06-30" });
        expect(owesRentIn(past, "2026-10", "2026-10-05")).toBe(true);
        const notice = lease("y", { termination_date: "2026-10-10" });
        expect(owesRentIn(notice, "2026-10", "2026-10-05")).toBe(true);
        expect(owesRentIn(notice, "2026-11", "2026-11-05")).toBe(false);
    });
});

describe("monthRents", () => {
    const rents = monthRents(view, "2026-10", TODAY);
    it("lists the rents due in the month, in due-date order, each with its status", () => {
        expect(rents.map(r => [r.lease.id, r.due, r.status])).toEqual([
            ["l3", "2026-10-05", "vencido"],
            ["l1", "2026-10-05", "recebido"],
            ["l2", "2026-10-15", "a_vencer"],
        ]);
    });
    it("reads the receipt from the unit's confirmed row, never from an expected one", () => {
        const l1 = rents.find(r => r.lease.id === "l1")!;
        expect(l1.received).toMatchObject({ gross: 1000, net: 1000, fee: 0, total: 1000, on: "2026-10-06" });
        expect(rents.find(r => r.lease.id === "l3")!.received).toBeNull();
    });
    it("carries the month's invoice and names who manages the contract", () => {
        const l3 = rents.find(r => r.lease.id === "l3")!;
        expect(l3.invoice).toMatchObject({ number: 14, display: "em_atraso", daysLate: 7 });
        expect(l3.days).toBe(-7);
        expect(rents.find(r => r.lease.id === "l2")!.manager).toBe("Lar BH");
        expect(l3.manager).toBe("Gestão própria");
    });
    it("counts a paid invoice the ledger has not caught yet", () => {
        const paid = monthRents({ ...view, invoices: [invoice({ status: "PAID", paid_on: "2026-10-04", paid_amount: 2000 })] }, "2026-10", TODAY);
        expect(paid.find(r => r.lease.id === "l3")).toMatchObject({ status: "recebido", received: { gross: 2000, on: "2026-10-04", source: "INVOICE" } });
    });
    it("splits the agency's fee off the rent of a past month", () => {
        const sept = monthRents(view, "2026-09", TODAY);
        const l2 = sept.find(r => r.lease.id === "l2")!;
        expect(l2.status).toBe("recebido");
        expect(l2.received).toMatchObject({ gross: 1200, net: 1080, fee: 120 });
        // the house's September row was saved without a unit: the whole-property contract reads it
        expect(sept.find(r => r.lease.id === "l3")!.received?.gross).toBe(2000);
        // closed on 20/08: it owed August, not September
        expect(sept.some(r => r.lease.id === "l5")).toBe(false);
    });
});

describe("rentTotals / freshRentIds", () => {
    it("adds what was due, what came in, what is ahead and what is overdue", () => {
        const t = rentTotals(monthRents(view, "2026-10", TODAY));
        expect(t.expected).toEqual({ amount: 4200, count: 3 });
        expect(t.received).toMatchObject({ gross: 1000, net: 1000, count: 1 });
        expect(t.pending).toEqual({ amount: 1200, count: 1, next: "2026-10-15" });
        expect(t.overdue).toEqual({ amount: 2000, count: 1, since: "2026-10-05" });
    });
    it("lights the receipts posted after the last visit, and none on a first visit", () => {
        const rents = monthRents(view, "2026-09", TODAY);
        expect([...freshRentIds(rents, "2026-09-10T00:00:00Z")]).toEqual(["l2|2026-09"]);
        expect(freshRentIds(rents, null).size).toBe(0);
    });
    it("knows the newest confirmed change and month", () => {
        expect(newestLedgerChange(view)).toBe("2026-10-06T12:00:00+00:00");
        expect(latestConfirmedMonth(view)).toBe("2026-10");
        expect(latestConfirmedMonth({ ledger: null })).toBeNull();
    });
});

describe("monthResult", () => {
    it("adds the properties' confirmed month with the owner's IPTU as a cost", () => {
        const r = monthResult(view, "2026-09")!;
        expect(r.properties).toBe(2);
        expect(r.grossRent).toBe(4200);
        expect(r.fee).toBe(120);
        // 1000 + 1080 + 2000 in, 100 of other expenses and 300 of IPTU out
        expect(r.noi).toBe(3680);
        expect(monthResult(view, "2026-08")).toBeNull();
    });
});

describe("monthOutflows / contractDates", () => {
    it("lists the instalments due in the month and, this month, the late ones", () => {
        const out = monthOutflows(view, "2026-10", TODAY);
        expect(out.map(e => [e.kind, e.date, e.amount, e.detail])).toEqual([
            ["parcela", null, null, "1 parcela em atraso"],
            ["parcela", "2026-10-20", 3200, "parcela do projeto"],
        ]);
        expect(monthOutflows(view, "2026-09", TODAY)).toEqual([]);
    });
    it("lists the adjustments and the ends of the contracts in force inside the dates", () => {
        const rows = leaseRowsOf({
            leases: [
                // ends on 09/11: no adjustment on 10/11, after the end
                lease("a", { start_date: "2025-11-10", end_date: "2026-11-09" }),
                lease("b", { start_date: "2025-11-15", end_date: "2027-11-14" }),
                lease("c", { start_date: "2025-11-20", end_date: "2027-11-19", adjustment_index: "NONE" }),
            ],
        }, TODAY);
        const dates = contractDates(rows, TODAY, "2026-12-11");
        expect(dates.map(e => [e.href, e.kind, e.date])).toEqual([
            ["/contratos?id=a", "termino", "2026-11-09"],
            ["/contratos?id=b", "reajuste", "2026-11-15"],
        ]);
    });
});

describe("occupancyOf / contractedRent / isEmptyPortfolio", () => {
    it("counts the units with a contract in force", () => {
        expect(occupancyOf(view.properties, leases)).toEqual({ units: 4, occupied: 4, pct: 100, propertiesWithLease: 2 });
    });
    it("counts a rented garage as one occupied unit, like a single-family property", () => {
        const g = entry({ id: "g1", key: "g1", propertyType: "garage", units: 1, unitIds: [], subUnitCount: 0 });
        expect(occupancyOf([g], [lease("x", { property_id: "g1", unit_id: null })])).toMatchObject({ units: 1, occupied: 1 });
    });
    it("adds the rent in force by who manages it", () => {
        const c = contractedRent(leases);
        expect(c.total).toBe(5200);
        expect(c.count).toBe(4);
        expect(c.parts.find(p => p.type === "AGENCY")).toEqual({ type: "AGENCY", amount: 1200, count: 1 });
    });
    it("is empty only with nothing registered", () => {
        expect(isEmptyPortfolio(view)).toBe(false);
        expect(isEmptyPortfolio({ properties: [], leases: [], projects: null })).toBe(true);
    });
});

describe("calendarWeeks / boardMonths", () => {
    it("lays the month out Sunday first", () => {
        const weeks = calendarWeeks("2026-10");
        expect(weeks).toHaveLength(5);
        expect(weeks[0].slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]);
        expect(weeks[4].filter(Boolean).at(-1)).toBe("2026-10-31");
    });
    it("offers the window's months, oldest first", () => {
        const months = boardMonths(view, TODAY);
        expect(months).toHaveLength(12);
        expect(months[0]).toBe("2025-11");
        expect(months.at(-1)).toBe("2026-10");
    });
});
