import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/api-route";
import { billingSettingsSchema, collectionUpdateSchema, invoiceCancelSchema, invoiceGenerateSchema, invoicePaySchema } from "./invoice";

const LEASE = "0b0c7b1e-5a0e-4c57-9d6a-2f1f3f0f8a11";
const CHARGE = "7d3a1c52-93b4-4a6e-8f0d-5c2b9e4a7f33";

const errorsOf = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? {} : fieldErrors(parsed.error as Parameters<typeof fieldErrors>[0]);
};

describe("invoiceGenerateSchema", () => {
    it("takes a month and an optional lease", () => {
        expect(invoiceGenerateSchema.parse({ month: "2026-10" })).toEqual({ month: "2026-10", lease_id: null });
        expect(invoiceGenerateSchema.parse({ month: " 2026-10 ", lease_id: LEASE })).toEqual({ month: "2026-10", lease_id: LEASE });
    });

    it("refuses a malformed month or lease", () => {
        expect(errorsOf(invoiceGenerateSchema, { month: "2026-13" })).toEqual({ month: "Mês inválido." });
        expect(errorsOf(invoiceGenerateSchema, {})).toEqual({ month: "Informe o mês." });
        expect(errorsOf(invoiceGenerateSchema, { month: "2026-10", lease_id: "abc" })).toEqual({ lease_id: "Contrato inválido." });
    });
});

describe("invoicePaySchema", () => {
    it("reads the amount as typed; blank means the invoice's amount", () => {
        expect(invoicePaySchema.parse({ paid_on: "2026-10-09", paid_amount: "1.150,50", notes: " PIX na conta " })).toEqual({ paid_on: "2026-10-09", paid_amount: 1150.5, notes: "PIX na conta" });
        expect(invoicePaySchema.parse({ paid_on: "2026-10-09", paid_amount: "" })).toEqual({ paid_on: "2026-10-09", paid_amount: null, notes: null });
    });

    it("needs a date and a positive amount", () => {
        expect(errorsOf(invoicePaySchema, { paid_amount: "10" })).toEqual({ paid_on: "Informe a data do pagamento." });
        expect(errorsOf(invoicePaySchema, { paid_on: "09/10/2026" })).toEqual({ paid_on: "Data do pagamento inválida." });
        expect(errorsOf(invoicePaySchema, { paid_on: "2026-10-09", paid_amount: "0,00" })).toEqual({ paid_amount: "O valor recebido deve ser maior que zero." });
    });
});

describe("invoiceCancelSchema", () => {
    it("the reason is optional", () => {
        expect(invoiceCancelSchema.parse({})).toEqual({ reason: null });
        expect(invoiceCancelSchema.parse({ reason: " valor errado " })).toEqual({ reason: "valor errado" });
    });
});

describe("collectionUpdateSchema", () => {
    it("answers who collects the rent or a charge, or clears the answer", () => {
        expect(collectionUpdateSchema.parse({ lease_id: LEASE, component: "rent", collected_by: "OWNER" })).toMatchObject({ component: "rent", collected_by: "OWNER" });
        expect(collectionUpdateSchema.parse({ lease_id: LEASE, component: CHARGE, collected_by: null })).toMatchObject({ component: CHARGE, collected_by: null });
    });

    it("pauses a lease", () => {
        expect(collectionUpdateSchema.parse({ lease_id: LEASE, paused: true })).toMatchObject({ lease_id: LEASE, component: null, paused: true });
    });

    it("refuses junk and an empty change", () => {
        expect(errorsOf(collectionUpdateSchema, { lease_id: LEASE, component: "rent", collected_by: "SOMEONE" })).toEqual({ collected_by: "Emissor inválido." });
        expect(errorsOf(collectionUpdateSchema, { lease_id: LEASE, component: "nope", collected_by: "OWNER" })).toEqual({ component: "Encargo inválido." });
        expect(errorsOf(collectionUpdateSchema, { lease_id: "x", paused: true })).toEqual({ lease_id: "Contrato inválido." });
        expect(errorsOf(collectionUpdateSchema, { lease_id: LEASE })).toEqual({ _form: "Nada a alterar." });
        expect(errorsOf(collectionUpdateSchema, { lease_id: LEASE, component: "rent" })).toEqual({ _form: "Nada a alterar." });
    });
});

describe("billingSettingsSchema", () => {
    it("blank is not decided, never a default", () => {
        expect(billingSettingsSchema.parse({ days_in_advance: "", fine_pct: "", interest_pct_month: null })).toEqual({ days_in_advance: null, fine_pct: null, interest_pct_month: null, days_payable_after_due: null, sender_name: null, reply_to_email: null, automation_enabled: false, automation_from_month: null });
    });

    it("reads numbers as typed in Brazil", () => {
        expect(billingSettingsSchema.parse({ days_in_advance: "10", fine_pct: "2,5", interest_pct_month: "1", days_payable_after_due: 30 })).toMatchObject({ days_in_advance: 10, fine_pct: 2.5, interest_pct_month: 1, days_payable_after_due: 30 });
        expect(billingSettingsSchema.parse({ fine_pct: "10 %", days_payable_after_due: "0" })).toMatchObject({ fine_pct: 10, days_payable_after_due: 0 });
    });

    it("the automation needs every decision made", () => {
        const decided = { days_in_advance: "10", fine_pct: "2", interest_pct_month: "1", days_payable_after_due: "30", automation_from_month: "2026-11" };
        expect(billingSettingsSchema.parse({ ...decided, automation_enabled: true })).toMatchObject({ automation_enabled: true, automation_from_month: "2026-11" });
        expect(billingSettingsSchema.parse({ ...decided, automation_enabled: "true" })).toMatchObject({ automation_enabled: true });
        expect(errorsOf(billingSettingsSchema, { ...decided, fine_pct: "", automation_from_month: "", automation_enabled: true })).toEqual({
            fine_pct: "Decida este campo antes de ligar a emissão automática.",
            automation_from_month: "Decida este campo antes de ligar a emissão automática.",
        });
        // off: nothing is required
        expect(billingSettingsSchema.parse({ ...decided, fine_pct: "", automation_enabled: false })).toMatchObject({ automation_enabled: false, fine_pct: null });
        expect(errorsOf(billingSettingsSchema, { automation_from_month: "11/2026" })).toEqual({ automation_from_month: "Mês inválido." });
    });

    it("sender and reply-to", () => {
        expect(billingSettingsSchema.parse({ sender_name: "  Holding X  ", reply_to_email: "dono@exemplo.com" })).toMatchObject({ sender_name: "Holding X", reply_to_email: "dono@exemplo.com" });
        expect(billingSettingsSchema.parse({ sender_name: "", reply_to_email: "" })).toMatchObject({ sender_name: null, reply_to_email: null });
        expect(errorsOf(billingSettingsSchema, { reply_to_email: "dono" })).toEqual({ reply_to_email: "E-mail de resposta inválido." });
    });

    it("keeps each decision within its range", () => {
        expect(errorsOf(billingSettingsSchema, { days_in_advance: "0", fine_pct: "25", interest_pct_month: "-1", days_payable_after_due: "61" })).toEqual({
            days_in_advance: "Antecedência entre 1 e 25 dias.",
            fine_pct: "Multa entre 0 e 20%.",
            interest_pct_month: "Juros entre 0 e 20% ao mês.",
            days_payable_after_due: "Prazo entre 0 e 60 dias.",
        });
        expect(errorsOf(billingSettingsSchema, { days_in_advance: "2,5", fine_pct: "abc" })).toEqual({ days_in_advance: "Antecedência entre 1 e 25 dias.", fine_pct: "Multa entre 0 e 20%." });
    });
});
