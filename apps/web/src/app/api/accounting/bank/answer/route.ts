import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { resolveAnswer } from "@/lib/accounting-bank-posting";
import { bankContext, loadBankRowsForPosting, postBankRows, postedBankEntries, unpostBankRow, viewRows } from "@/lib/accounting-bank-server";
import { monthOf } from "@/lib/accounting-journal";

export const dynamic = "force-dynamic";

/**
 * POST /api/accounting/bank/answer  body: { id, option? , account_id? } → { row, summary }
 * The owner's answer (a plain-language option) or the contador's account for a bank row.
 * A row already posted is reclassified: its entry is removed and posted again — only while
 * its month is open. The answer is remembered for rows with the same memo.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { id?: string; option?: string | null; account_id?: string | null };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 }); }
    if (!body.id || !UUID_REGEX.test(body.id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    try {
        const ctx = await bankContext(supabase, profileId);
        const [row] = await loadBankRowsForPosting(supabase, profileId, [body.id]);
        if (!row) return NextResponse.json({ error: "Lançamento do extrato não encontrado" }, { status: 404 });
        if (row.occurred_on < ctx.settings.opening_date) return NextResponse.json({ error: "Este lançamento é anterior ao início da escrituração: ele está no saldo de abertura" }, { status: 409 });
        if (ctx.closed.has(monthOf(row.occurred_on))) return NextResponse.json({ error: "O mês deste lançamento está fechado: reabra o mês ou faça um lançamento de reclassificação" }, { status: 409 });

        const r = resolveAnswer(row.amount, { option: body.option ?? null, account_id: body.account_id ?? null }, ctx.suggest);
        if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });

        const undone = await unpostBankRow(supabase, profileId, row.id);
        if ("error" in undone) return NextResponse.json({ error: undone.error }, { status: 409 });

        const { error } = await supabase.from("bank_transactions").update({ account_id: r.accountId, account_option: r.optionId }).eq("id", row.id).eq("owner_id", profileId);
        if (error) throw new Error(error.message);

        const summary = await postBankRows(supabase, profileId, { ids: [row.id] });
        if (summary.errors.length) return NextResponse.json({ error: summary.errors[0] }, { status: 400 });

        const fresh = await bankContext(supabase, profileId);
        const [updated] = await loadBankRowsForPosting(supabase, profileId, [row.id]);
        const posted = await postedBankEntries(supabase, profileId, fresh.bankAccountId, [row.id]);
        return NextResponse.json({ row: viewRows([updated], posted, fresh)[0], summary });
    } catch (err) {
        console.error("[Accounting bank answer]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao registrar a resposta" }, { status: 500 });
    }
}
