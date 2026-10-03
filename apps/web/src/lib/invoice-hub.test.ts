import { describe, expect, it } from "vitest";
import { leaseComponents } from "./invoice-collection";
import { deliveryState, deliveryStuck, inInvoiceView, invoiceAttention, invoiceDisplay, invoiceHubTotals, invoiceRows, invoiceViewFromParam, recurringRows, settingsPending } from "./invoice-hub";
import type { BillingSettingsView, InvoiceDeliveryView, InvoiceView, RecurringLease } from "./invoice-views";

const TODAY = "2026-10-15";
const UNDECIDED: BillingSettingsView = { days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null, sender_name: null, reply_to_email: null, automation_enabled: false, automation_from_month: null };
const DECIDED: BillingSettingsView = { days_in_advance: 10, fine_pct: 10, interest_pct_month: 1, days_payable_after_due: 30, sender_name: null, reply_to_email: null, automation_enabled: true, automation_from_month: "2026-10" };

const delivery = (status: InvoiceDeliveryView["status"], over: Partial<InvoiceDeliveryView> = {}): InvoiceDeliveryView => ({
    id: "d1", kind: "ISSUE", status, recipient: "ana@example.com", attempts: 1, sent_at: status === "SENT" ? "2026-10-10T11:00:00Z" : null, last_error: null, created_at: "2026-10-10T11:00:00Z", ...over,
});

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
        // issued but with no boleto alive (it was cancelled at the bank, or failed): to be issued again
        expect(invoiceDisplay(invoice({ status: "ISSUED" }), TODAY)).toBe("a_emitir");
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

    it("puts a failing bank connection right after the late money, and a missing one before the decisions", () => {
        const invoices = [invoice({ id: "late", due_date: "2026-10-05" })];
        const rec = recurringRows([recurring()], invoices, TODAY);
        const failing = { available: true, sandboxAllowed: false, inter: { status: "ERROR" as const, environment: "PRODUCTION" as const, account: null, clientIdTail: "…1234", certificateSubject: null, certificateExpiresAt: null, scopes: [], configuredAt: null, lastCheckedAt: "2026-10-02T10:00:00.000Z", lastError: "O Banco Inter recusou o certificado.", usable: false } };
        const withFailing = invoiceAttention(invoiceRows(invoices, TODAY), rec, UNDECIDED, TODAY, failing);
        expect(withFailing.map(i => i.kind)).toEqual(["overdue", "connection", "settings"]);
        expect(withFailing[1]).toMatchObject({ subject: "Banco Inter", tone: "rose", target: { type: "connections" } });
        const missing = invoiceAttention(invoiceRows(invoices, TODAY), rec, UNDECIDED, TODAY, { available: true, sandboxAllowed: false, inter: null });
        expect(missing.map(i => i.kind)).toEqual(["overdue", "connection", "settings"]);
        expect(missing[1].tone).toBe("slate");
    });

    it("reads the boleto: issued while it lives, expired when it stopped taking payment, to issue again after a failure", () => {
        const charge = (status: "REQUESTED" | "OPEN" | "PAID" | "CANCELLED" | "EXPIRED" | "FAILED", last_error: string | null = null) => ({ id: "c1", kind: "BOLEPIX" as const, status, amount: 150, surcharge_amount: null, expires_at: null, provider_status: null, due_date: "2026-10-20", digitable_line: null, barcode: null, pix_copy_paste: null, has_pdf: false, paid_via: null, paid_amount: null, last_checked_at: null, last_error, created_at: "2026-10-01T12:00:00Z" });
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("OPEN") }), TODAY)).toBe("emitida");
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("REQUESTED") }), TODAY)).toBe("emitida");
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("EXPIRED"), due_date: "2026-09-20" }), TODAY)).toBe("expirada");
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("CANCELLED") }), TODAY)).toBe("a_emitir");
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("FAILED", "O Banco Inter recusou os dados") }), TODAY)).toBe("a_emitir");
        expect(invoiceDisplay(invoice({ status: "ISSUED", charge: charge("OPEN"), due_date: "2026-10-01" }), TODAY)).toBe("em_atraso");
        const rows = invoiceRows([invoice({ id: "x", status: "ISSUED", charge: charge("EXPIRED"), due_date: "2026-09-20" }), invoice({ id: "f", number: 2, charge: charge("FAILED", "CEP inválido") })], TODAY);
        const items = invoiceAttention(rows, [], DECIDED, TODAY);
        expect(items.map(i => i.kind)).toEqual(["expired", "issue_failed"]);
        expect(items[1].text).toBe("a emissão no banco falhou: CEP inválido");
    });

    it("is silent when everything is in order", () => {
        const invoices = [invoice()];
        expect(invoiceAttention(invoiceRows(invoices, TODAY), recurringRows([recurring()], invoices, TODAY), DECIDED, TODAY)).toEqual([]);
    });

    it("does not nag about settings while the owner collects nothing", () => {
        const rec = recurringRows([recurring({ components: leaseComponents({ management_type: "AGENCY", monthly_rent: 900 }) })], [], TODAY);
        expect(invoiceAttention([], rec, UNDECIDED, TODAY)).toEqual([]);
        expect(settingsPending(UNDECIDED)).toHaveLength(5);
        expect(settingsPending(DECIDED)).toEqual([]);
    });

    it("says the automation is off once everything is decided", () => {
        const invoices = [invoice()];
        const rec = recurringRows([recurring()], invoices, TODAY);
        const items = invoiceAttention(invoiceRows(invoices, TODAY), rec, { ...DECIDED, automation_enabled: false }, TODAY);
        expect(items.map(i => i.kind)).toEqual(["settings"]);
        expect(items[0].text).toContain("emissão automática desligada");
        // nothing collected by the owner: nothing to automate, nothing to say
        expect(invoiceAttention([], recurringRows([recurring({ components: leaseComponents({ management_type: "AGENCY", monthly_rent: 900 }) })], [], TODAY), { ...DECIDED, automation_enabled: false }, TODAY)).toEqual([]);
    });

    it("reports an e-mail that did not reach the tenant", () => {
        const now = Date.parse(`${TODAY}T23:59:59-03:00`);
        expect(deliveryStuck(invoice({ delivery: delivery("SENT") }), now)).toBe(false);
        expect(deliveryStuck(invoice({ delivery: delivery("FAILED", { last_error: "o inquilino não tem e-mail cadastrado" }) }), now)).toBe(true);
        expect(deliveryStuck(invoice({ delivery: delivery("SENDING") }), now)).toBe(true);                 // days ago
        expect(deliveryStuck(invoice({ delivery: delivery("SENDING", { created_at: new Date(now - 60_000).toISOString() }) }), now)).toBe(false);
        expect(deliveryStuck(invoice(), now)).toBe(false);

        const failed = invoice({ status: "ISSUED", delivery: delivery("FAILED", { last_error: "o inquilino não tem e-mail cadastrado" }) });
        const items = invoiceAttention(invoiceRows([failed], TODAY), [], DECIDED, TODAY);
        expect(items.map(i => i.kind)).toEqual(["email_failed"]);
        expect(items[0].text).toBe("o e-mail ao inquilino não foi enviado: o inquilino não tem e-mail cadastrado");
        // a paid invoice's old failure is history
        expect(invoiceAttention(invoiceRows([{ ...failed, status: "PAID", paid_on: TODAY }], TODAY), [], DECIDED, TODAY)).toEqual([]);
    });
});

describe("deliveryState", () => {
    const sent = (over: Partial<InvoiceDeliveryView> = {}): InvoiceDeliveryView => ({ id: "d1", kind: "ISSUE", status: "SENT", recipient: "ana@example.com", attempts: 1, sent_at: "2026-10-10T11:00:00Z", delivered_at: null, last_error: null, created_at: "2026-10-10T11:00:00Z", ...over });

    it("says the furthest thing known", () => {
        expect(deliveryState({ delivery: null, first_viewed_at: null })).toBe("nenhum");
        expect(deliveryState({ delivery: sent({ status: "PENDING", sent_at: null }), first_viewed_at: null })).toBe("enviando");
        expect(deliveryState({ delivery: sent(), first_viewed_at: null })).toBe("enviado");
        expect(deliveryState({ delivery: sent({ delivered_at: "2026-10-10T11:00:20Z" }), first_viewed_at: null })).toBe("entregue");
        expect(deliveryState({ delivery: sent({ status: "FAILED", sent_at: null, last_error: "x" }), first_viewed_at: null })).toBe("falhou");
        expect(deliveryState({ delivery: sent({ status: "BOUNCED", last_error: "caixa inexistente" }), first_viewed_at: null })).toBe("devolvido");
    });

    it("an opened page beats everything: the tenant saw it, however the link got there", () => {
        expect(deliveryState({ delivery: sent(), first_viewed_at: "2026-10-11T09:00:00Z" })).toBe("visualizada");
        expect(deliveryState({ delivery: null, first_viewed_at: "2026-10-11T09:00:00Z" })).toBe("visualizada");
        expect(deliveryState({ delivery: sent({ status: "BOUNCED" }), first_viewed_at: "2026-10-11T09:00:00Z" })).toBe("visualizada");
    });

    it("a bounce asks for the address to be checked", () => {
        const bounced = invoice({ status: "ISSUED", delivery: sent({ status: "BOUNCED", last_error: "o provedor do inquilino devolveu a mensagem: mailbox does not exist" }) });
        const items = invoiceAttention(invoiceRows([bounced], TODAY), [], DECIDED, TODAY);
        expect(items.map(i => i.kind)).toEqual(["email_failed"]);
        expect(items[0].text).toContain("voltou");
        expect(items[0].text).toContain("confira o e-mail no cadastro");
    });
});
