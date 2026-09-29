import { NextResponse } from "next/server";
import { requireProfile, UUID_REGEX } from "@/lib/api-auth";
import { resolveAnswer } from "@/lib/accounting-bank-posting";
import { bankContext, loadBankRowsForPosting, postBankRows, postedBankEntries, viewRows } from "@/lib/accounting-bank-server";
import { chunk } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;   // hundreds of rows on the first run

/**
 * POST /api/accounting/bank/accept  body: { ids?: string[] } → { accepted, summary }
 * Accepts the preselected answer of every open question (or of the given rows) and posts
 * them — for the first import of many months, where most questions repeat.
 */
export async function POST(request: Request) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;
    let body: { ids?: unknown } = {};
    try { body = await request.json(); } catch { /* no body: all questions */ }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID_REGEX.test(x)) : undefined;

    try {
        const ctx = await bankContext(supabase, profileId);
        const rows = await loadBankRowsForPosting(supabase, profileId, ids);
        const posted = await postedBankEntries(supabase, profileId, ctx.bankAccountId, ids);
        const questions = viewRows(rows, posted, ctx).filter(r => r.status === "QUESTION" && r.suggestedOptionId);

        // one update per answer, over slices of rows
        const byAnswer = new Map<string, { accountId: string; optionId: string | null; ids: string[] }>();
        for (const r of questions) {
            const a = resolveAnswer(r.amount, { option: r.suggestedOptionId }, ctx.suggest);
            if ("error" in a) continue;
            const key = `${a.accountId}|${a.optionId}`;
            if (!byAnswer.has(key)) byAnswer.set(key, { ...a, ids: [] });
            byAnswer.get(key)!.ids.push(r.id);
        }
        const accepted: string[] = [];
        for (const g of byAnswer.values()) {
            for (const part of chunk(g.ids)) {
                const { error } = await supabase.from("bank_transactions").update({ account_id: g.accountId, account_option: g.optionId }).eq("owner_id", profileId).in("id", part);
                if (error) throw new Error(error.message);
                accepted.push(...part);
            }
        }
        const summary = accepted.length ? await postBankRows(supabase, profileId, { ids: accepted }) : { posted: 0, questions: 0, closedMonth: 0, beforeOpening: 0, errors: [] };
        return NextResponse.json({ accepted: accepted.length, summary });
    } catch (err) {
        console.error("[Accounting bank accept]", (err as Error).message);
        return NextResponse.json({ error: "Erro ao aceitar as sugestões" }, { status: 500 });
    }
}
