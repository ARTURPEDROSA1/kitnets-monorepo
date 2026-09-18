import { z } from "zod";
import { parseCEP, validateCEP } from "@/lib/validators";

/**
 * Input schema for POST /api/properties: the minimum that registers a rental
 * property (a name and, ideally, its address). Everything else the Imóveis
 * page knows about a property is filled in there later.
 */

const optionalText = (max = 200) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v ?? null),
        z.string().max(max).nullable().optional()
    ).transform((v) => (v ? v : null));

export const propertyInputSchema = z.object({
    name: z
        .string({ required_error: "Nome do imóvel é obrigatório.", invalid_type_error: "Nome do imóvel é obrigatório." })
        .trim()
        .min(1, "Nome do imóvel é obrigatório.")
        .max(120),
    postal_code: optionalText(12)
        .refine((v) => v == null || parseCEP(v).length === 0 || validateCEP(v), "CEP inválido (8 dígitos).")
        .transform((v) => {
            const digits = v ? parseCEP(v) : "";
            return digits.length === 8 ? digits : null;
        }),
    street: optionalText(200),
    street_number: optionalText(20),
    address_complement: optionalText(100),
    neighborhood: optionalText(100),
    city: optionalText(100),
    state: optionalText(2).transform((v) => (v ? v.toUpperCase() : null)),
});

export type PropertyInput = z.output<typeof propertyInputSchema>;
