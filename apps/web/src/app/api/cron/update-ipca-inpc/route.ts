
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds

// IBGE 2026 IPCA/INPC disclosure dates (YYYY-MM-DD)
// Source: https://www.ibge.gov.br/indicadores#tabela-ipca
// IBGE publishes at 9:00 BRT (12:00 UTC). This cron runs at 9:10 BRT (12:10 UTC).
const IBGE_DISCLOSURE_DATES = [
    '2026-01-10', // ref Dez/2025
    '2026-02-10', // ref Jan/2026
    '2026-03-12', // ref Feb/2026
    '2026-04-10', // ref Mar/2026
    '2026-05-12', // ref Apr/2026
    '2026-06-12', // ref May/2026
    '2026-07-10', // ref Jun/2026
    '2026-08-11', // ref Jul/2026
    '2026-09-11', // ref Aug/2026
    '2026-10-09', // ref Sep/2026
    '2026-11-12', // ref Oct/2026
    '2026-12-11', // ref Nov/2026
    '2027-01-12', // ref Dez/2026
];

// IBGE SIDRA API endpoints
const SIDRA_IPCA_URL =
    'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63,69,2265/p/last%201/d/v63%202,v69%202,v2265%202';
const SIDRA_INPC_URL =
    'https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/44,68,2292/p/last%201/d/v44%202,v68%202,v2292%202';

// Variable codes per index
const VAR_CODES = {
    IPCA: { monthly: '63', ytd: '69', acc12m: '2265' },
    INPC: { monthly: '44', ytd: '68', acc12m: '2292' },
};

interface SidraRow {
    V: string;
    D2C: string;
    D2N: string;
    D3C: string;
    D3N: string;
    [key: string]: string;
}

interface ParsedData {
    year: number;
    month: number;
    monthly: number;
    ytd: number;
    acc12m: number;
    periodLabel: string;
}

function parseSidraResponse(rows: SidraRow[], varCodes: { monthly: string; ytd: string; acc12m: string }): ParsedData {
    // First row is always the header, skip it
    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
        throw new Error('No data rows in SIDRA response');
    }

    const period = dataRows[0].D3C; // e.g. "202601"
    const periodLabel = dataRows[0].D3N; // e.g. "janeiro 2026"
    const year = parseInt(period.slice(0, 4));
    const month = parseInt(period.slice(4, 6));

    let monthly = 0, ytd = 0, acc12m = 0;

    for (const row of dataRows) {
        const val = parseFloat(row.V);
        if (isNaN(val)) continue;

        if (row.D2C === varCodes.monthly) monthly = val;
        if (row.D2C === varCodes.ytd) ytd = val;
        if (row.D2C === varCodes.acc12m) acc12m = val;
    }

    return { year, month, monthly, ytd, acc12m, periodLabel };
}

async function fetchSidraData(url: string, indexName: string): Promise<SidraRow[]> {
    console.log(`[${indexName}] Fetching from SIDRA: ${url}`);

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`[${indexName}] SIDRA API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length < 2) {
        throw new Error(`[${indexName}] SIDRA API returned unexpected data format`);
    }

    return data as SidraRow[];
}

async function upsertIndexData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    indexCode: string,
    parsed: ParsedData,
    sourceUrl: string
): Promise<{ action: string; message: string }> {
    // Get Index ID
    const { data: indexData, error: indexError } = await supabase
        .from('economic_indexes')
        .select('id')
        .eq('code', indexCode)
        .single();

    if (indexError || !indexData) {
        throw new Error(`[${indexCode}] Index not found in database: ${indexError?.message}`);
    }

    const indexId = indexData.id;

    // Check if this month's data already exists
    const { data: existingData, error: existingError } = await supabase
        .from('economic_index_values')
        .select('id, value_percent, accumulated_12m')
        .eq('index_id', indexId)
        .eq('year', parsed.year)
        .eq('month', parsed.month)
        .single();

    if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
    }

    const referenceDate = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`;

    if (existingData) {
        // Check if values need update
        if (
            existingData.value_percent === parsed.monthly &&
            existingData.accumulated_12m === parsed.acc12m
        ) {
            const msg = `[${indexCode}] ${parsed.month}/${parsed.year} already up to date (${parsed.monthly}%, 12m: ${parsed.acc12m}%)`;
            console.log(msg);
            return { action: 'skipped', message: msg };
        }

        // Update existing record
        const { error: updateError } = await supabase
            .from('economic_index_values')
            .update({
                value_percent: parsed.monthly,
                accumulated_12m: parsed.acc12m,
                reference_date: referenceDate,
                is_projection: false,
                source_url: sourceUrl,
            })
            .eq('id', existingData.id);

        if (updateError) throw updateError;

        const msg = `[${indexCode}] ${parsed.month}/${parsed.year} updated: ${parsed.monthly}% (12m: ${parsed.acc12m}%)`;
        console.log(msg);
        return { action: 'updated', message: msg };
    }

    // Insert new record
    const { error: insertError } = await supabase
        .from('economic_index_values')
        .insert({
            index_id: indexId,
            year: parsed.year,
            month: parsed.month,
            reference_date: referenceDate,
            value_percent: parsed.monthly,
            accumulated_12m: parsed.acc12m,
            is_projection: false,
            source_url: sourceUrl,
        });

    if (insertError) throw insertError;

    const msg = `[${indexCode}] ${parsed.month}/${parsed.year} inserted: ${parsed.monthly}% (12m: ${parsed.acc12m}%)`;
    console.log(msg);
    return { action: 'inserted', message: msg };
}

export async function GET(request: NextRequest) {
    // Authentication
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if today is a disclosure date (or force mode)
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // Use BRT (UTC-3) to determine today's date
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBRT = brt.toISOString().slice(0, 10); // YYYY-MM-DD in BRT

    const isDisclosureDay = IBGE_DISCLOSURE_DATES.includes(todayBRT);

    if (!isDisclosureDay && !force) {
        console.log(`[IPCA/INPC] Not a disclosure day (${todayBRT}). Skipping.`);
        return NextResponse.json({
            success: true,
            action: 'not-disclosure-day',
            date: todayBRT,
            message: `Today (${todayBRT}) is not an IBGE disclosure date. Use ?force=true to override.`,
            nextDates: IBGE_DISCLOSURE_DATES.filter(d => d >= todayBRT).slice(0, 3),
        });
    }

    console.log(`[IPCA/INPC] ${force ? 'FORCE mode' : 'Disclosure day'} — processing (${todayBRT})`);

    // Validate Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json(
            { success: false, error: 'Missing Supabase credentials' },
            { status: 500 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, unknown> = {
        date: todayBRT,
        forced: force,
    };

    // --- IPCA ---
    try {
        const ipcaRows = await fetchSidraData(SIDRA_IPCA_URL, 'IPCA');
        const ipcaParsed = parseSidraResponse(ipcaRows, VAR_CODES.IPCA);
        console.log(`[IPCA] Parsed: ${ipcaParsed.periodLabel} → monthly=${ipcaParsed.monthly}%, 12m=${ipcaParsed.acc12m}%`);

        const ipcaResult = await upsertIndexData(supabase, 'IPCA', ipcaParsed, SIDRA_IPCA_URL);
        results.ipca = {
            success: true,
            ...ipcaResult,
            data: {
                period: `${ipcaParsed.month}/${ipcaParsed.year}`,
                label: ipcaParsed.periodLabel,
                monthly: ipcaParsed.monthly,
                ytd: ipcaParsed.ytd,
                acc12m: ipcaParsed.acc12m,
            },
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[IPCA] Error:`, errMsg);
        results.ipca = { success: false, error: errMsg };
    }

    // --- INPC ---
    try {
        const inpcRows = await fetchSidraData(SIDRA_INPC_URL, 'INPC');
        const inpcParsed = parseSidraResponse(inpcRows, VAR_CODES.INPC);
        console.log(`[INPC] Parsed: ${inpcParsed.periodLabel} → monthly=${inpcParsed.monthly}%, 12m=${inpcParsed.acc12m}%`);

        const inpcResult = await upsertIndexData(supabase, 'INPC', inpcParsed, SIDRA_INPC_URL);
        results.inpc = {
            success: true,
            ...inpcResult,
            data: {
                period: `${inpcParsed.month}/${inpcParsed.year}`,
                label: inpcParsed.periodLabel,
                monthly: inpcParsed.monthly,
                ytd: inpcParsed.ytd,
                acc12m: inpcParsed.acc12m,
            },
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[INPC] Error:`, errMsg);
        results.inpc = { success: false, error: errMsg };
    }

    // Determine overall success
    const ipcaOk = (results.ipca as Record<string, unknown>)?.success === true;
    const inpcOk = (results.inpc as Record<string, unknown>)?.success === true;

    return NextResponse.json(
        { success: ipcaOk && inpcOk, ...results },
        { status: ipcaOk && inpcOk ? 200 : 207 } // 207 Multi-Status if partial failure
    );
}
