import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, type AdminSupabase } from "@/lib/api-auth";
import {
    INCOME_SOURCES,
    INCOME_STATUSES,
    MONTH_KEY_REGEX,
    receivedFromGross,
    type IncomeRowInput,
    type IncomeSource,
    type IncomeStatus,
    type PropertyIncomeRow,
} from "@/lib/property-income";

export const dynamic = "force-dynamic";

/**
 * Monthly income ledger for a property the signed-in user owns.
 *
 *   GET    /api/properties/[id]/income              → { rows }   (newest month first)
 *   PUT    /api/properties/[id]/income  { rows }    → { rows }   merge-upsert by month
 *   DELETE /api/properties/[id]/income?month=YYYY-MM → { ok }
 *
 * PUT semantics: for each input row only the fields present are
 * overwritten; missing fields keep their stored value (or the default
 * for a new month). This lets a rent sheet and an energy sheet be
 * imported independently into the same months.
 */

type RouteContext = { params: Promise<{ id: string }> };

const TABLE = "property_income_months";
const MAX_ROWS = 600;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_COLUMNS =
    "id, property_id, month, received_on, received_amount, energy_portion, other_income, agency_fee_pct, status, source, bank_reference, notes, created_at, updated_at";

function money(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
}

function text(value: unknown, max = 500): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const t = String(value).trim();
    return t ? t.slice(0, max) : null;
}

function normalizeRow(r: PropertyIncomeRow): PropertyIncomeRow {
    return {
        ...r,
        received_amount: Number(r.received_amount) || 0,
        energy_portion: Number(r.energy_portion) || 0,
        other_income: Number(r.other_income) || 0,
        agency_fee_pct: Number(r.agency_fee_pct) || 0,
    };
}

async function loadRows(supabase: AdminSupabase, propertyId: string) {
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq("property_id", propertyId)
        .order("month", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PropertyIncomeRow[]).map(normalizeRow);
}

async function resolveProperty(context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return { response: authed.response };
    const { profileId, supabase } = authed.ctx;
    const { id } = await context.params;
    const property = await getOwnedProperty(supabase, profileId, id);
    if (!property) {
        return { response: NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 }) };
    }
    return { ctx: { profileId, supabase, propertyId: id } };
}

// ── GET ──────────────────────────────────────────────────────────────

export async function GET(_request: Request, context: RouteContext) {
    const resolved = await resolveProperty(context);
    if ("response" in resolved) return resolved.response;
    const { supabase, propertyId } = resolved.ctx;

    try {
        const rows = await loadRows(supabase, propertyId);
        return NextResponse.json({ rows });
    } catch (err) {
        console.error("[Income GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar receitas" }, { status: 500 });
    }
}

// ── PUT (merge upsert) ───────────────────────────────────────────────

interface ValidatedInput {
    month: string;
    received_amount?: number;
    gross_rent?: number;   // derived into received_amount at merge time, never stored
    energy_portion?: number;
    other_income?: number;
    agency_fee_pct?: number;
    status?: IncomeStatus;
    source?: IncomeSource;
    received_on?: string | null;
    bank_reference?: string | null;
    notes?: string | null;
}

function validateInput(raw: unknown, index: number): { row: ValidatedInput } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: `Linha ${index + 1}: formato inválido` };
    const r = raw as IncomeRowInput;
    if (typeof r.month !== "string" || !MONTH_KEY_REGEX.test(r.month)) {
        return { error: `Linha ${index + 1}: mês inválido (use AAAA-MM)` };
    }
    const row: ValidatedInput = { month: r.month };

    for (const key of ["received_amount", "gross_rent", "energy_portion", "other_income"] as const) {
        const v = money(r[key]);
        if (v === null) return { error: `Linha ${index + 1} (${r.month}): ${key} deve ser um número ≥ 0` };
        if (v !== undefined) row[key] = v;
    }
    const pct = money(r.agency_fee_pct);
    if (pct === null || (pct !== undefined && pct >= 100)) {
        return { error: `Linha ${index + 1} (${r.month}): taxa da imobiliária deve estar entre 0 e 99,99` };
    }
    if (pct !== undefined) row.agency_fee_pct = pct;

    if (r.status !== undefined) {
        if (!INCOME_STATUSES.includes(r.status)) return { error: `Linha ${index + 1} (${r.month}): status inválido` };
        row.status = r.status;
    }
    if (r.source !== undefined) {
        if (!INCOME_SOURCES.includes(r.source)) return { error: `Linha ${index + 1} (${r.month}): origem inválida` };
        row.source = r.source;
    }
    if (r.received_on !== undefined) {
        if (r.received_on !== null && !ISO_DATE_REGEX.test(r.received_on)) {
            return { error: `Linha ${index + 1} (${r.month}): data de recebimento inválida` };
        }
        row.received_on = r.received_on;
    }
    const notes = text(r.notes);
    if (notes !== undefined) row.notes = notes;
    const bankRef = text(r.bank_reference, 120);
    if (bankRef !== undefined) row.bank_reference = bankRef;

    return { row };
}

export async function PUT(request: Request, context: RouteContext) {
    const resolved = await resolveProperty(context);
    if ("response" in resolved) return resolved.response;
    const { profileId, supabase, propertyId } = resolved.ctx;

    let body: { rows?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
        return NextResponse.json({ error: "rows é obrigatório" }, { status: 400 });
    }
    if (body.rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por envio` }, { status: 400 });
    }

    const inputs: ValidatedInput[] = [];
    for (let i = 0; i < body.rows.length; i++) {
        const v = validateInput(body.rows[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        inputs.push(v.row);
    }

    try {
        const existing = new Map((await loadRows(supabase, propertyId)).map(r => [r.month.slice(0, 7), r]));
        const merged = new Map<string, Record<string, unknown>>();

        for (const input of inputs) {
            const prev = merged.get(input.month) ?? existing.get(input.month);
            const base: Record<string, unknown> = prev
                ? { ...prev }
                : {
                    received_on: null,
                    received_amount: 0,
                    energy_portion: 0,
                    other_income: 0,
                    agency_fee_pct: 0,
                    status: "CONFIRMED",
                    source: "MANUAL",
                    bank_reference: null,
                    notes: null,
                };
            delete base.id;
            delete base.created_at;
            delete base.updated_at;
            const { month, gross_rent, ...fields } = input;
            const record: Record<string, unknown> = {
                ...base,
                ...fields,
                property_id: propertyId,
                owner_id: profileId,
                month: `${month}-01`,
            };
            // Gross rent from a lease sheet: derive what lands in the account
            // using the merged fee / energy / other values for that month.
            if (gross_rent !== undefined) {
                record.received_amount = receivedFromGross(
                    gross_rent,
                    Number(record.agency_fee_pct) || 0,
                    Number(record.energy_portion) || 0,
                    Number(record.other_income) || 0
                );
            }
            merged.set(month, record);
        }

        const { error } = await supabase
            .from(TABLE)
            .upsert(Array.from(merged.values()), { onConflict: "property_id,month" });
        if (error) throw new Error(error.message);

        const rows = await loadRows(supabase, propertyId);
        return NextResponse.json({ rows, upserted: merged.size });
    } catch (err) {
        console.error("[Income PUT]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao salvar receitas" }, { status: 500 });
    }
}

// ── DELETE ───────────────────────────────────────────────────────────

export async function DELETE(request: Request, context: RouteContext) {
    const resolved = await resolveProperty(context);
    if ("response" in resolved) return resolved.response;
    const { supabase, propertyId } = resolved.ctx;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? "";
    if (!MONTH_KEY_REGEX.test(month)) {
        return NextResponse.json({ error: "month inválido (use AAAA-MM)" }, { status: 400 });
    }

    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("property_id", propertyId)
        .eq("month", `${month}-01`);
    if (error) {
        console.error("[Income DELETE]", error.message);
        return NextResponse.json({ error: "Erro ao excluir mês" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
