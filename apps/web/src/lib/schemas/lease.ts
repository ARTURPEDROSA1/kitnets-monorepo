import { z } from "zod";
import { parseCurrencyBR } from "@/lib/currency";

/**
 * Input schemas for the leases (contratos) routes.
 * Messages match the Contratos form. The main schema outputs three parts:
 * the `leases` row (minus user_id), the additional tenants and the charges.
 */

export const LEASE_STATUSES = ["DRAFT", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "TERMINATED", "CANCELLED"] as const;
export const LEASE_MANAGEMENT = ["SELF_MANAGED", "AGENCY", "AGENT"] as const;
export const LEASE_ADJUSTMENT = ["IPCA", "IGP_M", "INPC", "IVAR", "CUSTOM", "NONE"] as const;
export const LEASE_CHARGE_TYPES = ["CONDOMINIUM", "IPTU", "WATER", "ELECTRICITY", "GAS", "INTERNET", "OTHER"] as const;
export const LEASE_RESPONSIBILITIES = ["TENANT", "LANDLORD", "INCLUDED"] as const;
export const LEASE_TENANT_ROLES = ["CO_TENANT", "OCCUPANT"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = (max = 500) =>
    z.preprocess(
        (v) => (typeof v === "string" ? v.trim() : v ?? null),
        z.string().max(max).nullable().optional()
    ).transform((v) => (v ? v : null));

const requiredText = (message: string, max = 64) =>
    z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(max);

const optionalDate = (message: string) =>
    optionalText(10).refine((v) => v == null || ISO_DATE.test(v), message);

/** "R$ 1.234,56", "1234.56", 1234.56, "" → number | null */
const money = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : parseCurrencyBR(v)));

const intOrNull = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
        if (v == null || v === "") return null;
        const n = typeof v === "number" ? Math.trunc(v) : parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    });

const includes = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
    typeof v === "string" && (list as readonly string[]).includes(v);

/** Lenient on purpose: malformed entries are dropped, like the form expects. */
const additionalTenants = z.unknown().transform((v) =>
    (Array.isArray(v) ? v : [])
        .filter((t): t is { tenant_id: string; role: string } =>
            !!t && typeof t === "object" && typeof (t as { tenant_id?: unknown }).tenant_id === "string" &&
            !!(t as { tenant_id: string }).tenant_id.trim() && includes(LEASE_TENANT_ROLES, (t as { role?: unknown }).role))
        .map((t) => ({ tenant_id: t.tenant_id.trim(), role: t.role }))
);

const charges = z.unknown().transform((v) =>
    (Array.isArray(v) ? v : [])
        .filter((c): c is { charge_type: string; responsibility: string; label?: unknown; amount?: unknown; adjustment_index?: unknown; adjustment_notes?: unknown } =>
            !!c && typeof c === "object" &&
            includes(LEASE_CHARGE_TYPES, (c as { charge_type?: unknown }).charge_type) &&
            includes(LEASE_RESPONSIBILITIES, (c as { responsibility?: unknown }).responsibility))
        .map((c) => ({
            charge_type: c.charge_type,
            label: typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, 200) : null,
            responsibility: c.responsibility,
            amount: c.amount == null || c.amount === "" ? null : parseCurrencyBR(c.amount as string | number),
            adjustment_index: includes(LEASE_ADJUSTMENT, c.adjustment_index) ? c.adjustment_index : null,
            adjustment_notes: typeof c.adjustment_notes === "string" && c.adjustment_notes.trim() ? c.adjustment_notes.trim().slice(0, 300) : null,
        }))
);

export const leaseInputSchema = z
    .object({
        reference_name: optionalText(200),
        property_id: requiredText("Selecione um imóvel."),
        primary_tenant_id: requiredText("Selecione um inquilino."),
        management_type: z.enum(LEASE_MANAGEMENT, { errorMap: () => ({ message: "Tipo de gestão é obrigatório." }) }),
        agency_id: optionalText(64),
        agent_id: optionalText(64),
        start_date: requiredText("Data de início é obrigatória.", 10).refine((v) => ISO_DATE.test(v), "Data de início inválida."),
        end_date: optionalDate("Data de término inválida."),
        monthly_rent: money.refine((v) => v != null && v > 0, "Valor do aluguel deve ser maior que zero."),
        rent_due_day: intOrNull.refine((v) => v != null && v >= 1 && v <= 31, "Dia de vencimento deve ser entre 1 e 31."),
        security_deposit: money,
        deposit_months: intOrNull,
        adjustment_index: z.unknown().transform((v) => (includes(LEASE_ADJUSTMENT, v) ? v : null)),
        adjustment_frequency: intOrNull.transform((v) => (v && v > 0 ? v : 12)),
        next_adjustment_date: optionalDate("Data do próximo reajuste inválida."),
        status: z.preprocess(
            (v) => (v == null || v === "" ? "ACTIVE" : v),
            z.enum(LEASE_STATUSES, { errorMap: () => ({ message: "Status inválido." }) })
        ),
        notes: optionalText(5000),
        additional_tenants: additionalTenants,
        charges,
    })
    .superRefine((d, ctx) => {
        if (d.management_type === "AGENCY" && !d.agency_id) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agency_id"], message: "Selecione a imobiliária." });
        }
        if (d.management_type === "AGENT" && !d.agent_id) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agent_id"], message: "Selecione o corretor." });
        }
        if (d.end_date && ISO_DATE.test(d.start_date) && d.end_date <= d.start_date) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Data de término deve ser posterior à data de início." });
        }
    })
    .transform(({ additional_tenants, charges: chargeRows, ...d }) => ({
        lease: {
            ...d,
            monthly_rent: d.monthly_rent as number,
            rent_due_day: d.rent_due_day as number,
            // An agency link only for agency-managed leases; an agent for agency- or agent-managed ones.
            agency_id: d.management_type === "AGENCY" ? d.agency_id : null,
            agent_id: d.management_type === "SELF_MANAGED" ? null : d.agent_id,
        },
        additional_tenants,
        charges: chargeRows,
    }));

export type LeaseInput = z.output<typeof leaseInputSchema>;

export const leaseTerminationSchema = z.object({
    termination_date: requiredText("Data de rescisão é obrigatória.", 10).refine((v) => ISO_DATE.test(v), "Data de rescisão inválida."),
    termination_reason: optionalText(1000),
    notes: optionalText(5000),
});

export const LEASE_DOCUMENT_TYPES = ["CONTRACT", "ADDENDUM", "INSPECTION", "TENANT_DOC", "DEPOSIT_RECEIPT", "OTHER"] as const;
