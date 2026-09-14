/**
 * Server-side helpers shared by the /api/properties/[id]/taxes routes.
 * (Route files may only export HTTP handlers, so shared code lives here.)
 */
import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, UUID_REGEX, type AdminSupabase } from "@/lib/api-auth";
import { signStorageUrl } from "@/lib/storage";
import {
    effectiveTax,
    IPTU_ASSESSMENT_KEYS,
    MAX_INSTALLMENTS,
    normalizeInstallments,
    TAX_KIND_VALUES,
    TAX_PAYER_VALUES,
    type IptuAssessment,
    type PropertyTax,
    type PropertyTaxInput,
    type TaxInstallment,
    type TaxKind,
    type TaxPayer,
} from "@/lib/property-taxes";

export const TAXES_TABLE = "property_taxes";
export const TAXES_BUCKET = "property-taxes";
export const TAXES_COLUMNS =
    "id, property_id, year, kind, amount, paid_by, paid_on, comment, installments, " +
    "municipio, inscricao, referencia, vencimento, area_terreno, area_construida, valor_venal_terreno, valor_venal_predial, valor_venal_imovel, " +
    "aliquota_pct, valor_imposto, coleta_lixo, tsa, desconto, document_path, extracted_at, created_at, updated_at";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type RouteContext = { params: Promise<{ id: string }> };

export async function resolveTaxesContext(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    if (!(await getOwnedProperty(supabase, profileId, id))) {
        return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    }
    return { ctx: { profileId, supabase, propertyId: id } };
}

export async function loadTaxRows(supabase: AdminSupabase, propertyId: string): Promise<PropertyTax[]> {
    const { data, error } = await supabase
        .from(TAXES_TABLE).select(TAXES_COLUMNS).eq("property_id", propertyId)
        .order("year", { ascending: false }).order("kind", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as unknown as PropertyTax[]).map(r => ({
        ...r,
        amount: Number(r.amount) || 0,
        installments: normalizeInstallments(r.installments),
        document_url: null as string | null,
    }));
    for (const r of rows) {
        if (r.document_path) r.document_url = await signStorageUrl(supabase, TAXES_BUCKET, r.document_path);
    }
    return rows;
}

export type ValidatedTax = {
    id?: string;
    year: number;
    kind: TaxKind;
    amount: number;
    paid_by: TaxPayer;
    paid_on: string | null;
    comment: string | null;
    installments: TaxInstallment[];
} & Partial<IptuAssessment>;

function num(v: unknown): number | null | "invalid" {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : "invalid";
}

/** Validates one row for PUT/import. Assessment fields are optional and only set when present. */
export function validateTaxInput(raw: unknown, i: number): { row: ValidatedTax } | { error: string } {
    const where = `Linha ${i + 1}`;
    if (!raw || typeof raw !== "object") return { error: `${where}: formato inválido` };
    const r = raw as PropertyTaxInput;
    if (r.id !== undefined && !UUID_REGEX.test(String(r.id))) return { error: `${where}: id inválido` };
    const year = Number(r.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return { error: `${where}: ano inválido` };
    if (!TAX_KIND_VALUES.includes(r.kind as TaxKind)) return { error: `${where}: tributo inválido` };
    if (!TAX_PAYER_VALUES.includes(r.paid_by)) return { error: `${where}: pagador inválido` };
    if (r.paid_on !== undefined && r.paid_on !== null && !ISO_DATE.test(r.paid_on)) return { error: `${where}: data inválida` };
    const comment = typeof r.comment === "string" && r.comment.trim() ? r.comment.trim().slice(0, 500) : null;

    if (r.installments !== undefined && r.installments !== null && !Array.isArray(r.installments)) return { error: `${where}: parcelas inválidas` };
    if (Array.isArray(r.installments) && r.installments.length > MAX_INSTALLMENTS) return { error: `${where}: no máximo ${MAX_INSTALLMENTS} parcelas` };
    for (const p of r.installments ?? []) {
        if (!p || typeof p !== "object") return { error: `${where}: parcela inválida` };
        const a = num(p.amount);
        if (a === null || a === "invalid") return { error: `${where}: valor de parcela deve ser ≥ 0` };
        if (!TAX_PAYER_VALUES.includes(p.paid_by)) return { error: `${where}: pagador de parcela inválido` };
        if (p.paid_on !== undefined && p.paid_on !== null && !ISO_DATE.test(p.paid_on)) return { error: `${where}: data de parcela inválida` };
    }
    const installments = normalizeInstallments((r.installments ?? []).map(p => ({ ...p, amount: Number(num(p.amount)) })));

    let amount: number;
    let paidBy: TaxPayer = r.paid_by;
    if (installments.length > 0) {
        const e = effectiveTax({ amount: 0, paid_by: r.paid_by, installments });
        amount = e.amount;
        paidBy = e.byLandlord > e.byTenant ? "LANDLORD" : "TENANT";
    } else {
        const a = num(r.amount);
        if (a === null || a === "invalid") return { error: `${where}: valor deve ser ≥ 0` };
        amount = Math.round(a * 100) / 100;
    }

    const row: ValidatedTax = { id: r.id, year, kind: r.kind, amount, paid_by: paidBy, paid_on: r.paid_on ?? null, comment, installments };
    for (const key of IPTU_ASSESSMENT_KEYS) {
        const v = (r as Partial<IptuAssessment>)[key];
        if (v === undefined) continue;
        if (key === "municipio" || key === "inscricao" || key === "referencia") {
            (row as Record<string, unknown>)[key] = typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
        } else if (key === "vencimento") {
            if (v !== null && !ISO_DATE.test(String(v))) return { error: `${where}: vencimento inválido` };
            row.vencimento = (v as string | null) ?? null;
        } else {
            const n = num(v);
            if (n === "invalid") return { error: `${where}: ${key} inválido` };
            (row as Record<string, unknown>)[key] = n;
        }
    }
    return { row };
}
