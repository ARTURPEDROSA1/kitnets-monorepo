import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { BCB_SERIES, bcbSeriesUrl, completedMonths, currentMonthBRT, minimumWageChanges, parseBcbSeries, planWrites, rateDiffers, validateRates, type MonthPoint } from '@/lib/index-sync';
import { indexIdByCode, saveSyncState, storedValues, upsertValues } from '@/lib/index-sync-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily sync of the indexes the Banco Central publishes: CDI, Selic and the minimum wage.
 *
 * CDI / Selic: reads the last 24 months, keeps only months that have ended (the running month is a partial
 * figure that grows every business day), inserts the missing ones and corrects stored values that differ
 * beyond rounding. Minimum wage: inserts a row for each month the amount changed after the latest row in
 * the table; the decree number is not in the series and stays empty for the owner to fill in.
 *
 * Each index is independent: one failing does not stop the others. The outcome is kept in `index_sync_state`.
 */
const MONTHS_BACK = 24;
const RATE_INDEXES: Array<{ code: 'CDI' | 'SELIC'; series: number }> = [{ code: 'CDI', series: BCB_SERIES.CDI }, { code: 'SELIC', series: BCB_SERIES.SELIC }];

async function fetchSeries(series: number, monthsBack: number): Promise<MonthPoint[]> {
    const res = await fetch(bcbSeriesUrl(series, monthsBack), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`Banco Central respondeu ${res.status} para a série ${series}`);
    return parseBcbSeries(await res.json());
}

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse('Unauthorized', { status: 401 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const nowMonth = currentMonthBRT();
    const results: Record<string, unknown> = {};
    let failed = false;

    for (const { code, series } of RATE_INDEXES) {
        const job = `BCB_${code}`;
        try {
            const points = completedMonths(await fetchSeries(series, MONTHS_BACK), nowMonth);
            if (points.length === 0) throw new Error('Nenhum mês encerrado na resposta');
            const problems = validateRates(points, code);
            if (problems.length > 0) throw new Error(problems.join('; '));
            const indexId = await indexIdByCode(db, code);
            const stored = await storedValues(db, indexId, points[0].month);
            const plan = planWrites(points, new Map([...stored].map(([m, v]) => [m, { month: m, value: v.value }])), rateDiffers);
            const writes = [...plan.inserts, ...plan.updates];
            await upsertValues(db, indexId, writes, bcbSeriesUrl(series, MONTHS_BACK), false);
            const latest = points[points.length - 1].month;
            const message = writes.length === 0 ? `Sem novidades; último mês ${latest}` : `${plan.inserts.length} mês(es) novo(s): ${plan.inserts.map(p => p.month).join(', ') || '—'}; ${plan.updates.length} corrigido(s): ${plan.updates.map(p => `${p.month}=${p.value}`).join(', ') || '—'}`;
            await saveSyncState(db, job, writes.length === 0 ? 'unchanged' : 'ok', message, latest);
            results[code] = { inserted: plan.inserts.map(p => p.month), corrected: plan.updates.map(p => p.month), latest };
        } catch (err) {
            failed = true;
            const message = (err as Error).message;
            console.error(`[${job}]`, message);
            await saveSyncState(db, job, 'error', message, null);
            results[code] = { error: message };
        }
    }

    try {
        const points = await fetchSeries(BCB_SERIES.MINIMUM_WAGE, MONTHS_BACK);
        const { data: latestRow, error } = await db.from('minimum_wage_history').select('reference_date, amount_brl').eq('is_projection', false).order('reference_date', { ascending: false }).limit(1).maybeSingle();
        if (error) throw new Error(`Erro ao ler minimum_wage_history: ${error.message}`);
        const rows = minimumWageChanges(points, latestRow ? { reference_date: String(latestRow.reference_date), amount_brl: Number(latestRow.amount_brl) } : null, nowMonth);
        const wild = rows.find(r => r.variation_percent !== null && (r.variation_percent <= 0 || r.variation_percent > 30));
        if (wild) throw new Error(`Variação fora da faixa em ${wild.reference_date}: ${wild.variation_percent}%`);
        if (rows.length > 0) {
            const { error: insErr } = await db.from('minimum_wage_history').upsert(
                rows.map(r => ({ ...r, legislation: null, remarks: 'Inserido automaticamente (Banco Central, série 1619). Preencha o decreto.', is_projection: false })),
                { onConflict: 'reference_date', ignoreDuplicates: true },
            );
            if (insErr) throw new Error(`Erro ao gravar minimum_wage_history: ${insErr.message}`);
        }
        const current = points.length ? points[points.length - 1] : null;
        const message = rows.length === 0 ? `Sem mudança; valor vigente R$ ${current?.value ?? '—'}` : rows.map(r => `${r.reference_date}: R$ ${r.amount_brl} (${r.variation_percent}%)`).join('; ');
        await saveSyncState(db, 'BCB_MINIMUM_WAGE', rows.length === 0 ? 'unchanged' : 'ok', message, current?.month ?? null);
        results.MINIMUM_WAGE = { inserted: rows, current: current?.value ?? null };
    } catch (err) {
        failed = true;
        const message = (err as Error).message;
        console.error('[BCB_MINIMUM_WAGE]', message);
        await saveSyncState(db, 'BCB_MINIMUM_WAGE', 'error', message, null);
        results.MINIMUM_WAGE = { error: message };
    }

    return NextResponse.json({ status: failed ? 'partial' : 'ok', results }, { status: failed ? 500 : 200 });
}
