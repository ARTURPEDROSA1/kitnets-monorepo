import { z } from "zod";
import {
    normalizeEmail,
    normalizeWebsite,
    parseCEP,
    parseCNPJ,
    parsePhoneToE164,
    validateCEP,
    validateCNPJ,
    validateEmail,
    validatePhone,
    validateWebsite,
} from "@/lib/validators";
import { normalizeAgreementUrl } from "@/lib/agency-agreement";

/**
 * Input schema for POST /api/agencies and PUT /api/agencies/[id] (imobiliárias).
 * Messages match the Imobiliária form; the output is normalised and shaped
 * like the `agencies` row (status is added by the create route).
 */

const CRECI_TYPES = ["PJ", "PF"] as const;

const optionalText = (max = 500) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v ?? null),
        z.string().max(max).nullable().optional()
    ).transform((v) => (v ? v : null));

const requiredText = (message: string, max = 200) =>
    z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(max);

const optionalPhone = (message: string) =>
    optionalText(40).refine((v) => v == null || validatePhone(v), message).transform((v) => (v ? parsePhoneToE164(v) : null));

/** "12,5", 12.5, "" → 12.5 / null. */
const managementFee = z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
        if (v == null || v === "") return null;
        const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : null;
    });

export const agencyInputSchema = z
    .object({
        name: requiredText("Nome da imobiliária é obrigatório."),
        trade_name: optionalText(200),
        // Optional; when given it must validate (numeric or alphanumeric) and is stored normalised.
        cnpj: optionalText(30)
            .refine((v) => v == null || parseCNPJ(v).length === 0 || validateCNPJ(v), "CNPJ inválido. Verifique os dígitos.")
            .transform((v) => {
                if (v == null) return null;
                const d = parseCNPJ(v);
                return d.length === 14 ? d : null;
            }),
        creci_number: optionalText(30),
        creci_state: optionalText(2),
        creci_type: z.preprocess(
            (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null),
            z.enum(CRECI_TYPES, { errorMap: () => ({ message: "Tipo de CRECI inválido." }) }).nullable()
        ),
        owner_name: optionalText(200),
        main_phone: requiredText("Telefone principal é obrigatório.", 40)
            .refine((v) => validatePhone(v), "Telefone principal inválido.")
            .transform((v) => parsePhoneToE164(v)),
        additional_phone: optionalPhone("Telefone adicional inválido."),
        main_phone_whatsapp: z.boolean().optional().transform((v) => v === true),
        additional_phone_whatsapp: z.boolean().optional().transform((v) => v === true),
        email: optionalText(200)
            .refine((v) => v == null || validateEmail(v), "E-mail inválido.")
            .transform((v) => (v ? normalizeEmail(v) : null)),
        website: optionalText(300)
            .refine((v) => v == null || validateWebsite(v), "Website inválido.")
            .transform((v) => (v ? normalizeWebsite(v) : null)),
        postal_code: requiredText("CEP é obrigatório e deve ter 8 dígitos.", 12)
            .refine((v) => validateCEP(v), "CEP é obrigatório e deve ter 8 dígitos.")
            .transform((v) => parseCEP(v)),
        street: requiredText("Logradouro é obrigatório."),
        street_number: requiredText("Número é obrigatório.", 20),
        address_complement: optionalText(100),
        neighborhood: requiredText("Bairro é obrigatório.", 100),
        city: requiredText("Cidade é obrigatória.", 100),
        state: requiredText("Estado é obrigatório.", 2).transform((v) => v.toUpperCase()),
        country: optionalText(2).transform((v) => v ?? "BR"),
        description: optionalText(5000),
        // Accepts a storage path, a public/signed URL or nothing; stored as the object path.
        service_agreement_url: z.unknown().transform((v) => normalizeAgreementUrl(v)),
        service_agreement_filename: optionalText(255),
        management_fee: managementFee,
        agreement_start_date: optionalText(10),
        agreement_end_date: optionalText(10),
    })
    .transform((d) => ({
        ...d,
        additional_phone_whatsapp: d.additional_phone ? d.additional_phone_whatsapp : false,
    }));

export type AgencyInput = z.output<typeof agencyInputSchema>;
