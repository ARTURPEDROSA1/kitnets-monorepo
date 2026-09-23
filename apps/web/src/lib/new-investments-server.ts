import { NextResponse } from "next/server";
import type { AdminSupabase } from "@/lib/api-auth";
import { UUID_REGEX } from "@/lib/api-auth";
import { notFound } from "@/lib/api-route";
import { createRentalProperty } from "@/lib/properties-server";
import type {
    InvestmentDocument,
    InvestmentPayment,
    InvestmentSchedule,
    NewInvestment,
} from "@/lib/new-investments";
import type { InvestmentInput, PromoteInput, ScheduleInput } from "@/lib/schemas/new-investment";

/**
 * Server side of Projetos (né Novos Investimentos): ownership, the bundle every dashboard call needs, the
 * uploads (contract, receipts, photos, floor plans) and the promotion to a real property.
 *
 * Files never travel through a route body — a request body on Vercel stops at 4.5 MB and a floor
 * plan or a scanned contract is easily bigger. The browser asks for a signed upload URL, PUTs the
 * file into the account's staging folder and the routes then work from the object's path, exactly
 * like the lease import does (lib/lease-uploads-server.ts).
 */

export const INVESTMENT_DOCUMENTS_BUCKET = "investment-documents";

export const STAGED_UPLOAD_MIME_TYPES = [
    "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp",
];
export const STAGED_UPLOAD_MAX_SIZE = 20 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

/** Where an account's staged uploads live: nothing outside this folder is ever read or moved on its behalf. */
export const stagedFolder = (profileId: string) => `imports/${profileId}`;

export function newStagedPath(profileId: string, mimeType: string): string {
    return `${stagedFolder(profileId)}/${crypto.randomUUID()}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

/** The path when it is one of the account's staged uploads, else null (other folders, traversal, URLs). */
export function ownStagedPath(profileId: string, path: unknown): string | null {
    if (typeof path !== "string") return null;
    const pattern = new RegExp(`^imports/${profileId.replace(/[^a-zA-Z0-9-]/g, "")}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`);
    return pattern.test(path) ? path : null;
}

export function mimeTypeOfPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** The staged file's bytes, or null when it is missing or over the limit. */
export async function downloadStagedUpload(supabase: AdminSupabase, path: string): Promise<Buffer | null> {
    const { data, error } = await supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET).download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer.length > 0 && buffer.length <= STAGED_UPLOAD_MAX_SIZE ? buffer : null;
}

/**
 * Moves a staged object into the investment's own folder. Returns the new path and the size the
 * bucket reports, or null when the staged file is gone.
 */
export async function adoptStagedUpload(
    supabase: AdminSupabase,
    investmentId: string,
    staged: string
): Promise<{ path: string; size: number | null } | null> {
    const ext = staged.split(".").pop() ?? "bin";
    const path = `${investmentId}/${crypto.randomUUID()}.${ext}`;
    const bucket = supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET);
    const folder = staged.slice(0, staged.lastIndexOf("/"));
    const { data: listed } = await bucket.list(folder, { search: staged.slice(staged.lastIndexOf("/") + 1) });
    const { error } = await bucket.move(staged, path);
    if (error) {
        console.error("[Investment Upload] Storage move error:", error);
        return null;
    }
    const size = Number((listed?.[0]?.metadata as { size?: number } | undefined)?.size);
    return { path, size: Number.isFinite(size) ? size : null };
}

// ── Reads ────────────────────────────────────────────────────────────

const INVESTMENT_COLUMNS =
    "id, name, description, developer, unit_label, kind, address, city, state, zip, total_price, down_payment, " +
    "financed_amount, contract_date, keys_expected_on, keys_delivered_on, index_before_keys, index_after_keys, " +
    "estimated_rent, rent_start_on, rent_adjustment_pct, rent_vacancy_pct, rent_costs_pct, sim_horizon_months, sim_delivery_costs_pct, " +
    "area_m2, market_m2_price, estimated_value_at_delivery, expected_appreciation_pct, construction_pct, construction_updated_on, " +
    "strategy, exit_plan, sold_on, sale_price, sale_costs_pct, status, " +
    "promoted_property_id, promoted_at, cover_path, notes, created_at, updated_at";

const SCHEDULE_COLUMNS = "id, investment_id, label, kind, installments, amount, first_due_on, periodicity, index_code, position";

const PAYMENT_COLUMNS =
    "id, investment_id, due_on, paid_on, kind, amount, correction_amount, installment_number, status, " +
    "receipt_path, receipt_name, payer, pj_amount, notes, source, created_at, updated_at";

const DOCUMENT_COLUMNS = "id, investment_id, payment_id, kind, storage_path, file_name, mime_type, size_bytes, created_at";

/** Numeric columns come back as strings from PostgREST; the UI wants numbers. */
function toNumber(value: unknown, fallback = 0): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function mapInvestment(row: Record<string, unknown>): NewInvestment {
    return {
        ...(row as unknown as NewInvestment),
        total_price: toNumber(row.total_price),
        down_payment: toNumber(row.down_payment),
        financed_amount: toNumber(row.financed_amount),
        estimated_rent: row.estimated_rent == null ? null : toNumber(row.estimated_rent),
        rent_adjustment_pct: toNumber(row.rent_adjustment_pct),
        rent_vacancy_pct: toNumber(row.rent_vacancy_pct),
        rent_costs_pct: toNumber(row.rent_costs_pct),
        sim_horizon_months: toNumber(row.sim_horizon_months, 120),
        sim_delivery_costs_pct: toNumber(row.sim_delivery_costs_pct),
        expected_appreciation_pct: row.expected_appreciation_pct == null ? null : toNumber(row.expected_appreciation_pct),
        area_m2: row.area_m2 == null ? null : toNumber(row.area_m2),
        market_m2_price: row.market_m2_price == null ? null : toNumber(row.market_m2_price),
        estimated_value_at_delivery: row.estimated_value_at_delivery == null ? null : toNumber(row.estimated_value_at_delivery),
        construction_pct: row.construction_pct == null ? null : toNumber(row.construction_pct),
        construction_updated_on: (row.construction_updated_on as string | null) ?? null,
        strategy: ((row.strategy as string | null) ?? "NA_PLANTA") as NewInvestment["strategy"],
        exit_plan: ((row.exit_plan as string | null) ?? "ALUGAR") as NewInvestment["exit_plan"],
        sold_on: (row.sold_on as string | null) ?? null,
        sale_price: row.sale_price == null ? null : toNumber(row.sale_price),
        sale_costs_pct: toNumber(row.sale_costs_pct),
    };
}

function mapSchedule(row: Record<string, unknown>): InvestmentSchedule {
    return {
        ...(row as unknown as InvestmentSchedule),
        installments: toNumber(row.installments, 1),
        amount: toNumber(row.amount),
        position: toNumber(row.position),
    };
}

function mapPayment(row: Record<string, unknown>): InvestmentPayment {
    return {
        ...(row as unknown as InvestmentPayment),
        amount: toNumber(row.amount),
        correction_amount: toNumber(row.correction_amount),
        installment_number: row.installment_number == null ? null : toNumber(row.installment_number),
        pj_amount: row.pj_amount == null ? null : toNumber(row.pj_amount),
    };
}

/** The investment when it belongs to this account, else a 404 (never "forbidden": do not confirm it exists). */
export async function loadOwnedInvestment(
    supabase: AdminSupabase,
    investmentId: string,
    profileId: string
): Promise<NewInvestment> {
    if (!UUID_REGEX.test(investmentId)) throw notFound("Investimento não encontrado.");
    const { data, error } = await supabase
        .from("new_investments")
        .select(INVESTMENT_COLUMNS as "*")
        .eq("id", investmentId)
        .eq("owner_id", profileId)
        .maybeSingle();
    if (error) {
        console.error("[Investments] load failed:", error.message);
        throw new Error(`investment lookup failed: ${error.message}`);
    }
    if (!data) throw notFound("Investimento não encontrado.");
    return mapInvestment(data as Record<string, unknown>);
}

export interface InvestmentBundle {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
    documents: InvestmentDocument[];
}

export async function loadInvestmentBundle(
    supabase: AdminSupabase,
    investmentId: string,
    profileId: string
): Promise<InvestmentBundle> {
    const investment = await loadOwnedInvestment(supabase, investmentId, profileId);
    const [schedules, payments, documents] = await Promise.all([
        supabase.from("new_investment_schedules").select(SCHEDULE_COLUMNS as "*").eq("investment_id", investmentId).order("position"),
        supabase.from("new_investment_payments").select(PAYMENT_COLUMNS as "*").eq("investment_id", investmentId).order("due_on"),
        supabase.from("new_investment_documents").select(DOCUMENT_COLUMNS as "*").eq("investment_id", investmentId).order("created_at", { ascending: false }),
    ]);
    return {
        investment,
        schedules: ((schedules.data as Record<string, unknown>[] | null) ?? []).map(mapSchedule),
        payments: ((payments.data as Record<string, unknown>[] | null) ?? []).map(mapPayment),
        documents: ((documents.data as unknown as InvestmentDocument[] | null) ?? []),
    };
}

/** Every investment of the account with the rows its card needs, in one round trip each. */
export async function loadInvestmentList(supabase: AdminSupabase, profileId: string) {
    const { data, error } = await supabase
        .from("new_investments")
        .select(INVESTMENT_COLUMNS as "*")
        .eq("owner_id", profileId)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("[Investments] list failed:", error.message);
        throw new Error(`investment list failed: ${error.message}`);
    }
    const investments = ((data as Record<string, unknown>[] | null) ?? []).map(mapInvestment);
    if (investments.length === 0) {
        return { investments, schedules: [], payments: [], documentCounts: new Map<string, number>(), photoPaths: new Map<string, string[]>() };
    }

    const ids = investments.map(i => i.id);
    const [schedules, payments, documents] = await Promise.all([
        supabase.from("new_investment_schedules").select(SCHEDULE_COLUMNS as "*").in("investment_id", ids),
        supabase.from("new_investment_payments").select(PAYMENT_COLUMNS as "*").in("investment_id", ids),
        supabase
            .from("new_investment_documents")
            .select("investment_id, kind, storage_path")
            .in("investment_id", ids)
            .order("created_at", { ascending: true }),
    ]);

    // One count per card, plus the photos each card slides through (upload order).
    const documentCounts = new Map<string, number>();
    const photoPaths = new Map<string, string[]>();
    for (const row of (documents.data as { investment_id: string; kind: string; storage_path: string }[] | null) ?? []) {
        documentCounts.set(row.investment_id, (documentCounts.get(row.investment_id) ?? 0) + 1);
        if (row.kind === "PHOTO" && row.storage_path) {
            photoPaths.set(row.investment_id, [...(photoPaths.get(row.investment_id) ?? []), row.storage_path]);
        }
    }

    return {
        investments,
        schedules: ((schedules.data as Record<string, unknown>[] | null) ?? []).map(mapSchedule),
        payments: ((payments.data as Record<string, unknown>[] | null) ?? []).map(mapPayment),
        documentCounts,
        photoPaths,
    };
}

// ── Writes ───────────────────────────────────────────────────────────

/** The one-line address the `properties` row and the card show. */
export function addressLine(input: { street: string | null; street_number: string | null; neighborhood: string | null }): string | null {
    if (!input.street) return null;
    const number = input.street_number ? `, ${input.street_number}` : "";
    const neighborhood = input.neighborhood ? ` - ${input.neighborhood}` : "";
    return `${input.street}${number}${neighborhood}`;
}

/** Columns of `new_investments` from the validated body (address flattened, schedules dropped). */
export function investmentRow(input: Partial<InvestmentInput>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    const copy = [
        "name", "description", "developer", "unit_label", "kind", "city", "state",
        "total_price", "down_payment", "financed_amount", "contract_date", "keys_expected_on", "keys_delivered_on",
        "index_before_keys", "index_after_keys", "estimated_rent", "rent_start_on", "rent_adjustment_pct",
        "rent_vacancy_pct", "rent_costs_pct", "sim_horizon_months", "sim_delivery_costs_pct",
        "area_m2", "market_m2_price", "estimated_value_at_delivery", "expected_appreciation_pct", "construction_pct", "construction_updated_on",
        "strategy", "exit_plan", "sold_on", "sale_price", "sale_costs_pct",
        "status", "cover_path", "notes",
    ] as const;
    for (const key of copy) {
        if (input[key] !== undefined) row[key] = input[key];
    }
    if (input.postal_code !== undefined) row.zip = input.postal_code;
    if (input.street !== undefined || input.street_number !== undefined || input.neighborhood !== undefined) {
        row.address = addressLine({
            street: input.street ?? null,
            street_number: input.street_number ?? null,
            neighborhood: input.neighborhood ?? null,
        });
    }
    // Sent whole by the edit dialog, and then it is the address: the create form sends the parts.
    if (input.address !== undefined) row.address = input.address;
    return row;
}

export async function createInvestment(
    supabase: AdminSupabase,
    profileId: string,
    input: InvestmentInput
): Promise<InvestmentBundle> {
    const { data, error } = await supabase
        .from("new_investments")
        .insert({ ...investmentRow(input), owner_id: profileId })
        .select(INVESTMENT_COLUMNS as "*")
        .single();
    if (error || !data) throw new Error(`investment insert failed: ${error?.message}`);

    const investment = mapInvestment(data as Record<string, unknown>);
    if (input.schedules && input.schedules.length > 0) {
        await replaceSchedules(supabase, investment.id, profileId, input.schedules);
    }
    return loadInvestmentBundle(supabase, investment.id, profileId);
}

/** The quadro resumo is edited as a whole: the blocks are swapped, not patched one by one. */
export async function replaceSchedules(
    supabase: AdminSupabase,
    investmentId: string,
    profileId: string,
    schedules: ScheduleInput[]
): Promise<InvestmentSchedule[]> {
    await supabase.from("new_investment_schedules").delete().eq("investment_id", investmentId).eq("owner_id", profileId);
    if (schedules.length === 0) return [];

    const rows = schedules.map((s, index) => ({
        investment_id: investmentId,
        owner_id: profileId,
        label: s.label,
        kind: s.kind,
        installments: s.periodicity === "SINGLE" ? 1 : s.installments,
        amount: s.amount,
        first_due_on: s.first_due_on,
        periodicity: s.periodicity,
        index_code: s.index_code,
        position: index,
    }));
    const { data, error } = await supabase.from("new_investment_schedules").insert(rows).select(SCHEDULE_COLUMNS as "*");
    if (error) throw new Error(`schedule insert failed: ${error.message}`);
    return ((data as Record<string, unknown>[] | null) ?? []).map(mapSchedule);
}

/** Deletes the investment's storage objects. Called before the row goes, so nothing is orphaned. */
export async function removeInvestmentFiles(supabase: AdminSupabase, investmentId: string): Promise<void> {
    const bucket = supabase.storage.from(INVESTMENT_DOCUMENTS_BUCKET);
    const { data } = await bucket.list(investmentId, { limit: 1000 });
    const paths = (data ?? []).map(f => `${investmentId}/${f.name}`);
    if (paths.length > 0) await bucket.remove(paths);
}

/**
 * End of the incubation cycle: the unit exists, so it becomes a property in Imóveis.
 *
 * A `properties` row plus its entry in the profile JSON (createRentalProperty does both, and the
 * Imóveis page needs both). The investment is kept — it holds the payment history that says what
 * the property cost — and is marked COMPLETED with a pointer at the property it became.
 */
export async function promoteInvestment(
    supabase: AdminSupabase,
    profileId: string,
    investment: NewInvestment,
    input: PromoteInput
): Promise<{ propertyId: string; propertyName: string }> {
    const [street, rest] = (investment.address ?? "").split(" - ");
    const match = /^(.*?),\s*([^,]*)$/.exec(street ?? "");

    const property = await createRentalProperty(supabase, profileId, {
        name: (input.name?.trim() || investment.unit_label?.trim() || investment.name).slice(0, 120),
        postal_code: investment.zip,
        street: match ? match[1] : (street || null),
        street_number: match ? match[2] : null,
        address_complement: null,
        neighborhood: rest || null,
        city: investment.city,
        state: investment.state,
    });

    const { error } = await supabase
        .from("new_investments")
        .update({
            status: "COMPLETED",
            promoted_property_id: property.id,
            promoted_at: new Date().toISOString(),
            keys_delivered_on: input.keys_delivered_on ?? investment.keys_delivered_on ?? new Date().toISOString().slice(0, 10),
        })
        .eq("id", investment.id)
        .eq("owner_id", profileId);
    if (error) {
        console.error("[Investments] promote update failed:", error.message);
        throw new Error(`investment promote failed: ${error.message}`);
    }

    return { propertyId: property.id, propertyName: property.name };
}

/** 400 with the message a form shows under its file field. */
export const uploadError = (message: string) => NextResponse.json({ error: message }, { status: 400 });
