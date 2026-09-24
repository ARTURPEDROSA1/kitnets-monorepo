import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getIndexMetadata, getAllIndexValuesForCalculator, type IndexValueForCalc } from '@/lib/indexes';
import { resolveCalculatorIndex, minimumWageMonthlySeries, type FipezapBucket } from '@/lib/index-calculator';
import { getMinimumWageData } from '@/lib/minimum-wage';
import { FIPEZAP_NATIONAL_SLUG } from '@/lib/fipezap-cities';
import { createStaticClient } from '@/utils/supabase/static';

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 hour; the index cron jobs also revalidate it after writing

/** FipeZap monthly variation (national, one bedroom bucket, last 15 years) as a calculator series. Throws on a failed read, so it is never cached. */
async function fipezapSeries(indexType: string, dormitorios: FipezapBucket): Promise<IndexValueForCalc[]> {
    const { data, error } = await createStaticClient()
        .from('fipezap_series')
        .select('reference_date, value')
        .eq('city_slug', FIPEZAP_NATIONAL_SLUG)
        .eq('index_type', indexType).eq('metric', 'var_mensal').eq('dormitorios', dormitorios)
        .order('reference_date', { ascending: true })
        .limit(1000);
    if (error) throw new Error(`fipezap ${indexType}/${dormitorios}: ${error.message}`);
    return (data ?? []).filter(r => r.value !== null).map(r => ({ month: String(r.reference_date).slice(0, 7), value: Number(r.value) }));
}

/**
 * Monthly variation series for the correction calculator of an index page.
 * Codes: see CALCULATOR_INDEXES (IPCA, INPC, IGPM, IVAR, CDI, SELIC, FIPEZAP-LOCACAO, FIPEZAP-VENDA, REAJUSTE-SALARIO-MINIMO);
 * the FipeZap ones take a bedroom suffix (FIPEZAP-VENDA-2) for one bucket instead of all units.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ code: string }> }
) {
    const { code } = await params;
    const upperCode = code.toUpperCase();
    const resolved = resolveCalculatorIndex(upperCode);
    if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { spec, dormitorios } = resolved;

    let data: IndexValueForCalc[] = [];
    try {
        if (spec.source === 'index') {
            const metadata = await getIndexMetadata(spec.key!);
            if (!metadata) return NextResponse.json({ error: 'Index not found' }, { status: 404 });
            data = await getAllIndexValuesForCalculator(metadata.id);
        } else if (spec.source === 'fipezap') {
            data = await unstable_cache(() => fipezapSeries(spec.key!, dormitorios), [`calc-fipezap-${spec.key}-${dormitorios}`], { revalidate: 3600, tags: ['indices'] })();
        } else {
            const nowMonth = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);   // Brasília
            data = minimumWageMonthlySeries(await getMinimumWageData(), nowMonth);
        }
    } catch (err) {
        console.error(`[calculator-data] ${upperCode}:`, (err as Error).message);
        return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(data, {
        headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
