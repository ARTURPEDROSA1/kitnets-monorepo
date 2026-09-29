import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/api-auth";
import { BANK_OPTIONS, type BankRowStatus } from "@/lib/accounting-bank-posting";
import { bankContext, loadBankRowsForPosting, postBankRows, postedBankEntries, viewRows } from "@/lib/accounting-bank-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;   // hundreds of rows on the first run

/**
 * GET /api/accounting/bank
 * → { rows, summary, options, accounts, properties, openingDate }
 * The bank ledger as the books see it: posted, ready to post, a question for the owner,
 * before the opening date or in a closed month.
 */
export async function GET() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        const ctx = await bankContext(supabase, profileId);
        const [rows, posted, props] = await Promise.all([
            loadBankRowsForPosting(supabase, profileId),
            postedBankEntries(supabase, profileId, ctx.bankAccountId),
            supabase.from("properties").select("id, name").eq("owner_id", profileId).order("name"),
        ]);
        const views = viewRows(rows, posted, ctx);
        const summary = views.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Partial<Record<BankRowStatus, number>>);
        return NextResponse.json({
            rows: views,
            summary,
            options: BANK_OPTIONS,
            accounts: ctx.accounts.filter(a => a.analytic && a.active).map(a => ({ id: a.id, code: a.code, name: a.name, account_type: a.account_type })),
            allAccounts: ctx.accounts.map(a => ({ id: a.id, code: a.code, name: a.name })),
            properties: props.data ?? [],
            openingDate: ctx.settings.opening_date,
        });
    } catch (err) {
        console.error("[Accounting bank GET]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao carregar o extrato na contabilidade" }, { status: 500 });
    }
}

/** POST /api/accounting/bank → PostingSummary — posts every row that is ready. */
export async function POST() {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    try {
        return NextResponse.json(await postBankRows(supabase, profileId));
    } catch (err) {
        console.error("[Accounting bank POST]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao contabilizar o extrato" }, { status: 500 });
    }
}
