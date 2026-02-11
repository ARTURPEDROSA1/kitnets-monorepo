
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // seconds

// FGV IVAR 2026 disclosure dates (YYYY-MM-DD)
// Source: https://portalibre.fgv.br/ivar
// FGV publishes at 9:00 BRT (12:00 UTC). This cron runs at 9:10 BRT (12:10 UTC).
const FGV_DISCLOSURE_DATES = [
    '2026-02-06', // ref Jan/2026
    '2026-03-05', // ref Feb/2026
    '2026-04-08', // ref Mar/2026
    // Future dates TBD by FGV — add as they are announced
];

// FGV portal URL for IVAR results (used as source reference)
const FGV_IVAR_URL = 'https://portalibre.fgv.br/ivar';

// brasilindicadores.com.br as a fallback data source (public, structured HTML)
const FALLBACK_URL = 'https://brasilindicadores.com.br/ivar';

interface ParsedIvarData {
    year: number;
    month: number;
    monthly: number;
    acc12m: number | null;
    source: string;
}

/**
 * Attempt to parse IVAR data from brasilindicadores.com.br HTML
 * The site has a table with monthly IVAR values including the latest.
 */
async function fetchFromBrasilIndicadores(): Promise<ParsedIvarData> {
    console.log('[IVAR] Fetching from brasilindicadores.com.br...');

    const response = await fetch(FALLBACK_URL, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (compatible; Kitnets/1.0; +https://kitnets.com)',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`brasilindicadores returned ${response.status}`);
    }

    const html = await response.text();

    // Parse the latest IVAR monthly value from the HTML
    // The page has structured data with current IVAR values
    // Look for patterns like "0,65%" near "Janeiro/2026" or similar month references

    // Strategy 1: Find the "IVAR 2026" section which has a table with monthly values
    // The table rows typically contain: month name, monthly %, 12m accumulated %

    const monthNames = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    // Find the latest month's data from the 2026 table
    // Look for patterns like: >Janeiro</...>...>0,65%< or similar
    let latestMonth = 0;
    let latestYear = 0;
    let latestMonthly = NaN;
    let latestAcc12m: number | null = null;

    for (let m = 12; m >= 1; m--) {
        const monthName = monthNames[m - 1];

        // Match month name in a table cell followed by percentage values
        // Pattern: monthName ... percentage value like "0,65" or "-0,31"
        const monthRegex = new RegExp(
            monthName + '[^<]*<[^>]*>[^<]*<[^>]*>[^<]*?(-?\\d+[,.]\\d+)\\s*%?',
            'i'
        );

        const match = html.match(monthRegex);
        if (match) {
            // Determine year — check if "2026" appears nearby in the HTML before this match
            const matchIndex = html.indexOf(match[0]);
            const contextBefore = html.substring(Math.max(0, matchIndex - 500), matchIndex);

            // Default to 2026 if we find "2026" in context, else try 2025
            if (contextBefore.includes('2026')) {
                latestYear = 2026;
            } else if (contextBefore.includes('2025')) {
                latestYear = 2025;
            } else {
                latestYear = 2026; // Default assumption
            }

            latestMonth = m;
            latestMonthly = parseFloat(match[1].replace(',', '.'));
            break;
        }
    }

    // Alternative simpler pattern: look for "IVAR no mês" or "variação mensal" with a percentage
    if (isNaN(latestMonthly)) {
        // Try to find the current/latest value displayed prominently on the page
        // Pattern: large displayed value like "0,65%" near "IVAR"
        const currentValueMatch = html.match(
            /(?:IVAR|variação\s+mensal|no\s+mês)[^]*?(-?\d+[,.]\d+)\s*%/i
        );
        if (currentValueMatch) {
            latestMonthly = parseFloat(currentValueMatch[1].replace(',', '.'));
        }

        // Try to find the reference month
        const refMonthMatch = html.match(
            /(?:referência|referente\s+a?)\s*:?\s*(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?(\d{4})/i
        );
        if (refMonthMatch) {
            const monthIdx = monthNames.indexOf(refMonthMatch[1].toLowerCase());
            if (monthIdx >= 0) {
                latestMonth = monthIdx + 1;
                latestYear = parseInt(refMonthMatch[2]);
            }
        }
    }

    // Try to find 12-month accumulated
    const acc12mMatch = html.match(
        /(?:acumulado\s+(?:em\s+)?12\s+meses|12\s+meses)[^]*?(-?\d+[,.]\d+)\s*%/i
    );
    if (acc12mMatch) {
        latestAcc12m = parseFloat(acc12mMatch[1].replace(',', '.'));
    }

    if (isNaN(latestMonthly) || latestMonth === 0) {
        throw new Error('Could not parse IVAR monthly value from brasilindicadores.com.br');
    }

    // If year wasn't determined, use current year
    if (latestYear === 0) {
        const now = new Date();
        latestYear = now.getFullYear();
    }

    return {
        year: latestYear,
        month: latestMonth,
        monthly: latestMonthly,
        acc12m: latestAcc12m,
        source: FALLBACK_URL,
    };
}

/**
 * Attempt to parse IVAR data from the FGV portal directly
 */
async function fetchFromFgv(): Promise<ParsedIvarData> {
    console.log('[IVAR] Fetching from FGV portal...');

    const response = await fetch(FGV_IVAR_URL, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (compatible; Kitnets/1.0; +https://kitnets.com)',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`FGV portal returned ${response.status}`);
    }

    const html = await response.text();

    // FGV page typically shows results like:
    // "O IVAR de janeiro de 2026 registrou variação de 0,65%"
    // or table rows with month | monthly % | 12m %

    const monthNames = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    // Try to match "IVAR de [month] de [year] ... [value]%"
    const resultMatch = html.match(
        /IVAR\s+(?:de\s+)?(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})[^]*?(-?\d+[,.]\d+)\s*%/i
    );

    if (resultMatch) {
        const monthIdx = monthNames.indexOf(resultMatch[1].toLowerCase());
        return {
            year: parseInt(resultMatch[2]),
            month: monthIdx + 1,
            monthly: parseFloat(resultMatch[3].replace(',', '.')),
            acc12m: null,
            source: FGV_IVAR_URL,
        };
    }

    // Try tabular data pattern
    for (let m = 12; m >= 1; m--) {
        const monthName = monthNames[m - 1];
        const regex = new RegExp(
            monthName + '[\\s\\S]*?(-?\\d+[,.]\\d+)\\s*%',
            'i'
        );
        const match = html.match(regex);
        if (match) {
            const matchIndex = html.indexOf(match[0]);
            const context = html.substring(Math.max(0, matchIndex - 500), matchIndex);
            const year = context.includes('2026') ? 2026 : context.includes('2025') ? 2025 : 2026;

            return {
                year,
                month: m,
                monthly: parseFloat(match[1].replace(',', '.')),
                acc12m: null,
                source: FGV_IVAR_URL,
            };
        }
    }

    throw new Error('Could not parse IVAR data from FGV portal');
}

async function upsertIvarData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    parsed: ParsedIvarData,
): Promise<{ action: string; message: string }> {
    // Get IVAR index ID
    const { data: indexData, error: indexError } = await supabase
        .from('economic_indexes')
        .select('id')
        .eq('code', 'IVAR')
        .single();

    if (indexError || !indexData) {
        throw new Error(`[IVAR] Index not found in database: ${indexError?.message}`);
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
        if (
            existingData.value_percent === parsed.monthly &&
            (parsed.acc12m === null || existingData.accumulated_12m === parsed.acc12m)
        ) {
            const msg = `[IVAR] ${parsed.month}/${parsed.year} already up to date (${parsed.monthly}%)`;
            console.log(msg);
            return { action: 'skipped', message: msg };
        }

        const updatePayload: Record<string, unknown> = {
            value_percent: parsed.monthly,
            reference_date: referenceDate,
            is_projection: false,
            source_url: parsed.source,
        };

        if (parsed.acc12m !== null) {
            updatePayload.accumulated_12m = parsed.acc12m;
        }

        const { error: updateError } = await supabase
            .from('economic_index_values')
            .update(updatePayload)
            .eq('id', existingData.id);

        if (updateError) throw updateError;

        const msg = `[IVAR] ${parsed.month}/${parsed.year} updated: ${parsed.monthly}%${parsed.acc12m !== null ? ` (12m: ${parsed.acc12m}%)` : ''}`;
        console.log(msg);
        return { action: 'updated', message: msg };
    }

    // Insert new record
    const insertPayload: Record<string, unknown> = {
        index_id: indexId,
        year: parsed.year,
        month: parsed.month,
        reference_date: referenceDate,
        value_percent: parsed.monthly,
        is_projection: false,
        source_url: parsed.source,
    };

    if (parsed.acc12m !== null) {
        insertPayload.accumulated_12m = parsed.acc12m;
    }

    const { error: insertError } = await supabase
        .from('economic_index_values')
        .insert(insertPayload);

    if (insertError) throw insertError;

    const msg = `[IVAR] ${parsed.month}/${parsed.year} inserted: ${parsed.monthly}%${parsed.acc12m !== null ? ` (12m: ${parsed.acc12m}%)` : ''}`;
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
    const todayBRT = brt.toISOString().slice(0, 10);

    const isDisclosureDay = FGV_DISCLOSURE_DATES.includes(todayBRT);

    if (!isDisclosureDay && !force) {
        console.log(`[IVAR] Not a disclosure day (${todayBRT}). Skipping.`);
        return NextResponse.json({
            success: true,
            action: 'not-disclosure-day',
            date: todayBRT,
            message: `Today (${todayBRT}) is not an FGV IVAR disclosure date. Use ?force=true to override.`,
            nextDates: FGV_DISCLOSURE_DATES.filter(d => d >= todayBRT).slice(0, 3),
        });
    }

    console.log(`[IVAR] ${force ? 'FORCE mode' : 'Disclosure day'} — processing (${todayBRT})`);

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

    // Try multiple data sources in order:
    // 1. brasilindicadores.com.br (structured HTML, most reliable for scraping)
    // 2. FGV portal (official but harder to parse)
    let parsed: ParsedIvarData | null = null;
    const fetchErrors: string[] = [];

    // Source 1: brasilindicadores.com.br
    try {
        parsed = await fetchFromBrasilIndicadores();
        console.log(`[IVAR] Got data from brasilindicadores: ${parsed.month}/${parsed.year} = ${parsed.monthly}%`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[IVAR] brasilindicadores failed: ${msg}`);
        fetchErrors.push(`brasilindicadores: ${msg}`);
    }

    // Source 2: FGV portal (if source 1 failed)
    if (!parsed) {
        try {
            parsed = await fetchFromFgv();
            console.log(`[IVAR] Got data from FGV portal: ${parsed.month}/${parsed.year} = ${parsed.monthly}%`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[IVAR] FGV portal failed: ${msg}`);
            fetchErrors.push(`FGV: ${msg}`);
        }
    }

    if (!parsed) {
        return NextResponse.json({
            success: false,
            date: todayBRT,
            forced: force,
            error: 'Could not fetch IVAR data from any source',
            fetchErrors,
            message: 'All data sources failed. IVAR may need manual update. Check Vercel logs.',
        }, { status: 502 });
    }

    // Upsert into Supabase
    try {
        const result = await upsertIvarData(supabase, parsed);

        return NextResponse.json({
            success: true,
            date: todayBRT,
            forced: force,
            ...result,
            data: {
                period: `${parsed.month}/${parsed.year}`,
                monthly: parsed.monthly,
                acc12m: parsed.acc12m,
                source: parsed.source,
            },
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[IVAR] Supabase upsert error:`, errMsg);

        return NextResponse.json({
            success: false,
            date: todayBRT,
            forced: force,
            error: errMsg,
            data: {
                period: `${parsed.month}/${parsed.year}`,
                monthly: parsed.monthly,
                source: parsed.source,
            },
        }, { status: 500 });
    }
}
