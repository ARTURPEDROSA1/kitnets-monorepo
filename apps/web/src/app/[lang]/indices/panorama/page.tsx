import { Metadata } from 'next';
import { getAllIndexes, getIndexValues, IndexMetadata, IndexValue } from '@/lib/indexes';
import { MiniIndexChart } from '@/components/indices/MiniIndexChart';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'Panorama Econômico - Indicadores Financeiros | Kitnets',
    description: 'Visão geral dos principais indicadores econômicos do Brasil (IPCA, IGP-M, SELIC, etc) em uma única tela com gráficos e valores atualizados.',
};

interface IndexData {
    meta: IndexMetadata;
    history: IndexValue[];
    latest: IndexValue | undefined;
}

export default async function PanoramaPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const allIndexesMetadata = await getAllIndexes();

    // Fetch data for all indexes in parallel
    const indexesData: IndexData[] = await Promise.all(
        allIndexesMetadata.map(async (meta) => {
            // Fetch last 12 months for the sparkline + current value
            const history = await getIndexValues(meta.id, 12);
            return {
                meta,
                history,
                latest: history[0]
            };
        })
    );

    // Helper to determine trend color/icon - Keeping for future use if design changes
    // const getTrend = (current: number, previous: number) => { ... };

    // Schema.org Structured Data
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'DataCatalog',
        name: 'Panorama Econômico Kitnets',
        description: 'Visão geral dos principais indicadores econômicos do Brasil (IPCA, IGP-M, SELIC, etc).',
        dataset: indexesData.map(({ meta }) => ({
            '@type': 'Dataset',
            name: `${meta.code} - ${meta.name}`,
            description: `Dados históricos e variações do índice ${meta.code}.`
        }))
    };

    return (
        <div className="container mx-auto py-10 px-4 max-w-6xl">
            <h1 className="text-3xl font-bold mb-2">Panorama Econômico</h1>
            <p className="text-muted-foreground mb-8 text-lg">
                Resumo dos principais indicadores econômicos e suas variações nos últimos 12 meses.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {indexesData.map(({ meta, history, latest }) => {
                    // const previous = history[1]?.value_percent || 0;
                    const current = latest?.value_percent || 0;
                    // const trend = getTrend(current, previous);
                    // const ChartIcon = trend.icon;

                    // Determine accumulator label - specific logic might be needed per index type
                    // but generally 'Acumulado 12m' is good for inflation.
                    // For SELIC/CDI often the monthly value is annualized or shown as monthly. 
                    // Our data has `value_percent` as monthly and `accumulated_12m`.

                    const displayValue = latest ? `${latest.value_percent.toFixed(2)}%` : '-';
                    const displayAccumulated = latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '-';

                    return (
                        <div key={meta.id} className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h2 className="text-xl font-bold">{meta.code}</h2>
                                            {meta.is_official && (
                                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                                                    Oficial
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-1" title={meta.name}>
                                            {meta.name}
                                        </p>
                                    </div>
                                    <Link href={lang === 'pt' ? `/indices/${meta.code.toLowerCase()}` : `/${lang}/indices/${meta.code.toLowerCase()}`} className="text-muted-foreground hover:text-primary transition-colors">
                                        <ArrowRight className="h-5 w-5" />
                                    </Link>
                                </div>

                                {/* Chart Area */}
                                <div className="mb-4">
                                    <MiniIndexChart data={history} color={current >= 0 ? '#10b981' : '#ef4444'} />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                                            No Mês ({latest?.month.toString().padStart(2, '0')}/{latest?.year})
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl font-bold">{displayValue}</span>
                                            {/* <ChartIcon className={`h-4 w-4 ${trend.color}`} /> */}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                                            Acumulado 12m
                                        </p>
                                        <span className="text-2xl font-bold text-primary">
                                            {displayAccumulated}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
        </div>
    );
}
