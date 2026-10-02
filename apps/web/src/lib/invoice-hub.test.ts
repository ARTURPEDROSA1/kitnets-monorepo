import { describe, expect, it } from "vitest";
import { leaseComponents } from "./invoice-collection";
import { inInvoiceView, invoiceAttention, invoiceDisplay, invoiceHubTotals, invoiceRows, invoiceViewFromParam, recurringRows, settingsPending } from "./invoice-hub";
import type { BillingSettingsView, InvoiceView, RecurringLease } from "./invoice-views";

const TODAY = "2026-10-15";
const UNDECIDED: BillingSettingsView = { days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null };
const DECIDED: BillingSettingsView = { days_in_advance: 10, fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 30 };

function invoice(over: Partial<InvoiceView> = {}): InvoiceView {
    return {
        id: "i1", number: 1, lease_id: "l1", property_id: "p1", unit_id: "u1", unit_name: "Kitnet 35C", tenant_id: "t1",
        reference_month: "2026-10-01", due_date: "2026-10-20", amount: 150, status: "DRAFT", origin: "MANUAL", blockers: [],
        payer_name: "Ana Souza", payer_email: "ana@example.com", issued_at: null, paid_on: null, paid_amount: null, late_fee_amount: 0, surcharge_amount: 0, paid_via: null,
        cancelled_at: null, cancel_reason: null, notes: null, created_at: "2026-10-01T12:00:00Z",
        property_name: "SANTO ANTONIO", tenant_name: "Ana Souza", lease_reference: "SANTO ANTONIO · Kitnet 35C - Ana - 2026",
        items: [{ id: "it1", kind: "CONDOMINIUM", description: "Condomínio", amount: 150, position: 0 }],
        ...over,
    };
}

function recurring(over: Partial<RecurringLease> = {}): RecurringLease {
    return {
        lease_id: "l1", title: "SANTO ANTONIO · Kitnet 35C", place: "SANTO ANTONIO · Kitnet 35C", property_id: "p1", tenant_name: "Ana Souza", tenant_email: "ana@example.com",
        management_type: "AGENCY", manager_name: "Imobiliária X", status: "ACTIVE", start_date: "2026-01-10", termination_date: null, due_day: 20, paused: false,
        components: leaseComponents({ management_type: "AGENCY", monthly_rent: 1000, charges: [{ id: "c1", charge_type: "CONDOMINIUM", label: null, responsibility: "TENANT", amount: 150, collected_by: "OWNER" }] }),
        ...over,
    };
}

describe("invoiceDisplay", () => {
    it("reads the lateness from the due date, never from a stored flag", () => {
        expect(invoiceDisplay(invoice(), TODAY)).toBe("a_emitir");
        expect(invoiceDisplay(invoice({ status: "ISSUED" }), TODAY)).toBe("emitida");
        expect(invoiceDisplay(invoice({ due_date: "2026-10-15" }), TODAY)).toBe("a_emitir");
        expect(invoiceDisplay(invoice({ due_date: "2026-10-14" }), TODAY)).toBe("em_atraso");
        expect(invoiceDisplay(invoice({ status: "PAID", due_date: "2026-10-01" }), TODAY)).toBe("paga");
        expect(invoiceDisplay(invoice({ status: "CANCELLED", due_date: "2026-10-01" }), TODAY)).toBe("cancelada");
    });
});

describe("invoiceRows", () => {
    it("summarises an invoice for the table", () => {
        const [row] = invoiceRows([invoice({ due_date: "2026-10-10", items: [{ id: "a", kind: "RENT", description: "Aluguel", amount: 1000, position: 0 }, { id: "b", kind: "CONDOMINIUM", description: "Condomínio", amount: 150, position: 1 }] })], TODAY);
        expect(row).toMatchObject({ display: "em_atraso", place: "SANTO ANTONIO · Kitnet 35C", itemsLabel: "Aluguel + Condomínio", daysLate: 5, daysToDue: null, month: "2026-10" });
        expect(row.haystack).toContain("fatura 1");
        expect(row.haystack).toContain("ana souza");
    });

    it("counts down to the due date only while unpaid", () => {
        expect(invoiceRows([invoice()], TODAY)[0]).toMatchObject({ daysLate: 0, daysToDue: 5 });
        expect(invoiceRows([invoice({ status: "PAID", paid_on: "2026-10-12", paid_amount: 150, paid_via: "MANUAL" })], TODAY)[0]).toMatchObject({ daysLate: 0, daysToDue: null });
    });

    it("files rows under the views", () => {
        const rows = invoiceRows([invoice(), invoice({ id: "i2", due_date: "2026-10-01" }), invoice({ id: "i3", status: "PAID", paid_on: "2026-10-05", paid_amount: 150, paid_via: "PIX" }), invoice({ id: "i4", status: "CANCELLED" })], TODAY);
        const count = (view: Parameters<typeof inInvoiceView>[1]) => rows.filter(r => inInvoiceView(r, view)).length;
        expect([count("abertas"), count("atraso"), count("pagas"), count("todas")]).toEqual([2, 1, 1, 4]);
        expect(invoiceViewFromParam("pagas")).toBe("pagas");
        expect(invoiceViewFromParam("nope")).toBe("abertas");
    });
});

describe("recurringRows", () => {
    it("knows what the owner collects and whether the month is invoiced", () => {
        const [pending] = recurringRows([recurring()], [], TODAY);
        expect(pending).toMatchObject({ monthly: 150, undecided: 0, dueThisMonth: "2026-10-20", chargedThisMonth: true, invoicedThisMonth: false });
        expect(recurringRows([recurring()], [invoice()], TODAY)[0].invoicedThisMonth).toBe(true);
        // a cancelled invoice frees the month
        expect(recurringRows([recurring()], [invoice({ status: "CANCELLED" })], TODAY)[0].invoicedThisMonth).toBe(false);
    });

    it("a paused lease, or one that starts after the due date, is not charged this month", () => {
        expect(recurringRows([recurring({ paused: true })], [], TODAY)[0].chargedThisMonth).toBe(false);
        expect(recurringRows([recurring({ start_date: "2026-10-25" })], [], TODAY)[0].chargedThisMonth).toBe(false);
    });

    it("flags a corretor's lease as undecided", () => {
        const row = recurringRows([recurring({ management_type: "AGENT", components: leaseComponents({ management_type: "AGENT", monthly_rent: 1000 }) })], [], TODAY)[0];
        expect(row).toMatchObject({ monthly: 0, undecided: 1, chargedThisMonth: false });
    });
});

describe("invoiceHubTotals", () => {
    it("adds up the month", () => {
        const invoices = [
            invoice({ id: "a", amount: 150 }),
            invoice({ id: "b", amount: 1150, due_date: "2026-10-05", blockers: ["NO_EMAIL"] }),
            invoice({ id: "c", amount: 150, status: "PAID", paid_on: "2026-10-03", paid_amount: 165, late_fee_amount: 15, paid_via: "MANUAL", reference_month: "2026-09-01", due_date: "2026-09-20" }),
            invoice({ id: "d", amount: 150, status: "PAID", paid_on: "2026-09-18", paid_amount: 150, paid_via: "PIX", reference_month: "2026-09-01", due_date: "2026-09-20" }),
            invoice({ id: "e", amount: 999, status: "CANCELLED" }),
        ];
        const rec = recurringRows([recurring(), recurring({ lease_id: "l2", components: leaseComponents({ management_type: "AGENCY", monthly_rent: 900 }) })], invoices, TODAY);
        expect(invoiceHubTotals(invoiceRows(invoices, TODAY), rec, TODAY)).toEqual({
            dueThisMonth: { count: 2, amount: 1300 },
            receivedThisMonth: { count: 1, amount: 165 },
            overdue: { count: 1, amount: 1150 },
            recurring: { leases: 1, monthly: 150 },
            toGenerate: 0,
            blocked: 1,
        });
    });
});

describe("invoiceAttention", () => {
    it("orders late money, then blocked invoices, then what is to do and to decide", () => {
        const invoices = [invoice({ id: "late", number: 7, due_date: "2026-10-05" }), invoice({ id: "blocked", number: 8, lease_id: "l9", blockers: ["NO_EMAIL"] })];
        const rec = recurringRows([
            recurring({ lease_id: "l2", title: "Casa B" }),
            recurring({ lease_id: "l3", title: "Casa C", management_type: "AGENT", components: leaseComponents({ management_type: "AGENT", monthly_rent: 900 }) }),
        ], invoices, TODAY);
        const items = invoiceAttention(invoiceRows(invoices, TODAY), rec, UNDECIDED, TODAY);
        expect(items.map(i => i.kind)).toEqual(["overdue", "blocked", "to_generate", "undecided", "settings"]);
        expect(items[0]).toMatchObject({ tone: "rose", subject: "Fatura nº 7 · SANTO ANTONIO · Kitnet 35C", target: { type: "invoice", id: "late" } });
        expect(items[0].text).toContain("vencida há 10 dias");
        expect(items[1].text).toBe("não pode ser emitida: inquilino sem e-mail");
        expect(items[2].text).toContain("fatura de outubro de 2026 ainda não gerada");
        expect(items[4].text).toContain("multa por atraso");
    });

    it("is silent when everything is in order", () => {
        const invoices = [invoice()];
        expect(invoiceAttention(invoiceRows(invoices, TODAY), recurringRows([recurring()], invoices, TODAY), DECIDED, TODAY)).toEqual([]);
    });

    it("does not nag about settings while the owner collects nothing", () => {
        const rec = recurringRows([recurring({ components: leaseComponents({ management_type: "AGENCY", monthly_rent: 900 }) })], [], TODAY);
        expect(invoiceAttention([], rec, UNDECIDED, TODAY)).toEqual([]);
        expect(settingsPending(UNDECIDED)).toHaveLength(4);
        expect(settingsPending(DECIDED)).toEqual([]);
    });
});
