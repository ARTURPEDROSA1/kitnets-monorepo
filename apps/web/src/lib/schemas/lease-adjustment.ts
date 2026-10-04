import { z } from "zod";
import { parseCurrencyBR } from "@/lib/currency";
import { LEASE_ADJUSTMENT } from "@/lib/schemas/lease";

/**
 * Input of `POST /api/leases/[id]/reajustes`: an addendum (or an agreement without a file) saying what
 * the rent — and, when it changes, the condominium — became on a date. Any value is accepted: the
 * parties negotiate freely, whatever the index did.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toCents = (v: string | number) => Math.round(parseCurrencyBR(v) * 100) / 100;

const realDate = (v: string) => {
    if (!ISO_DATE.test(v)) return false;
    const [y, m, d] = v.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export const leaseAddendumSchema = z.object({
    effective_date: z.string({ required_error: "Informe a data em que o novo valor passa a valer." }).refine(realDate, "Data inválida."),
    new_rent: z
        .union([z.number(), z.string()], { errorMap: () => ({ message: "Informe o novo valor do aluguel." }) })
        .transform(toCents)
        .refine((v) => v > 0, "Informe o novo valor do aluguel."),
    /** empty = the addendum does not change the followed charge: the condominium, or a house's energy */
    new_condo: z
        .union([z.number(), z.string(), z.null()])
        .optional()
        .transform((v) => (v == null || v === "" ? null : toCents(v)))
        .refine((v) => v === null || v > 0, "Valor do condomínio / energia inválido."),
    /**
     * What the rent (and the condominium) were before this adjustment. Only for the lease's first
     * adjustment: the contract was registered with today's amounts, and this says the original ones.
     */
    previous_rent: z
        .union([z.number(), z.string(), z.null()])
        .optional()
        .transform((v) => (v == null || v === "" ? null : toCents(v)))
        .refine((v) => v === null || v > 0, "Valor anterior inválido."),
    previous_condo: z
        .union([z.number(), z.string(), z.null()])
        .optional()
        .transform((v) => (v == null || v === "" ? null : toCents(v)))
        .refine((v) => v === null || v > 0, "Valor anterior do condomínio / energia inválido."),
    index_code: z.unknown().transform((v) => ((LEASE_ADJUSTMENT as readonly unknown[]).includes(v) && v !== "NONE" ? (v as string) : null)),
    index_pct: z
        .union([z.number(), z.string(), z.null()])
        .optional()
        .transform((v) => {
            if (v == null || v === "") return null;
            const n = typeof v === "number" ? v : Number(v.replace("%", "").replace(/\s/g, "").replace(",", "."));
            return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : NaN;
        })
        .refine((v) => v === null || (Number.isFinite(v) && Math.abs(v) <= 1000), "Percentual inválido."),
    document_id: z
        .union([z.string().uuid("Documento inválido."), z.null()])
        .optional()
        .transform((v) => v ?? null),
    notes: z
        .union([z.string(), z.null()])
        .optional()
        .transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : null)),
});

export type LeaseAddendumInput = z.output<typeof leaseAddendumSchema>;
