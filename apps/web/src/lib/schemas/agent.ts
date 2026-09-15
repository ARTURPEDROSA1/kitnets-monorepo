import { z } from "zod";
import {
    normalizeEmail,
    normalizeWebsite,
    parseCPF,
    parsePhoneToE164,
    validateCPF,
    validateEmail,
    validatePhone,
    validateWebsite,
} from "@/lib/validators";

/**
 * Input schema for POST /api/agents and PUT /api/agents/[id] (corretores).
 * Messages match the Corretores form; output is normalised and shaped like
 * the `agents` row minus `user_id`.
 */

const AGENT_TYPES = ["AUTONOMO", "IMOBILIARIA"] as const;
const AGENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const optionalText = (max = 500) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v ?? null),
        z.string().max(max).nullable().optional()
    ).transform((v) => (v ? v : null));

const requiredText = (message: string, max = 200) =>
    z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(max);

export const agentInputSchema = z
    .object({
        full_name: requiredText("Nome completo é obrigatório."),
        // Optional; when given it must be a valid CPF and is stored as 11 digits.
        cpf: optionalText(20)
            .refine((v) => {
                if (v == null) return true;
                const digits = parseCPF(v);
                return digits.length === 0 || validateCPF(digits);
            }, "CPF inválido. Verifique os dígitos.")
            .transform((v) => {
                if (v == null) return null;
                const digits = parseCPF(v);
                return digits.length === 11 ? digits : null;
            }),
        creci_number: requiredText("CRECI é obrigatório.", 30),
        creci_state: requiredText("UF do CRECI é obrigatório.", 2).transform((v) => v.toUpperCase()),
        agent_type: z.enum(AGENT_TYPES, { errorMap: () => ({ message: "Tipo de atuação é obrigatório." }) }),
        agency_id: optionalText(64),
        main_phone: requiredText("Telefone principal é obrigatório.", 40)
            .refine((v) => validatePhone(v), "Telefone principal inválido.")
            .transform((v) => parsePhoneToE164(v)),
        main_phone_whatsapp: z.boolean().optional().transform((v) => v === true),
        additional_phone: optionalText(40)
            .refine((v) => v == null || validatePhone(v), "Telefone adicional inválido.")
            .transform((v) => (v ? parsePhoneToE164(v) : null)),
        additional_phone_whatsapp: z.boolean().optional().transform((v) => v === true),
        email: optionalText(200)
            .refine((v) => v == null || validateEmail(v), "E-mail inválido.")
            .transform((v) => (v ? normalizeEmail(v) : null)),
        website: optionalText(300)
            .refine((v) => v == null || validateWebsite(v), "Website inválido.")
            .transform((v) => (v ? normalizeWebsite(v) : null)),
        notes: optionalText(2000),
        status: z.enum(AGENT_STATUSES, { errorMap: () => ({ message: "Status é obrigatório." }) }),
    })
    .superRefine((d, ctx) => {
        if (d.agent_type === "IMOBILIARIA" && !d.agency_id) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agency_id"], message: "Selecione a imobiliária." });
        }
    })
    .transform((d) => ({
        ...d,
        agency_id: d.agent_type === "IMOBILIARIA" ? d.agency_id : null,
        // A WhatsApp flag without a number is meaningless.
        additional_phone_whatsapp: d.additional_phone ? d.additional_phone_whatsapp : false,
    }));

export type AgentInput = z.output<typeof agentInputSchema>;
