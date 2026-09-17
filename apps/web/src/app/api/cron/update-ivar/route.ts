import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { currentMonthBRT, ivarDiffers, IVAR_SOURCE_URL, parseIvarTables, planWrites, validateIvar, type IvarPoint } from '@/lib/index-sync';
import { indexIdByCode, saveSyncState, storedValues, upsertValues } from '@/lib/index-sync-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Daily IVAR sync (FGV's residential rent index).
 *
 * FGV has no public API for IVAR and the Banco Central does not carry it, so the figures come from
 * brasilindicadores.com.br, whose page has one table per year under a heading ("IVAR 2026"): month,
 * monthly %, 12-month %, year-to-date %. The year is read from that heading.
 *
 * The previous version ran only on hand-written disclosure dates (the list ended in April 2026) and
 * guessed the year from nearby text, which once stored February's figures under December 2026.
 * This one runs every day, reads every month the page shows (so it backfills), refuses the page when
 * anything looks wrong (a month that has not ended, a gap, months out of sequence, wild values) and
 * records the outcome in `index_sync_state`. A layout change therefore fails loudly instead of writing.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse('Unauthorized', { status: 401 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    const db = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const res = await fetch(IVAR_SOURCE_URL, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; Kitnets/1.0; +https://kitnets.com)' }, cache: 'no-store' });
        if (!res.ok) throw new Error(`A fonte respondeu ${res.status}`);
        const nowMonth = currentMonthBRT();
        const points = parseIvarTables(await res.text());

        const indexId = await indexIdByCode(db, 'IVAR');
        const stored = await storedValues(db, indexId, points[0]?.month ?? '2019-01');
        const latestStored = [...stored.keys()].filter(m => m < nowMonth).sort().pop() ?? null;
        const problems = validateIvar(points, nowMonth, latestStored);
        if (problems.length > 0) throw new Error(`Página recusada: ${problems.join('; ')}`);

        const current = new Map<string, IvarPoint>([...stored].map(([m, v]) => [m, { month: m, monthly: v.value, acc12m: v.acc12m }]));
        const plan = planWrites(points, current, ivarDiffers);
        const writes = [...plan.inserts, ...plan.updates];
        await upsertValues(db, indexId, writes.map(p => ({ month: p.month, value: p.monthly, acc12m: p.acc12m })), IVAR_SOURCE_URL, true);

        const latest = points[points.length - 1].month;
        const message = writes.length === 0 ? `Sem novidades; último mês ${latest}` : `${plan.inserts.length} mês(es) novo(s): ${plan.inserts.map(p => p.month).join(', ') || '—'}; ${plan.updates.length} atualizado(s): ${plan.updates.map(p => p.month).join(', ') || '—'}`;
        await saveSyncState(db, 'IVAR', writes.length === 0 ? 'unchanged' : 'ok', message, latest);
        console.log('[IVAR]', message);
        return NextResponse.json({ status: writes.length === 0 ? 'unchanged' : 'ok', inserted: plan.inserts.map(p => p.month), updated: plan.updates.map(p => p.month), latest });
    } catch (err) {
        const message = (err as Error).message;
        console.error('[IVAR] sync failed:', message);
        await saveSyncState(db, 'IVAR', 'error', message, null);
        return NextResponse.json({ status: 'error', error: message }, { status: 500 });
    }
}
