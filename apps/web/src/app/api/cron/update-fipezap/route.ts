import { refreshIndexPages } from '@/lib/index-cache';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { parseFipezapSheet, shiftMonth, validateFipezapRecords } from '@/lib/fipezap-import';
import { downloadFipezapWorkbook, fetchFipezapStamp, readFipezapNationalGrid } from '@/lib/fipezap-import-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — download (~5 MB) + streaming parse take a few seconds

/**
 * Daily FipeZap sync.
 *
 * FIPE publishes the whole history as one workbook at a fixed URL and replaces it a few times a month
 * (sale and rental figures come out on different days). Each run asks for the file's headers only and
 * stops when the ETag / Last-Modified stamp is the one already imported, so the daily schedule is cheap.
 * When the file changed: download, read the national sheet, validate, and upsert the last 12 months
 * already in the table (FIPE revises recent months) plus every newer month.
 *
 *   ?force=true   import even when the stamp did not change
 *   ?full=true    rewrite the whole history (2008 →), not only the recent window
 */
const REVISION_WINDOW_MONTHS = 12;
const CHUNK = 500;

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse('Unauthorized', { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const full = searchParams.get('full') === 'true';
    const now = new Date().toISOString();
    const saveState = async (patch: Record<string, unknown>) => {
        const { error } = await supabase.from('fipezap_sync_state').upsert({ id: 1, last_checked_at: now, ...patch }, { onConflict: 'id' });
        if (error) console.error('[FipeZap] could not save the sync state:', error.message);
    };

    try {
        const { data: state } = await supabase.from('fipezap_sync_state').select('etag, last_modified').eq('id', 1).maybeSingle();
        const stamp = await fetchFipezapStamp();
        const unchanged = Boolean(state) && (stamp.etag ? stamp.etag === state!.etag : Boolean(stamp.lastModified) && stamp.lastModified === state!.last_modified);
        if (unchanged && !force && !full) {
            await saveState({ last_status: 'unchanged', last_message: null });
            refreshIndexPages();
            return NextResponse.json({ status: 'unchanged', lastModified: stamp.lastModified });
        }

        const { buffer, stamp: fileStamp } = await downloadFipezapWorkbook();
        const records = parseFipezapSheet(await readFipezapNationalGrid(buffer));

        const { data: latestRow, error: latestErr } = await supabase.from('fipezap_series').select('reference_date').order('reference_date', { ascending: false }).limit(1).maybeSingle();
        if (latestErr) throw new Error(`Erro ao ler fipezap_series: ${latestErr.message}`);
        const dbLatest = (latestRow?.reference_date as string | undefined) ?? null;

        const problems = validateFipezapRecords(records, dbLatest);
        if (problems.length > 0) throw new Error(`Arquivo recusado: ${problems.join('; ')}`);

        const from = full || !dbLatest ? null : shiftMonth(dbLatest, -REVISION_WINDOW_MONTHS);
        const rows = (from ? records.filter(r => r.reference_date >= from) : records).map(r => ({ ...r, source: 'FIPEZAP' }));
        for (let i = 0; i < rows.length; i += CHUNK) {
            const { error } = await supabase.from('fipezap_series').upsert(rows.slice(i, i + CHUNK), { onConflict: 'reference_date,index_type,metric,dormitorios' });
            if (error) throw new Error(`Erro ao gravar fipezap_series: ${error.message}`);
        }

        const fileLatest = records.reduce((a, r) => (r.reference_date > a ? r.reference_date : a), '');
        const message = `${rows.length} valores gravados (${from ?? 'histórico completo'} → ${fileLatest}); banco estava em ${dbLatest ?? 'vazio'}`;
        await saveState({ etag: fileStamp.etag ?? stamp.etag, last_modified: fileStamp.lastModified ?? stamp.lastModified, latest_reference_date: fileLatest, last_imported_at: now, last_status: 'imported', last_message: message, rows_upserted: rows.length });
        console.log('[FipeZap]', message);
        refreshIndexPages();
        return NextResponse.json({ status: 'imported', rows: rows.length, from, latest: fileLatest, previousLatest: dbLatest });
    } catch (err) {
        const message = (err as Error).message;
        console.error('[FipeZap] sync failed:', message);
        // the stamp is NOT saved, so the next run tries the same file again
        await saveState({ last_status: 'error', last_message: message.slice(0, 500) });
        return NextResponse.json({ status: 'error', error: message }, { status: 500 });
    }
}
