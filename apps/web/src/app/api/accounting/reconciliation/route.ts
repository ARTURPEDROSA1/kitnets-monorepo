import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { isValidIsoDate } from "@/lib/accounting-journal";
import { bankBookBalance, bankContext, loadBankRowsForPosting, postedBankEntries, viewRows } from "@/lib/accounting-bank-server";
import { actorName } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";

async function state(supabase: Parameters<typeof bankContext>[0], ownerId: string, asOf: string) {
    const ctx = await bankContext(supabase, ownerId);
    const [balance, rows, posted] = await Promise.all([
        bankBookBalance(supabase, ownerId, ctx.bankAccountId, asOf),
        loadBankRowsForPosting(supabase, ownerId),
        postedBankEntries(supabase, ownerId, ctx.bankAccountId),
    ]);
    const unposted = viewRows(rows, posted, ctx).filter(r => r.status !== "POSTED" && r.status !== "BEFORE_OPENING" && r.occurred_on <= asOf);
    return { bookBalance: balance, unposted };
}

/**
 * GET /api/accounting/reconciliation?as_of=YYYY-MM-DD
 * → { asOf, bookBalance, unposted, history }
 * Book balance of the bank account at a date and the statement rows up to that date not in
 * the books yet — what explains a difference with the bank's own balance.
 */
export async function GET(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    const param = new URL(request.url).searchParams.get("as_of");
    const asOf = param && isValidIsoDate(param) ? param : new Date().toISOString().slice(0, 10);
    try {
        const [{ bookBalance, unposted }, history] = await Promise.all([
            state(supabase, profileId, asOf),
            supabase.from("bank_reconciliations").select("as_of, statement_balance, book_balance, unposted_rows, note, created_by, updated_at").eq("owner_id", profileId).order("as_of", { ascending: false }).limit(24),
        ]);
        return NextResponse.json({ asOf, bookBalance, unposted, history: history.data ?? [] });
    } catch (err) {
        console.error("[Accounting reconciliation GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao calcular o saldo contábil" }, { status: 500 });
    }
}

/**
 * POST /api/accounting/reconciliation  body: { as_of, statement_balance, note? } → { reconciliation }
 * Records the conferência: the bank's balance, the book balance computed now and how many
 * statement rows were still out of the books.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { as_of?: string; statement_balance?: number; note?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    const asOf = String(body.as_of ?? "");
    const statement = Number(body.statement_balance);
    if (!isValidIsoDate(asOf)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    if (!Number.isFinite(statement)) return NextResponse.json({ error: "Informe o saldo do extrato" }, { status: 400 });
    try {
        const [{ bookBalance, unposted }, actor] = await Promise.all([state(supabase, profileId, asOf), actorName(supabase, profileId)]);
        const row = {
            owner_id: profileId, as_of: asOf, statement_balance: Math.round(statement * 100) / 100, book_balance: bookBalance,
            unposted_rows: unposted.length, note: body.note ? String(body.note).trim().slice(0, 300) || null : null, created_by: actor,
        };
        const { data, error } = await supabase.from("bank_reconciliations").upsert(row, { onConflict: "owner_id,as_of" })
            .select("as_of, statement_balance, book_balance, unposted_rows, note, created_by, updated_at").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ reconciliation: data });
    } catch (err) {
        console.error("[Accounting reconciliation POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao registrar a conferência" }, { status: 500 });
    }
}
