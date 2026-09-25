import { describe, expect, it } from "vitest";
import type { LeaseWithDetails } from "@/types/lease";
import type { PropertyIncomeRow } from "@/lib/property-income";
import {
    adjustmentDates,
    attentionItems,
    displayStatus,
    guessUnit,
    hubTotals,
    inView,
    leaseIncome,
    milestones,
    positionPct,
    referenceNameFor,
    summarizeLeases,
    termMonths,
    timelineBounds,
    timelineTicks,
} from "@/lib/lease-dashboard";

const TODAY = "2026-09-25";

function lease(over: Partial<LeaseWithDetails> = {}): LeaseWithDetails {
    return {
        id: over.id ?? "l1",
        user_id: "u1",
        reference_name: null,
        property_id: "p1",
        unit_id: null,
        unit_name: null,
        primary_tenant_id: "t1",
        management_type: "AGENCY",
        agency_id: "a1",
        agent_id: null,
        start_date: "2025-01-06",
        end_date: "2027-07-06",
        monthly_rent: 1300,
        rent_due_day: 6,
        security_deposit: 2600,
        deposit_months: 2,
        adjustment_index: "IPCA",
        adjustment_frequency: 12,
        next_adjustment_date: null,
        status: "ACTIVE",
        termination_date: null,
        termination_reason: null,
        notes: null,
        created_at: "2025-01-06T00:00:00Z",
        updated_at: "2025-01-06T00:00:00Z",
        deleted_at: null,
        document_count: 1,
        property_name: "SANTO ANTONIO",
        primary_tenant_name: "Luiz Otavyo Torres",
        agency_name: "MR Imóveis",
        agent_name: null,
        additional_tenants: [],
        charges: [],
        documents: [],
        ...over,
    };
}

const IPCA = [
    { month: "2026-01", value: 0.5 }, { month: "2026-02", value: 0.4 }, { month: "2026-03", value: 0.3 },
    { month: "2026-04", value: 0.2 }, { month: "2026-05", value: 0.1 }, { month: "2026-06", value: 0.2 },
    { month: "2026-07", value: 0.3 }, { month: "2026-08", value: 0.1 },
];

describe("displayStatus", () => {
    it("keeps the stored status while the term runs", () => {
        expect(displayStatus({ status: "ACTIVE", end_date: "2027-07-06" }, TODAY)).toBe("ACTIVE");
        expect(displayStatus({ status: "ACTIVE", end_date: null }, TODAY)).toBe("ACTIVE");
    });
    it("flags the last 30 days and the term already over", () => {
        expect(displayStatus({ status: "ACTIVE", end_date: "2026-10-20" }, TODAY)).toBe("EXPIRING_SOON");
        expect(displayStatus({ status: "ACTIVE", end_date: "2026-09-24" }, TODAY)).toBe("EXPIRED");
        expect(displayStatus({ status: "EXPIRED", end_date: "2026-01-01" }, TODAY)).toBe("EXPIRED");
    });
    it("leaves closed and draft contracts alone", () => {
        expect(displayStatus({ status: "TERMINATED", end_date: "2027-01-01" }, TODAY)).toBe("TERMINATED");
        expect(displayStatus({ status: "DRAFT", end_date: "2026-01-01" }, TODAY)).toBe("DRAFT");
    });
});

describe("views", () => {
    it("an in-force lease past its term is both vigente and vencendo, never encerrado", () => {
        const row = { status: "EXPIRED" as const, stored: "ACTIVE" as const };
        expect(inView(row, "vigentes")).toBe(true);
        expect(inView(row, "vencendo")).toBe(true);
        expect(inView(row, "encerrados")).toBe(false);
    });
    it("a stored EXPIRED lease is encerrado only", () => {
        const row = { status: "EXPIRED" as const, stored: "EXPIRED" as const };
        expect(inView(row, "vigentes")).toBe(false);
        expect(inView(row, "vencendo")).toBe(false);
        expect(inView(row, "encerrados")).toBe(true);
        expect(inView(row, "todos")).toBe(true);
    });
});

describe("termMonths", () => {
    it("counts whole months, an end the day before the anniversary included", () => {
        expect(termMonths("2025-01-06", "2027-07-06")).toBe(30);
        expect(termMonths("2025-03-01", "2026-02-28")).toBe(12);
        expect(termMonths("2025-03-01", "2026-02-20")).toBe(11);
        expect(termMonths("2025-03-01", null)).toBeNull();
    });
});

describe("summarizeLeases + hubTotals", () => {
    const rows = summarizeLeases(
        [
            lease({ id: "a", monthly_rent: 1300, security_deposit: 2600 }),
            lease({ id: "b", unit_id: "u2", unit_name: "Kitnet 35B", monthly_rent: 1260, security_deposit: null, start_date: "2025-09-15", end_date: "2028-03-15", document_count: 0 }),
            lease({ id: "c", monthly_rent: 1500, start_date: "2024-12-20", end_date: "2026-10-20", adjustment_index: "NONE", security_deposit: null }),
            lease({ id: "d", monthly_rent: 900, start_date: "2024-01-10", end_date: "2025-01-10", security_deposit: 900 }),
            lease({ id: "e", status: "TERMINATED", termination_date: "2026-03-01", monthly_rent: 5000 }),
            lease({ id: "f", status: "DRAFT", monthly_rent: 700 }),
        ],
        { ipca: IPCA },
        TODAY
    );
    const totals = hubTotals(rows, TODAY);

    it("counts what is in force and adds up its rent and deposits", () => {
        expect(totals.total).toBe(6);
        expect(totals.inForce).toBe(4);
        expect(totals.contractedRent).toBe(1300 + 1260 + 1500 + 900);
        expect(totals.deposits).toBe(2600 + 900);
        expect(totals.depositsCount).toBe(2);
        expect(totals.drafts).toBe(1);
        expect(totals.withFile).toBe(5);
        expect(totals.agencyManaged).toBe(4);
    });
    it("finds the first end ahead and the terms already over", () => {
        expect(totals.overdueTerm).toBe(1);           // d ended in January 2025
        expect(totals.ending90).toBe(1);              // c ends 20/10/2026
        expect(totals.nextEnd?.row.lease.id).toBe("c");
        expect(totals.nextEnd?.days).toBe(25);
    });
    it("finds the next adjustment with the index accumulated so far", () => {
        // a: anniversaries on 06/01 → next 06/01/2027; b passed its 15/09 anniversary ten days ago → 15/09/2027;
        // c has no adjustment; d is past its term. Cycle of a: jan–dec 2026, eight months published.
        expect(totals.nextAdjustment?.row.lease.id).toBe("a");
        expect(totals.nextAdjustment?.date).toBe("2027-01-06");
        expect(totals.nextAdjustment?.monthsCounted).toBe(8);
        expect(totals.nextAdjustment?.accumulatedPct).toBeCloseTo(2.12, 1);
        expect(totals.adjustments90).toBe(0);
    });
    it("summarises places, titles and the index label", () => {
        const b = rows.find(r => r.lease.id === "b")!;
        expect(b.place).toBe("SANTO ANTONIO · Kitnet 35B");
        expect(b.title).toBe("SANTO ANTONIO · Kitnet 35B");
        expect(b.indexLabel).toBe("IPCA");
        expect(b.hasFile).toBe(false);
        expect(rows.find(r => r.lease.id === "c")!.indexLabel).toBe("Sem reajuste");
        expect(rows.find(r => r.lease.id === "e")!.status).toBe("TERMINATED");
    });
});

describe("hubTotals next adjustment", () => {
    it("picks the soonest adjustment inside a running term", () => {
        const rows = summarizeLeases(
            [
                lease({ id: "a", start_date: "2025-01-06", end_date: "2027-07-06" }),   // next 06/01/2027
                lease({ id: "b", start_date: "2025-10-15", end_date: "2028-03-15" }),   // next 15/10/2026
                lease({ id: "d", start_date: "2024-01-10", end_date: "2025-01-10" }),   // term over: no next inside it
            ],
            { ipca: IPCA },
            TODAY
        );
        const totals = hubTotals(rows, TODAY);
        expect(totals.nextAdjustment?.row.lease.id).toBe("b");
        expect(totals.nextAdjustment?.date).toBe("2026-10-15");
        expect(totals.nextAdjustment?.days).toBe(20);
        expect(totals.adjustments90).toBe(1);
        // cycle oct/2025 → sep/2026: the months of 2026 published so far
        expect(totals.nextAdjustment?.monthsCounted).toBe(8);
        expect(totals.nextAdjustment?.accumulatedPct).toBeCloseTo(2.12, 1);
    });
});

describe("attentionItems", () => {
    it("lists what needs a decision, most pressing first", () => {
        const rows = summarizeLeases(
            [
                lease({ id: "over", start_date: "2024-01-10", end_date: "2025-01-10" }),
                lease({ id: "ending", start_date: "2024-12-20", end_date: "2026-10-20", adjustment_index: "NONE" }),
                lease({ id: "adjust", start_date: "2025-10-15", end_date: "2028-03-15", document_count: 0 }),
                lease({ id: "draft", status: "DRAFT" }),
                lease({ id: "fine", start_date: "2026-03-01", end_date: "2028-03-01" }),
                lease({ id: "closed", status: "TERMINATED", termination_date: "2026-01-01", document_count: 0 }),
            ],
            { ipca: IPCA },
            TODAY
        );
        const items = attentionItems(rows);
        expect(items.map(i => `${i.kind}:${i.row.lease.id}`)).toEqual([
            "overdue_term:over",
            "ending:ending",
            "adjustment:adjust",
            "draft:draft",
            "no_file:adjust",
        ]);
        expect(items[0].text).toContain("Prazo vencido há");
        expect(items[1].text).toBe("Termina em 25 dias.");
        expect(items[2].text).toContain("Reajuste em 20 dias");
        expect(items[2].text).toContain("IPCA acumulado +2,12%");
    });
});

describe("adjustmentDates + milestones", () => {
    it("lists past anniversaries and the next one inside the term", () => {
        const l = lease({ start_date: "2024-03-10", end_date: "2027-03-10" });
        expect(adjustmentDates(l, TODAY)).toEqual({ past: ["2025-03-10", "2026-03-10"], next: "2027-03-10" });
    });
    it("stops at the end of the term and has no next after it", () => {
        const l = lease({ start_date: "2023-03-10", end_date: "2025-03-10" });
        expect(adjustmentDates(l, TODAY)).toEqual({ past: ["2024-03-10", "2025-03-10"], next: null });
    });
    it("has nothing for a lease without adjustment", () => {
        expect(adjustmentDates(lease({ adjustment_index: "NONE" }), TODAY)).toEqual({ past: [], next: null });
    });
    it("builds the contract's line in date order", () => {
        const l = lease({ start_date: "2025-01-06", end_date: "2027-07-06" });
        expect(milestones(l, TODAY).map(m => `${m.kind}@${m.date}${m.done ? "✓" : ""}`)).toEqual([
            "start@2025-01-06✓",
            "adjustment@2026-01-06✓",
            "next_adjustment@2027-01-06",
            "end@2027-07-06",
        ]);
    });
    it("ends a terminated contract at its termination", () => {
        const l = lease({ start_date: "2025-01-06", end_date: "2027-07-06", status: "TERMINATED", termination_date: "2026-03-01" });
        const line = milestones(l, TODAY);
        expect(line[line.length - 1]).toMatchObject({ kind: "termination", date: "2026-03-01", done: true });
        expect(line.some(m => m.kind === "next_adjustment")).toBe(false);
    });
});

describe("timeline", () => {
    it("spans from the earliest start to six months past the latest end, on month boundaries", () => {
        const rows = summarizeLeases([lease({ start_date: "2025-01-06", end_date: "2027-07-06" }), lease({ id: "x", start_date: "2024-12-20", end_date: "2026-10-20" })], {}, TODAY);
        const bounds = timelineBounds(rows, TODAY);
        expect(bounds).toEqual({ start: "2024-12-01", end: "2028-01-31" });
        expect(positionPct("2024-12-01", bounds)).toBe(0);
        expect(positionPct("2028-01-31", bounds)).toBe(100);
        expect(positionPct("2023-01-01", bounds)).toBe(0);
        expect(positionPct(TODAY, bounds)).toBeGreaterThan(50);
    });
    it("ticks every quarter on a span over two years, January as the year", () => {
        const ticks = timelineTicks({ start: "2024-12-01", end: "2028-01-31" });
        expect(ticks[0]).toEqual({ date: "2025-01-01", label: "2025", major: true });
        expect(ticks[1]).toEqual({ date: "2025-04-01", label: "abr", major: false });
        expect(ticks.filter(t => t.major).map(t => t.label)).toEqual(["2025", "2026", "2027", "2028"]);
        // a short span ticks every month
        expect(timelineTicks({ start: "2026-01-01", end: "2026-12-31" }).map(t => t.label)).toEqual(["2026", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]);
    });
});

describe("leaseIncome", () => {
    const row = (month: string, over: Partial<PropertyIncomeRow> = {}): PropertyIncomeRow => ({
        id: month,
        property_id: "p1",
        month: `${month}-01`,
        received_on: null,
        received_amount: 1170,
        energy_portion: 0,
        other_income: 0,
        other_expenses: 0,
        condo_amount: 0,
        fee_on_condo: false,
        unit_id: null,
        unit_name: null,
        iptu_amount: 0,
        agency_fee_pct: 10,
        status: "CONFIRMED",
        source: "MANUAL",
        bank_reference: null,
        notes: null,
        ...over,
    });

    it("cuts the ledger to the lease's months and reads the gross rent back", () => {
        const l = lease({ start_date: "2026-06-06", end_date: "2028-12-06" });
        const income = leaseIncome(l, [row("2026-05"), row("2026-06"), row("2026-07"), row("2026-08", { status: "EXPECTED" })], TODAY);
        expect(income.points.map(p => p.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
        expect(income.received).toBe(2340);
        expect(income.gross).toBe(2600);
        expect(income.confirmedMonths).toBe(2);
        expect(income.expectedMonths).toBe(1);
        expect(income.missingMonths).toBe(1);   // September has no row yet
        expect(income.currentGross).toBe(1300);
        expect(income.firstMonth).toBe("2026-06");
    });
    it("reads one unit's rows for a unit lease", () => {
        const l = lease({ start_date: "2026-07-01", end_date: null, unit_id: "u2" });
        const income = leaseIncome(l, [row("2026-07", { unit_id: "u1", received_amount: 999 }), row("2026-07", { unit_id: "u2" }), row("2026-08", { unit_id: "u2" })], TODAY);
        expect(income.points).toHaveLength(2);
        expect(income.received).toBe(2340);
    });
    it("adds the units up for a whole-property lease and stops at a closed contract's end", () => {
        const l = lease({ start_date: "2026-01-01", end_date: "2026-02-28", status: "EXPIRED" });
        const income = leaseIncome(l, [row("2026-01", { unit_id: "u1" }), row("2026-01", { unit_id: "u2" }), row("2026-02", { unit_id: "u1" }), row("2026-03", { unit_id: "u1" })], TODAY);
        expect(income.points.map(p => [p.key, p.received])).toEqual([["2026-01", 2340], ["2026-02", 1170]]);
    });
});

describe("guessUnit", () => {
    const units = [{ id: "1", name: "Kitnet 35" }, { id: "2", name: "Kitnet 35A" }, { id: "3", name: "Kitnet 35B" }, { id: "4", name: "Casa 35D" }];
    it("matches the unit named in the contract", () => {
        expect(guessUnit(units, ["Kitnet 35B", null])?.id).toBe("3");
        expect(guessUnit(units, ["Apartamento", "kitnet 35b, fundos"])?.id).toBe("3");
        expect(guessUnit(units, [null, "Casa 35 D"])?.id).toBe("4");   // a scan split "35D"; "35D" beats the bare "35"
        expect(guessUnit(units, ["Unidade 35A"])?.id).toBe("2");
    });
    it("asks when nothing or more than one fits", () => {
        expect(guessUnit(units, ["Loja 7"])).toBeNull();
        expect(guessUnit(units, ["35A ou 35B"])).toBeNull();
        expect(guessUnit(units, [])).toBeNull();
        expect(guessUnit([], ["Kitnet 35B"])).toBeNull();
    });
});

describe("referenceNameFor", () => {
    it("follows the form's convention", () => {
        expect(referenceNameFor("SANTO ANTONIO", "Kitnet 35B", "Pedro Machado", "2025-09-15")).toBe("SANTO ANTONIO · Kitnet 35B - Pedro Machado - 2025");
        expect(referenceNameFor("VALE DO SOL", null, "Danilo Silva", "2025-12-10")).toBe("VALE DO SOL - Danilo Silva - 2025");
    });
});
