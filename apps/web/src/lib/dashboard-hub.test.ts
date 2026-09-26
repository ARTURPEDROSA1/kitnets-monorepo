import { describe, expect, it } from "vitest";
import { dashboardAttention, dashboardTotals, incomeFigures, isEmptyPortfolio, occupancyOf, taxFigures } from "./dashboard-hub";
import type { DashboardIncomeSnapshot, DashboardView } from "./dashboard-views";
import type { InvestmentCardSummary } from "./new-investment-metrics";
import type { NewInvestment } from "./new-investments";
import type { PropertyEntry } from "./property-entries-server";
import type { PropertyTax } from "./property-taxes";
import type { LeaseWithDetails } from "@/types/lease";

const TODAY = "2026-09-25";

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

const tax = (over: Partial<PropertyTax>): PropertyTax => ({ id: "x", property_id: "p1", year: 2026, kind: "IPTU", amount: 0, paid_by: "LANDLORD", paid_on: null, comment: null, installments: [], document_path: null, extracted_at: null, ...over }) as PropertyTax;

const snapshot = (over: Partial<DashboardIncomeSnapshot>): DashboardIncomeSnapshot => ({ propertyId: "p1", month: "2026-09", revenue: 0, grossRent: 0, netRent: 0, received: 0, feeAmount: 0, opex: 0, noi: 0, confirmedMonths: 1, totalFee: 0, fee12m: 0, ...over });

const inv = (id: string, over: Partial<NewInvestment> = {}): NewInvestment => ({ id, name: id, unit_label: null, status: "ACTIVE", promoted_property_id: null, strategy: "NA_PLANTA", developer: null, address: null, city: null, state: null, zip: null, ...over }) as unknown as NewInvestment;
const summary = (id: string, over: Partial<InvestmentCardSummary> = {}): InvestmentCardSummary => ({ id, paidToDate: 0, committed: 0, paidPct: 0, remaining: 0, nextDueOn: null, nextDueAmount: 0, overdueCount: 0, monthsToKeys: null, keysOn: null, netYieldPct: null, documents: 0, coverUrl: null, photoUrls: [], saleNet: null, realizedGain: null, ...over });

const leases = [
    lease("l1"),
    lease("l2", { unit_id: "u2", unit_name: "Kitnet 35A", status: "EXPIRING_SOON", end_date: "2026-10-05", primary_tenant_id: "t2", primary_tenant_name: "João", monthly_rent: 1200 }),
    lease("l3", { property_id: "p2", unit_id: null, unit_name: null, property_name: "Casa X", primary_tenant_id: "t3", primary_tenant_name: "Ana", monthly_rent: 2000, security_deposit: 0 }),
    lease("l4", { unit_id: "u3", status: "EXPIRED", end_date: "2025-12-31", primary_tenant_id: "t9" }),
];

const view: DashboardView = {
    profile: { fullName: "Artur", email: "x@y" },
    properties: [entry({}), entry({ id: "p2", key: "p2", index: 1, name: "Casa X", propertyType: "single", units: 1, unitIds: [], hasSolar: false }), entry({ id: null, key: "profile:2", index: 2, name: "Rascunho", propertyType: "single", units: 1, unitIds: [], hasSolar: false, isSaved: false })],
    income: [
        snapshot({ propertyId: "p1", month: "2026-09", revenue: 3000, grossRent: 2800, netRent: 2500, received: 2600, feeAmount: 300, opex: 500, noi: 2500, confirmedMonths: 9, totalFee: 2700, fee12m: 2700 }),
        snapshot({ propertyId: "p2", month: "2026-08", revenue: 1500, grossRent: 1500, netRent: 1500, received: 1500, opex: 300, noi: 1200, totalFee: 0 }),
    ],
    leases,
    tenants: {
        tenants: [
            { id: "t1", full_name: "Maria", status: "ACTIVE", main_phone: "+5531999990000", date_of_birth: null, move_in_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
            { id: "t2", full_name: "João", status: "ACTIVE", main_phone: null, date_of_birth: null, move_in_date: "2025-10-01", created_at: "2025-10-01T00:00:00Z" },
            { id: "t3", full_name: "Ana", status: "ACTIVE", main_phone: "+5531999990001", date_of_birth: null, move_in_date: null, created_at: "2026-02-01T00:00:00Z" },
            { id: "t9", full_name: "Antigo", status: "FORMER", main_phone: null, date_of_birth: null, move_in_date: null, created_at: "2025-01-01T00:00:00Z" },
        ] as unknown as DashboardView["tenants"] extends infer T ? T extends { tenants: infer U } ? U : never : never,
        leases: [
            { id: "l1", tenant_id: "t1", role: "PRIMARY", status: "ACTIVE", start_date: "2026-01-01", end_date: "2026-12-31", termination_date: null, monthly_rent: 1000, property_id: "p1", property_name: "Santo Antonio", unit_id: "u1", unit_name: "Kitnet 35", reference_name: null, rent_due_day: 5, security_deposit: 1000, adjustment_index: "IPCA", management_type: "SELF_MANAGED", agency_name: null, document_count: 1 },
            { id: "l1", tenant_id: "t4", role: "OCCUPANT", status: "ACTIVE", start_date: "2026-01-01", end_date: "2026-12-31", termination_date: null, monthly_rent: 1000, property_id: "p1", property_name: "Santo Antonio", unit_id: "u1", unit_name: "Kitnet 35", reference_name: null, rent_due_day: 5, security_deposit: 1000, adjustment_index: "IPCA", management_type: "SELF_MANAGED", agency_name: null, document_count: 1 },
            { id: "l2", tenant_id: "t2", role: "PRIMARY", status: "EXPIRING_SOON", start_date: "2025-10-01", end_date: "2026-10-05", termination_date: null, monthly_rent: 1200, property_id: "p1", property_name: "Santo Antonio", unit_id: "u2", unit_name: "Kitnet 35A", reference_name: null, rent_due_day: 5, security_deposit: 1000, adjustment_index: "IPCA", management_type: "SELF_MANAGED", agency_name: null, document_count: 1 },
            { id: "l3", tenant_id: "t3", role: "PRIMARY", status: "ACTIVE", start_date: "2026-02-01", end_date: "2027-01-31", termination_date: null, monthly_rent: 2000, property_id: "p2", property_name: "Casa X", unit_id: null, unit_name: null, reference_name: null, rent_due_day: 5, security_deposit: 0, adjustment_index: "IPCA", management_type: "SELF_MANAGED", agency_name: null, document_count: 1 },
            { id: "l4", tenant_id: "t9", role: "PRIMARY", status: "EXPIRED", start_date: "2025-01-01", end_date: "2025-12-31", termination_date: null, monthly_rent: 900, property_id: "p1", property_name: "Santo Antonio", unit_id: "u3", unit_name: "Kitnet 35B", reference_name: null, rent_due_day: 5, security_deposit: 0, adjustment_index: "IPCA", management_type: "SELF_MANAGED", agency_name: null, document_count: 0 },
        ],
    },
    agents: {
        agents: [
            { id: "a1", full_name: "Carlos", status: "ACTIVE", agent_type: "AUTONOMO", agency_id: null, agency_name: null, main_phone: "+5531999990002", email: null, creci_number: "1234", creci_state: "MG", created_at: "2025-06-01T00:00:00Z" },
            { id: "a2", full_name: "Bia", status: "ACTIVE", agent_type: "IMOBILIARIA", agency_id: "g1", agency_name: "Imob", main_phone: null, email: "b@x", creci_number: "5678", creci_state: "MG", created_at: "2025-06-01T00:00:00Z" },
            { id: "a3", full_name: "Zé", status: "INACTIVE", agent_type: "AUTONOMO", agency_id: null, agency_name: null, main_phone: null, email: null, creci_number: "9", creci_state: "MG", created_at: "2025-06-01T00:00:00Z" },
        ] as unknown as NonNullable<DashboardView["agents"]>["agents"],
        leases: [{ id: "l3", agent_id: "a1", status: "ACTIVE", monthly_rent: 2000, start_date: "2026-02-01", end_date: "2027-01-31", termination_date: null, property_id: "p2", property_name: "Casa X", unit_name: null, reference_name: null, primary_tenant_id: "t3", primary_tenant_name: "Ana", agency_name: null }],
        tenants: [],
    },
    agencies: {
        agencies: [{ id: "g1", name: "Imob Ltda", trade_name: "Imob", status: "ACTIVE", management_fee: 10, created_at: "2025-01-01T00:00:00Z", role: "OWNER", city: "Itabirito", state: "MG", main_phone: "+5531999990003", email: "i@x", cnpj: "12345678000199", creci_number: "1", creci_state: "MG", creci_type: "PJ", service_agreement_url: null, service_agreement_filename: null, agreement_start_date: null, agreement_end_date: null }] as unknown as NonNullable<DashboardView["agencies"]>["agencies"],
        leases: [{ id: "l2", agency_id: "g1", status: "EXPIRING_SOON", monthly_rent: 1200, start_date: "2025-10-01", end_date: "2026-10-05", termination_date: null, property_id: "p1", property_name: "Santo Antonio", unit_name: "Kitnet 35A", reference_name: null, primary_tenant_id: "t2", primary_tenant_name: "João", agent_id: null, agent_name: null }],
        tenants: [],
        agents: [],
    },
    energy: null,
    water: null,
    condominiums: null,
    projects: {
        investments: [inv("i1"), inv("i2", { status: "SOLD" })],
        summaries: { i1: summary("i1", { paidToDate: 100_000, committed: 300_000, remaining: 200_000, overdueCount: 2 }), i2: summary("i2", { paidToDate: 80_000, committed: 80_000, saleNet: 120_000, realizedGain: 40_000 }) },
    },
    taxes: [
        tax({ id: "x1", amount: 1200, paid_on: "2026-02-10" }),
        tax({ id: "x2", property_id: "p2", amount: 900, paid_by: "TENANT", paid_on: "2026-03-01" }),
        tax({ id: "x3", year: 2025, kind: "ITBI", amount: 5000, paid_on: "2025-06-01" }),
        tax({ id: "x4", property_id: "p2", kind: "OUTRO", amount: 300, paid_on: "2026-04-01" }),
    ],
    gateways: null,
    map: { pins: [], pending: 0 },
    failed: [],
};

describe("occupancyOf", () => {
    it("counts the units with a contract in force", () => {
        expect(occupancyOf(view.properties, leases)).toEqual({ units: 5, occupied: 3, pct: 60, propertiesWithLease: 2 });
    });
    it("counts a whole-building lease as one unit and ignores properties without a row", () => {
        const only = [entry({ units: 4, unitIds: ["u1", "u2", "u3", "u4"] }), entry({ id: null, key: "profile:1", index: 1 })];
        expect(occupancyOf(only, [lease("w", { unit_id: null })])).toMatchObject({ units: 7, occupied: 1 });
        expect(occupancyOf(only, [])).toMatchObject({ occupied: 0, pct: 0 });
    });
    it("counts every lease without a unit, alongside the named units, never above the units", () => {
        const building = [entry({})];   // 3 units
        const unitless = (id: string) => lease(id, { unit_id: null });
        expect(occupancyOf(building, [unitless("a"), unitless("b"), unitless("c")])).toMatchObject({ occupied: 3, pct: 100 });
        expect(occupancyOf(building, [lease("n"), unitless("b")])).toMatchObject({ occupied: 2 });
        expect(occupancyOf(building, [lease("n"), lease("n2"), unitless("b"), unitless("c"), unitless("d")])).toMatchObject({ occupied: 3 });
    });
});

describe("incomeFigures / taxFigures", () => {
    it("adds the latest months and keeps the newest month", () => {
        expect(incomeFigures(view.income)).toMatchObject({ month: "2026-09", withLedger: 2, revenue: 4500, noi: 3700, feeMonth: 300, feeAllTime: 2700, margin: 82.2 });
        expect(incomeFigures([])).toMatchObject({ month: null, withLedger: 0, revenue: 0, margin: null });
    });
    it("sums the owner's taxes of the year in the month paid", () => {
        expect(taxFigures(view.taxes ?? [], TODAY)).toEqual({ year: 2026, iptuLandlordYtd: 1200, iptuTenantYtd: 900, itbiOtherYtd: 300, iptuLandlordAllTime: 1200, itbiAllTime: 5000, otherAllTime: 300, propertiesWithIptu: 2 });
    });
    it("stops at this month: undated parcelas still ahead are not paid yet", () => {
        const parcelas = Array.from({ length: 6 }, (_, i) => ({ seq: i + 1, amount: 200, paid_by: "LANDLORD" as const, paid_on: null }));
        const rows = [tax({ id: "p6", amount: 1200, installments: parcelas }), tax({ id: "ahead", kind: "OUTRO", amount: 500, paid_on: "2026-11-10" })];
        expect(taxFigures(rows, "2026-02-01")).toMatchObject({ iptuLandlordYtd: 400, itbiOtherYtd: 0, iptuLandlordAllTime: 1200 });
        expect(taxFigures(rows, "2026-12-15")).toMatchObject({ iptuLandlordYtd: 1200, itbiOtherYtd: 500 });
    });
});

describe("dashboardTotals", () => {
    it("reads every module the way its hub does", () => {
        const t = dashboardTotals(view, TODAY);
        expect(t.properties).toEqual({ count: 3, single: 2, multi: 1, solar: 1, unlinked: 1 });
        expect(t.occupancy.pct).toBe(60);
        expect(t.contracts).toMatchObject({ inForce: 3, contractedRent: 4200, deposits: 2000, depositsCount: 2 });
        expect(t.contracts.nextEnd?.date).toBe("2026-10-05");
        expect(t.people.housed).toBe(4);   // Maria, João, Ana and the occupant
        expect(t.people.tenants).toMatchObject({ active: 3, former: 1, withoutPhone: 1 });
        expect(t.jobs.agents).toMatchObject({ active: 2, inactive: 1, idle: 1, leasesInForce: 1 });
        expect(t.jobs.agencies).toMatchObject({ active: 1, leasesInForce: 1, monthlyFees: 120 });
        expect(t.jobs.agenciesWithLeases).toBe(1);
        // the hub's slices: the money of the projects in progress, the realized gain of the sold ones
        expect(t.projects?.all).toMatchObject({ count: 2, active: 1, sold: 1 });
        expect(t.projects?.inProgress).toMatchObject({ count: 1, paid: 100_000, committed: 300_000, remaining: 200_000, paidPct: 33.3, overdue: 2 });
        expect(t.projects?.sold).toMatchObject({ count: 1, realizedGain: 40_000, saleNet: 120_000 });
        expect(t.energy).toBeNull();
        expect(t.taxes?.iptuLandlordYtd).toBe(1200);
    });
});

describe("dashboardAttention", () => {
    it("merges the modules, worst first", () => {
        const items = dashboardAttention(view, TODAY);
        expect(items[0]).toMatchObject({ module: "projetos", tone: "rose", name: "i1", text: "2 parcelas em atraso", href: "/projetos?id=i1" });
        expect(items.slice(1, 3).map(i => `${i.module}:${i.tone}`)).toEqual(["contratos:amber", "inquilinos:amber"]);
        expect(items.find(i => i.module === "contratos")?.href).toBe("/contratos?id=l2");
        const tones = items.map(i => i.tone);
        expect(tones.indexOf("slate")).toBeGreaterThan(tones.lastIndexOf("amber"));
        expect(items.some(i => i.module === "corretores" && i.tone === "slate" && i.name === "Bia")).toBe(true);
    });
});

describe("isEmptyPortfolio", () => {
    it("is true only with nothing registered", () => {
        expect(isEmptyPortfolio(view)).toBe(false);
        expect(isEmptyPortfolio({ ...view, properties: [], leases: [], projects: null, tenants: null })).toBe(true);
    });
});
