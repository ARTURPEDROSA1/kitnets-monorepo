import { z } from "zod";
import {
    normalizeEmail,
    parseCEP,
    parseCPF,
    parsePhoneToE164,
    validateCEP,
    validateCPF,
    validateEmail,
    validatePhone,
} from "@/lib/validators";
import { normalizeInstagram, normalizeLinkedin } from "@/lib/social-links";

/**
 * Input schema for POST /api/tenants and PUT /api/tenants/[id].
 *
 * Validation messages are the ones the Inquilinos form shows next to each
 * field; the output is already normalised (CPF digits, E.164 phones,
 * lower-cased e-mail, 8-digit CEP, upper-cased state) and shaped like the
 * `tenants` row minus `user_id`.
 */

const MANAGEMENT_TYPES = ["SELF_MANAGED", "AGENCY"] as const;

/** Optional free text: trimmed, empty becomes null. */
const optionalText = (max = 500) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v ?? null),
        z.string().max(max).nullable().optional()
    ).transform((v) => (v ? v : null));

const requiredText = (message: string, max = 500) =>
    z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(max);

const optionalPhone = (message: string) =>
    optionalText(40).refine((v) => v == null || validatePhone(v), message).transform((v) => (v ? parsePhoneToE164(v) : null));

const optionalId = () =>
    optionalText(64);

export const tenantInputSchema = z
    .object({
        full_name: requiredText("Nome completo é obrigatório.", 200),
        cpf: requiredText("CPF é obrigatório.", 20)
            .refine((v) => validateCPF(parseCPF(v)), "CPF inválido. Verifique os dígitos.")
            .transform((v) => parseCPF(v)),
        // Optional: a tenant imported from a lease agreement has no phone yet.
        main_phone: optionalPhone("Telefone principal inválido."),
        email: optionalText(200)
            .refine((v) => v == null || validateEmail(v), "E-mail inválido.")
            .transform((v) => (v ? normalizeEmail(v) : null)),
        date_of_birth: optionalText(10),
        rg: optionalText(30),
        additional_phone: optionalPhone("Telefone adicional inválido."),
        occupation: optionalText(120),
        // stored canonical: the handle without the @, the profile URL
        instagram: optionalText(200)
            .refine((v) => v == null || normalizeInstagram(v) !== null, "Instagram inválido: use o @ ou o link do perfil.")
            .transform((v) => (v ? normalizeInstagram(v) : null)),
        linkedin: optionalText(300)
            .refine((v) => v == null || normalizeLinkedin(v) !== null, "LinkedIn inválido: use o link do perfil.")
            .transform((v) => (v ? normalizeLinkedin(v) : null)),
        postal_code: optionalText(12)
            .refine((v) => {
                if (v == null) return true;
                const digits = parseCEP(v);
                return digits.length === 0 || validateCEP(digits);
            }, "CEP inválido (8 dígitos).")
            .transform((v) => {
                if (v == null) return null;
                const digits = parseCEP(v);
                return digits.length === 8 ? digits : null;
            }),
        street: optionalText(200),
        street_number: optionalText(20),
        address_complement: optionalText(100),
        neighborhood: optionalText(100),
        city: optionalText(100),
        state: optionalText(2).transform((v) => (v ? v.toUpperCase() : null)),
        property_id: requiredText("Imóvel é obrigatório.", 64),
        use_property_address: z.boolean().optional().transform((v) => v === true),
        management_type: z.enum(MANAGEMENT_TYPES, {
            errorMap: () => ({ message: "Tipo de gestão é obrigatório." }),
        }),
        agency_id: optionalId(),
        agent_id: optionalId(),
        move_in_date: optionalText(10),
        move_out_date: optionalText(10),
        status: optionalText(30).transform((v) => v ?? "ACTIVE"),
        emergency_contact_name: optionalText(200),
        emergency_contact_phone: optionalPhone("Telefone de emergência inválido."),
        notes: optionalText(2000),
    })
    .superRefine((d, ctx) => {
        if (d.management_type === "AGENCY" && !d.agency_id) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agency_id"], message: "Selecione a imobiliária." });
        }
    })
    .transform((d) => ({
        ...d,
        // Agency links only make sense for agency-managed tenants.
        agency_id: d.management_type === "AGENCY" ? d.agency_id : null,
        agent_id: d.management_type === "AGENCY" ? d.agent_id : null,
    }));

export type TenantInput = z.output<typeof tenantInputSchema>;
