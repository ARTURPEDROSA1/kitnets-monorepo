import { z } from "zod";
import { parseCEP, validateCEP } from "@/lib/validators";

/**
 * Input schemas for /api/investments — the Novos Investimentos module.
 *
 * Every money field accepts the number the form sends and the "1.234,56" a paste can leave
 * behind. Dates are ISO (`YYYY-MM-DD`): the UI masks DD/MM/AAAA and converts before sending.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const optionalText = (max = 200) =>
    z
        .preprocess(
            (v) => (typeof v === "string" ? v.trim() : (v ?? null)),
            z.string().max(max, `Máximo de ${max} caracteres.`).nullable().optional()
        )
        .transform((v) => (v ? v : null));

/** Accepts 1234.56, "1234.56", "1.234,56", "R$ 1.234,56". */
const money = (message = "Valor inválido.") =>
    z
        .preprocess((v) => {
            if (v === "" || v === null || v === undefined) return null;
            if (typeof v === "number") return v;
            if (typeof v !== "string") return v;
            const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : v;
        }, z.number({ invalid_type_error: message }).min(0, "O valor não pode ser negativo.").max(1e12, message).nullable().optional())
        .transform((v) => (v == null ? null : Math.round(v * 100) / 100));

/** Same as `money`, but signed: a correction is negative when an anticipated instalment is discounted. */
const signedMoney = (message = "Valor inválido.") =>
    z
        .preprocess((v) => {
            if (v === "" || v === null || v === undefined) return null;
            if (typeof v === "number") return v;
            if (typeof v !== "string") return v;
            const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : v;
        }, z.number({ invalid_type_error: message }).min(-1e12, message).max(1e12, message).nullable().optional())
        .transform((v) => (v == null ? null : Math.round(v * 100) / 100));

const isoDate = (message = "Data inválida.") =>
    z
        .preprocess((v) => {
            if (v === "" || v === null || v === undefined) return null;
            if (typeof v !== "string") return v;
            const br = BR_DATE.exec(v.trim());
            return br ? `${br[3]}-${br[2]}-${br[1]}` : v.trim().slice(0, 10);
        }, z.string().regex(ISO_DATE, message).nullable().optional())
        .transform((v) => (v ? v : null));

const percent = (max = 100) =>
    z
        .preprocess((v) => {
            if (v === "" || v === null || v === undefined) return 0;
            if (typeof v === "string") {
                const n = Number(v.replace("%", "").replace(",", ".").trim());
                return Number.isFinite(n) ? n : v;
            }
            return v;
        }, z.number({ invalid_type_error: "Percentual inválido." }).min(0, "O percentual não pode ser negativo.").max(max, `O percentual deve ser menor que ${max}.`))
        .transform((v) => Math.round(v * 100) / 100);

export const INVESTMENT_KINDS = ["APARTMENT", "STUDIO", "HOUSE", "PARKING", "LOT", "COMMERCIAL", "OTHER"] as const;
export const INDEX_CODES = ["NONE", "INCC", "IGPM", "IPCA", "CUB", "OTHER"] as const;
export const PERIODICITIES = ["SINGLE", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;
export const PAYMENT_KINDS = [
    "SINAL", "ENTRADA", "PARCELA", "PARCELA_ANUAL", "INTERCALADA", "INICIO_OBRAS",
    "CHAVES", "AMORTIZACAO", "CORRECAO", "TAXAS", "OUTROS",
] as const;
export const PAYMENT_STATUSES = ["PLANNED", "PAID"] as const;
export const DOCUMENT_KINDS = ["CONTRACT", "MARKETING", "PHOTO", "LAYOUT", "RECEIPT", "OTHER"] as const;
export const INVESTMENT_STATUSES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;

export const scheduleInputSchema = z.object({
    label: z.string().trim().min(1, "Descreva o bloco de parcelas.").max(80),
    kind: z.enum(PAYMENT_KINDS).default("PARCELA"),
    installments: z.coerce.number().int().min(1, "Mínimo de 1 parcela.").max(600, "Máximo de 600 parcelas.").default(1),
    amount: money().transform((v) => v ?? 0),
    first_due_on: isoDate("Informe o primeiro vencimento.").refine((v) => v !== null, "Informe o primeiro vencimento."),
    periodicity: z.enum(PERIODICITIES).default("MONTHLY"),
    index_code: z.enum(INDEX_CODES).default("NONE"),
});

export type ScheduleInput = z.output<typeof scheduleInputSchema>;

export const investmentInputSchema = z.object({
    name: z
        .string({ required_error: "Nome do investimento é obrigatório.", invalid_type_error: "Nome do investimento é obrigatório." })
        .trim()
        .min(1, "Nome do investimento é obrigatório.")
        .max(120),
    description: optionalText(2000),
    developer: optionalText(120),
    unit_label: optionalText(80),
    kind: z.enum(INVESTMENT_KINDS).default("APARTMENT"),

    postal_code: optionalText(12)
        .refine((v) => v == null || parseCEP(v).length === 0 || validateCEP(v), "CEP inválido (8 dígitos).")
        .transform((v) => {
            const digits = v ? parseCEP(v) : "";
            return digits.length === 8 ? digits : null;
        }),
    street: optionalText(200),
    street_number: optionalText(20),
    neighborhood: optionalText(100),
    /** The one-line address as stored; the edit dialog sends this instead of the parts. */
    address: optionalText(300),
    city: optionalText(100),
    state: optionalText(2).transform((v) => (v ? v.toUpperCase() : null)),

    total_price: money().transform((v) => v ?? 0),
    down_payment: money().transform((v) => v ?? 0),
    financed_amount: money().transform((v) => v ?? 0),
    contract_date: isoDate(),
    keys_expected_on: isoDate(),
    keys_delivered_on: isoDate(),
    index_before_keys: z.enum(INDEX_CODES).default("NONE"),
    index_after_keys: z.enum(INDEX_CODES).default("NONE"),

    estimated_rent: money(),
    rent_start_on: isoDate(),
    rent_adjustment_pct: percent(100).default(0),
    rent_vacancy_pct: percent(99).default(0),
    rent_costs_pct: percent(99).default(0),

    status: z.enum(INVESTMENT_STATUSES).default("ACTIVE"),
    cover_path: optionalText(400),
    notes: optionalText(4000),

    /** Only on create: the quadro resumo blocks the AI import (or the form) produced. */
    schedules: z.array(scheduleInputSchema).max(40, "Máximo de 40 blocos de parcelas.").optional(),
});

export type InvestmentInput = z.output<typeof investmentInputSchema>;

/** PATCH accepts any subset; `name` keeps its rule when present. */
export const investmentPatchSchema = investmentInputSchema.partial();
export type InvestmentPatch = z.output<typeof investmentPatchSchema>;

export const paymentInputSchema = z
    .object({
        due_on: isoDate("Informe o vencimento.").refine((v) => v !== null, "Informe o vencimento."),
        paid_on: isoDate(),
        kind: z.enum(PAYMENT_KINDS).default("PARCELA"),
        amount: money().transform((v) => v ?? 0),
        correction_amount: signedMoney().transform((v) => v ?? 0),
        installment_number: z.coerce.number().int().min(1).max(600).nullable().optional().default(null),
        status: z.enum(PAYMENT_STATUSES).default("PAID"),
        receipt_path: optionalText(400),
        receipt_name: optionalText(200),
        notes: optionalText(1000),
    })
    // The table's default is PAID, and a paid row without a date breaks every month bucket.
    .transform((v) => (v.status === "PAID" && !v.paid_on ? { ...v, paid_on: v.due_on } : v));

export type PaymentInput = z.output<typeof paymentInputSchema>;

export const paymentPatchSchema = paymentInputSchema.innerType().partial();
export type PaymentPatch = z.output<typeof paymentPatchSchema>;

export const documentInputSchema = z.object({
    kind: z.enum(DOCUMENT_KINDS).default("OTHER"),
    storage_path: z.string().trim().min(1, "Arquivo não enviado.").max(400),
    file_name: optionalText(200),
    mime_type: optionalText(120),
    size_bytes: z.coerce.number().int().min(0).max(100 * 1024 * 1024).nullable().optional().default(null),
});

export type DocumentInput = z.output<typeof documentInputSchema>;

/** POST /api/investments/[id]/promote — the name the property gets in Imóveis. */
export const promoteInputSchema = z.object({
    name: z.string().trim().min(1, "Nome do imóvel é obrigatório.").max(120).optional(),
    keys_delivered_on: isoDate(),
});

export type PromoteInput = z.output<typeof promoteInputSchema>;
