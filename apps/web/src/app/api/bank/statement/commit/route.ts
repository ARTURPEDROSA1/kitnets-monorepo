import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX, type AdminSupabase } from "@/lib/api-auth";
import { routingProblem, type BankDestination, type BankSource } from "@/lib/bank-ledger";
import { BANK_TABLE, loadBankRows } from "@/lib/bank-ledger-server";
import { TRANSACTION_KIND_VALUES, type TransactionKind } from "@/lib/property-investment";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: BankSource[] = ["OFX", "CSV", "PDF", "API"];
const DESTS: BankDestination[] = ["INVESTMENT", "INCOME", "IGNORED"];

interface CommitRow {
    date: string; amount: number; memo: string; reference: string; source: BankSource;
    destination: BankDestination; property_id: string | null; kind: TransactionKind | null; bank?: string | null;
}

function validate(raw: unknown, i: number): { row: CommitRow } | { error: string } {
    if (!raw || typeof raw !== "object") return { error: `Linha ${i + 1}: formato inválido` };
    const r = raw as Record<string, unknown>;
    if (typeof r.date !== "string" || !ISO_DATE.test(r.date)) return { error: `Linha ${i + 1}: data inválida` };
    const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
    if (!Number.isFinite(amount) || amount === 0) return { error: `Linha ${i + 1}: valor inválido` };
    const reference = typeof r.reference === "string" && r.reference.trim() ? r.reference.trim().slice(0, 120) : null;
    if (!reference) return { error: `Linha ${i + 1}: referência ausente` };
    const source = SOURCES.includes(r.source as BankSource) ? (r.source as BankSource) : "CSV";
    const destination = DESTS.includes(r.destination as BankDestination) ? (r.destination as BankDestination) : "IGNORED";
    const property_id = typeof r.property_id === "string" && UUID_REGEX.test(r.property_id) ? r.property_id : null;
    const kind = typeof r.kind === "string" && TRANSACTION_KIND_VALUES.includes(r.kind as TransactionKind) ? (r.kind as TransactionKind) : null;
    const row: CommitRow = { date: r.date, amount: Math.round(amount * 100) / 100, memo: String(r.memo ?? "").trim().slice(0, 500), reference, source, destination, property_id, kind, bank: typeof r.bank === "string" ? r.bank.slice(0, 80) : null };
    const problem = routingProblem({ ...row, duplicate: false });
    if (problem) return { error: `Linha ${i + 1} (${row.memo.slice(0, 40)}): ${problem}` };
    return { row };
}

async function ownsProperty(supabase: AdminSupabase, ownerId: string, propertyId: string): Promise<boolean> {
    const { data } = await supabase.from("properties").select("id").eq("id", propertyId).eq("owner_id", ownerId).maybeSingle();
    return Boolean(data);
}

/** Inflow → the property's income month: adds to a BANK month, replaces a hand-entered amount, or creates the month. */
async function routeIncome(supabase: AdminSupabase, ownerId: string, row: CommitRow): Promise<string | null> {
    const month = `${row.date.slice(0, 7)}-01`;
    const { data: existing } = await supabase.from("property_income_months").select("id, received_amount, source, agency_fee_pct").eq("property_id", row.property_id!).eq("month", month).is("unit_id", null).maybeSingle();
    let feePct = 0;
    if (!existing) {
        const { data: last } = await supabase.from("property_income_months").select("agency_fee_pct").eq("property_id", row.property_id!).order("month", { ascending: false }).limit(1).maybeSingle();
        feePct = Number(last?.agency_fee_pct) || 0;
    }
    const received = existing && existing.source === "BANK" ? Math.round(((Number(existing.received_amount) || 0) + row.amount) * 100) / 100 : row.amount;
    const record = {
        property_id: row.property_id!, owner_id: ownerId, month, unit_id: null,   // bank inflows are not tied to a unit
        received_amount: received, received_on: row.date, status: "CONFIRMED", source: "BANK", bank_reference: row.reference,
        ...(existing ? {} : { energy_portion: 0, other_income: 0, other_expenses: 0, iptu_amount: 0, agency_fee_pct: feePct, notes: row.memo.slice(0, 200) }),
    };
    const { data, error } = await supabase.from("property_income_months").upsert(record, { onConflict: "property_id,month,unit_id" }).select("id").single();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
}

async function routeInvestment(supabase: AdminSupabase, ownerId: string, row: CommitRow): Promise<string | null> {
    const { data, error } = await supabase.from("property_transactions").insert({
        property_id: row.property_id!, owner_id: ownerId, occurred_on: row.date, kind: row.kind!, amount: Math.abs(row.amount),
        comment: row.memo || null, source: "BANK", bank_reference: row.reference,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
}

/**
 * POST /api/bank/statement/commit  body: { rows: CommitRow[] }
 * → { imported, skipped, income, investment, ignored, rows }
 * Writes each row once to the bank ledger and routes it to the property ledgers.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { rows?: unknown[] };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const raw = Array.isArray(body.rows) ? body.rows : [];
    if (raw.length === 0 || raw.length > 1000) return NextResponse.json({ error: "Envie entre 1 e 1000 lançamentos" }, { status: 400 });
    const rows: CommitRow[] = [];
    for (let i = 0; i < raw.length; i++) {
        const v = validate(raw[i], i);
        if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
        rows.push(v.row);
    }
    const propertyIds = [...new Set(rows.map(r => r.property_id).filter((x): x is string => Boolean(x)))];
    for (const pid of propertyIds) {
        if (!(await ownsProperty(supabase, profileId, pid))) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }

    const { data: existing } = await supabase.from(BANK_TABLE).select("reference").eq("owner_id", profileId).in("reference", rows.map(r => r.reference));
    const seen = new Set((existing ?? []).map(e => e.reference));
    const counts = { imported: 0, skipped: 0, income: 0, investment: 0, ignored: 0 };
    try {
        for (const row of rows) {
            if (seen.has(row.reference)) { counts.skipped++; continue; }
            let linked: string | null = null;
            if (row.destination === "INCOME") { linked = await routeIncome(supabase, profileId, row); counts.income++; }
            else if (row.destination === "INVESTMENT") { linked = await routeInvestment(supabase, profileId, row); counts.investment++; }
            else counts.ignored++;
            const { error } = await supabase.from(BANK_TABLE).insert({
                owner_id: profileId, occurred_on: row.date, amount: row.amount, memo: row.memo, reference: row.reference, source: row.source, bank: row.bank ?? null,
                destination: row.destination, property_id: row.property_id, kind: row.kind, linked_id: linked,
            });
            if (error) throw new Error(error.message);
            seen.add(row.reference);
            counts.imported++;
        }
        return NextResponse.json({ ...counts, rows: await loadBankRows(supabase, profileId, 200) });
    } catch (err) {
        console.error("[Bank commit]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao importar lançamentos", ...counts }, { status: 500 });
    }
}
