import { z } from "zod";
import { parseCurrencyBR } from "@/lib/currency";
import { COLLECTORS } from "@/lib/invoice-collection";
import { MONTH_REGEX } from "@/lib/invoice-schedule";

/**
 * Input schemas for the Fatura routes (/api/faturas…). Messages match the screens.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max: number) =>
    z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? null), z.string().max(max).nullable().optional()).transform((v) => (v ? v : null));

/** "R$ 1.234,56", "1234.56", 1234.56 → number; blank → null */
const money = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : Math.round(parseCurrencyBR(v) * 100) / 100));

/** "2,5", "2.5", 2.5 → number; blank → null (not decided) */
const percentOrNull = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
        if (v == null || v === "") return null;
        const n = typeof v === "number" ? v : parseFloat(v.trim().replace(/\s|%/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : NaN;
    });

const intOrNull = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
        if (v == null || v === "") return null;
        const n = typeof v === "number" ? v : Number(v.trim());
        return Number.isInteger(n) ? n : NaN;
    });

/** POST /api/faturas — generate the invoices of a month, for every lease or for one. */
export const invoiceGenerateSchema = z.object({
    month: z.string({ required_error: "Informe o mês.", invalid_type_error: "Informe o mês." }).trim().regex(MONTH_REGEX, "Mês inválido."),
    lease_id: optionalText(64).refine((v) => v == null || UUID.test(v), "Contrato inválido."),
});

/** POST /api/faturas/[id]/pagar — the owner records a payment received outside the module. */
export const invoicePaySchema = z.object({
    paid_on: z.string({ required_error: "Informe a data do pagamento.", invalid_type_error: "Informe a data do pagamento." }).trim().regex(ISO_DATE, "Data do pagamento inválida."),
    /** everything the tenant paid; blank = the invoice's amount */
    paid_amount: money.refine((v) => v == null || v > 0, "O valor recebido deve ser maior que zero."),
    notes: optionalText(1000),
});

/** POST /api/faturas/[id]/cancelar */
export const invoiceCancelSchema = z.object({
    reason: optionalText(500),
});

/** PUT /api/faturas/cobrancas — who collects one component of a lease, or pausing the lease's invoicing. */
export const collectionUpdateSchema = z
    .object({
        lease_id: z.string({ required_error: "Contrato inválido.", invalid_type_error: "Contrato inválido." }).trim().regex(UUID, "Contrato inválido."),
        /** `rent`, or the id of the lease charge */
        component: optionalText(64).refine((v) => v == null || v === "rent" || UUID.test(v), "Encargo inválido."),
        /** null clears the answer (the component follows the lease's management again) */
        collected_by: z.enum(COLLECTORS, { errorMap: () => ({ message: "Emissor inválido." }) }).nullable().optional(),
        paused: z.boolean().optional(),
    })
    .superRefine((d, ctx) => {
        const collector = d.component != null && d.collected_by !== undefined;
        if (!collector && d.paused === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["_form"], message: "Nada a alterar." });
    });

/**
 * PUT /api/faturas/configuracoes — the owner's billing decisions. Blank means "not decided": it is
 * stored as NULL and nothing is assumed in its place.
 */
export const billingSettingsSchema = z
    .object({
        days_in_advance: intOrNull.refine((v) => v === null || (v >= 1 && v <= 25), "Antecedência entre 1 e 25 dias."),
        fine_pct: percentOrNull.refine((v) => v === null || (v >= 0 && v <= 20), "Multa entre 0 e 20%."),
        interest_pct_month: percentOrNull.refine((v) => v === null || (v >= 0 && v <= 20), "Juros entre 0 e 20% ao mês."),
        days_payable_after_due: intOrNull.refine((v) => v === null || (v >= 0 && v <= 60), "Prazo entre 0 e 60 dias."),
        /** how the tenant sees the sender ("<name> via Kitnets"); blank = the holding's name */
        sender_name: optionalText(80),
        reply_to_email: optionalText(120).refine((v) => v === null || /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v), "E-mail de resposta inválido."),
        /** the daily run: generate, issue and e-mail on its own */
        automation_enabled: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).optional().default(false),
        /** `YYYY-MM`: the first month the run bills; earlier months are never created on their own */
        automation_from_month: optionalText(7).refine((v) => v === null || MONTH_REGEX.test(v), "Mês inválido."),
        /** the card fee passed on to the tenant: % of what is charged + a fixed part, as the owner's processor charges */
        card_fee_pct: percentOrNull.refine((v) => v === null || (v >= 0 && v < 50), "Taxa entre 0 e 50%."),
        card_fee_fixed: money.refine((v) => v === null || (v >= 0 && v <= 100), "Parte fixa entre R$ 0 e R$ 100."),
    })
    .superRefine((d, ctx) => {
        if ((d.card_fee_pct === null) !== (d.card_fee_fixed === null)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [d.card_fee_pct === null ? "card_fee_pct" : "card_fee_fixed"], message: "Informe as duas partes da taxa do cartão, ou deixe as duas em branco." });
        }
        if (!d.automation_enabled) return;
        // mirrors the table's CHECK: the run only acts on decisions the owner has made
        const missing: Array<keyof typeof d> = [];
        if (d.days_in_advance === null) missing.push("days_in_advance");
        if (d.fine_pct === null) missing.push("fine_pct");
        if (d.interest_pct_month === null) missing.push("interest_pct_month");
        if (d.days_payable_after_due === null) missing.push("days_payable_after_due");
        if (d.automation_from_month === null) missing.push("automation_from_month");
        for (const key of missing) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Decida este campo antes de ligar a emissão automática." });
    });

export type BillingSettingsInput = z.output<typeof billingSettingsSchema>;

/** POST /api/faturas/[id]/emitir — issue the boleto; a new due date only when the invoice's has passed. */
export const invoiceIssueSchema = z.object({
    due_date: optionalText(10).refine((v) => v == null || ISO_DATE.test(v), "Data de vencimento inválida."),
});

/** POST /api/faturas/[id]/pagar-sandbox — the bank's sandbox pays the boleto as the tenant would. */
export const invoiceSandboxPaySchema = z.object({
    via: z.preprocess((v) => (v == null || v === "" ? "PIX" : v), z.enum(["BOLETO", "PIX"], { errorMap: () => ({ message: "Forma inválida." }) })),
});
