import { refreshIndexPages } from '@/lib/index-cache';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { applyRetention, latestMonth, MIN_CITY_SHEETS, parseFipezapSheet, retentionCutoff, shiftMonth, validateFipezapWorkbook, type FipezapRecord } from '@/lib/fipezap-import';
import { downloadFipezapWorkbook, fetchFipezapStamp, readFipezapGrids } from '@/lib/fipezap-import-server';
import { FIPEZAP_CITIES, FIPEZAP_NATIONAL_SLUG, fipezapCityBySheetTitle } from '@/lib/fipezap-cities';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds — a full backfill of 37 sheets writes ~165k rows

/**
 * Daily FipeZap sync: the national index plus the 36 catalogued cities (fipezap-cities.ts).
 *
 * FIPE publishes the whole history as one workbook at a fixed URL and replaces it a few times a month
 * (sale and rental figures come out on different days). Each run asks for the file's headers only and
 * stops when the ETag / Last-Modified stamp is the one already imported, so the daily schedule is cheap.
 * When the file changed: download, read the catalogued sheets, keep the last RETENTION_MONTHS months,
 * validate (the national sheet is mandatory; a bad city is skipped and reported), upsert the last
 * 12 months already in the table (FIPE revises recent months) plus every newer month, then delete
 * whatever fell out of the 15-year window.
 *
 *   ?force=true          import even when the stamp did not change
 *   ?full=true           rewrite the whole window (not only the recent months)
 *   ?cities=a,b          only these city slugs (the national sheet is always included) — for staging a backfill
 */
const REVISION_WINDOW_MONTHS = 12;
const CHUNK = 1000;
const CONCURRENCY = 4;

type Upsertable = FipezapRecord & { source: string };

async function upsertRows(supabase: SupabaseClient, rows: Upsertable[]): Promise<void> {
    const chunks: Upsertable[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const results = await Promise.all(chunks.slice(i, i + CONCURRENCY).map(chunk =>
            supabase.from('fipezap_series').upsert(chunk, { onConflict: 'city_slug,reference_date,index_type,metric,dormitorios' })));
        const failed = results.find(r => r.error);
        if (failed?.error) throw new Error(`Erro ao gravar fipezap_series: ${failed.error.message}`);
    }
}

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return new NextResponse('Unauthorized', { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const full = searchParams.get('full') === 'true';
    const cityFilter = searchParams.get('cities')?.split(',').map(s => s.trim()).filter(Boolean) ?? null;
    const now = new Date().toISOString();
    const started = Date.now();
    const timings: Record<string, number> = {};
    let mark = started;
    const lap = (phase: string) => { const t = Date.now(); timings[phase] = t - mark; mark = t; };
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

        // which sheets to read: the national one always, the cities unless ?cities= narrows them
        const wanted = FIPEZAP_CITIES.filter(c => c.slug === FIPEZAP_NATIONAL_SLUG || !cityFilter || cityFilter.includes(c.slug));
        const wantedSlugs = new Set(wanted.map(c => c.slug));
        const unknownFilter = cityFilter?.filter(s => !FIPEZAP_CITIES.some(c => c.slug === s)) ?? [];
        if (unknownFilter.length) return NextResponse.json({ status: 'error', error: `cidades desconhecidas: ${unknownFilter.join(', ')}` }, { status: 400 });

        const { buffer, stamp: fileStamp } = await downloadFipezapWorkbook();
        lap('download');
        const grids = await readFipezapGrids(buffer, title => { const c = fipezapCityBySheetTitle(title); return Boolean(c && wantedSlugs.has(c.slug)); });
        lap('read');

        const parsed = new Map<string, FipezapRecord[]>();
        const parseErrors: string[] = [];
        for (const sheet of grids) {
            const city = fipezapCityBySheetTitle(sheet.title)!;
            try {
                parsed.set(city.slug, parseFipezapSheet(sheet.grid, { citySlug: city.slug, strict: city.slug === FIPEZAP_NATIONAL_SLUG }));
            } catch (err) {
                if (city.slug === FIPEZAP_NATIONAL_SLUG) throw err;
                parseErrors.push(`${city.slug}: ${(err as Error).message}`);
            }
        }
        const national = parsed.get(FIPEZAP_NATIONAL_SLUG);
        if (!national?.length) throw new Error('Planilha nacional (“Índice FipeZAP”) não encontrada no arquivo da FIPE');

        // the 15-year window is anchored on the newest national month
        const fileLatest = latestMonth(national);
        const cutoff = retentionCutoff(fileLatest);
        for (const [slug, records] of parsed) parsed.set(slug, applyRetention(records, cutoff));
        lap('parse');

        // newest month already stored, per slug (national drives the revision window)
        const { data: latestRows, error: latestErr } = await supabase.from('vw_fipezap_latest').select('city_slug, reference_date')
            .eq('index_type', 'venda').eq('metric', 'var_mensal').eq('dormitorios', 'total');
        if (latestErr) throw new Error(`Erro ao ler vw_fipezap_latest: ${latestErr.message}`);
        const dbLatestBySlug = new Map<string, string | null>((latestRows ?? []).map(r => [r.city_slug as string, r.reference_date as string]));
        const dbLatest = dbLatestBySlug.get(FIPEZAP_NATIONAL_SLUG) ?? null;

        const citySlugs = wanted.filter(c => c.slug !== FIPEZAP_NATIONAL_SLUG).map(c => c.slug);
        const validation = validateFipezapWorkbook(parsed, dbLatestBySlug, { nationalSlug: FIPEZAP_NATIONAL_SLUG, citySlugs, minCities: cityFilter ? 0 : MIN_CITY_SHEETS });
        if (validation.fatal.length > 0) throw new Error(`Arquivo recusado: ${validation.fatal.join('; ')}`);
        for (const [slug, problems] of validation.skipped) parseErrors.push(`${slug}: ${problems.join('; ')}`);
        lap('validate');

        // recent window: the last 12 stored months (revisions) plus everything newer; never before the cutoff
        const from = full || !dbLatest ? cutoff : (shiftMonth(dbLatest, -REVISION_WINDOW_MONTHS) > cutoff ? shiftMonth(dbLatest, -REVISION_WINDOW_MONTHS) : cutoff);
        const rows: Upsertable[] = [];
        for (const slug of validation.accepted) for (const r of parsed.get(slug)!) if (r.reference_date >= from) rows.push({ ...r, source: 'FIPEZAP' });
        await upsertRows(supabase, rows);
        lap('upsert');

        // rows that fell out of the window (national included)
        const { error: delErr, count: deleted } = await supabase.from('fipezap_series').delete({ count: 'exact' }).lt('reference_date', cutoff);
        if (delErr) throw new Error(`Erro ao apagar meses antigos: ${delErr.message}`);
        lap('prune');

        const cities = validation.accepted.length - 1;
        const skippedNote = parseErrors.length ? ` Ignoradas: ${parseErrors.join(' | ')}` : '';
        const message = `${rows.length} valores gravados (${from} → ${fileLatest}) para ${cities} cidades + Brasil; ${deleted ?? 0} apagados antes de ${cutoff}; banco estava em ${dbLatest ?? 'vazio'}.${skippedNote}`;
        await saveState({
            etag: fileStamp.etag ?? stamp.etag, last_modified: fileStamp.lastModified ?? stamp.lastModified, latest_reference_date: fileLatest,
            last_imported_at: now, last_status: 'imported', last_message: message.slice(0, 2000), rows_upserted: rows.length, retention_cutoff: cutoff, rows_deleted: deleted ?? 0,
        });
        console.log('[FipeZap]', message);
        refreshIndexPages();
        return NextResponse.json({
            status: 'imported', rows: rows.length, deleted: deleted ?? 0, from, cutoff, latest: fileLatest, previousLatest: dbLatest,
            cities: { accepted: cities, skipped: parseErrors }, durationMs: Date.now() - started, timings,
        });
    } catch (err) {
        const message = (err as Error).message;
        console.error('[FipeZap] sync failed:', message);
        // the stamp is NOT saved, so the next run tries the same file again
        await saveState({ last_status: 'error', last_message: message.slice(0, 500) });
        return NextResponse.json({ status: 'error', error: message, durationMs: Date.now() - started, timings }, { status: 500 });
    }
}
