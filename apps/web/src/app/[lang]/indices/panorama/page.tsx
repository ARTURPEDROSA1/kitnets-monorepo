import { Metadata } from 'next';
import { getAllIndexes, getIndexValues, IndexMetadata, IndexValue } from '@/lib/indexes';
import { MiniIndexChart } from '@/components/indices/MiniIndexChart';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getDictionary } from '../../../../dictionaries';
import { Button } from "@/components/ui/button";

export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'Panorama Econômico do Brasil: inflação, aluguel e juros em um só lugar',
    description: 'O Panorama Econômico do Kitnets.com reúne, em uma única página, os principais indicadores econômicos do Brasil, organizados de forma clara e visual para facilitar a análise de inflação, aluguéis, juros e investimentos.',
};

interface IndexData {
    meta: IndexMetadata;
    history: IndexValue[];
    latest: IndexValue | undefined;
}

export default async function PanoramaPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
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

    // Define categories and grouping logic
    const categories: Record<string, IndexData[]> = {
        inflation: [],
        rent: [],
        interest: [],
        other: []
    };

    const categoryTitles: Record<string, Record<string, string>> = {
        pt: {
            inflation: 'Inflação',
            rent: 'Aluguel',
            interest: 'Juros e Investimentos',
            other: 'Outros'
        },
        en: {
            inflation: 'Inflation',
            rent: 'Rent',
            interest: 'Interest Rates',
            other: 'Others'
        },
        es: {
            inflation: 'Inflación',
            rent: 'Alquiler',
            interest: 'Intereses',
            other: 'Otros'
        }
    };

    // Group indexes
    indexesData.forEach(data => {
        const code = data.meta.code.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Remove hyphens/spaces

        if (['IPCA', 'INPC', 'IGPM', 'IGP'].includes(code)) {
            categories.inflation.push(data);
        } else if (['IVAR', 'FIPEZAP'].includes(code)) {
            categories.rent.push(data);
        } else if (['SELIC', 'CDI', 'TR', 'POUPANCA'].includes(code)) {
            categories.interest.push(data);
        } else {
            categories.other.push(data);
        }
    });

    const currentTitles = categoryTitles[lang as string] || categoryTitles['pt'];

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
        <div className="container mx-auto py-6 md:py-10 px-4 max-w-6xl">
            <h1 className="text-3xl font-bold mb-2">Panorama Econômico</h1>
            <p className="text-muted-foreground mb-8 text-lg">
                Resumo dos principais indicadores econômicos e suas variações nos últimos 12 meses.
            </p>

            <div className="space-y-12">
                {(['inflation', 'rent', 'interest', 'other'] as const).map((key) => {
                    const items = categories[key];
                    if (items.length === 0) return null;
                    const title = currentTitles[key] || currentTitles['other'];

                    return (
                        <div key={key}>
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                                {title}
                                <span className="h-px bg-border flex-1 ml-4 block opacity-60"></span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {items.map(({ meta, history, latest }) => {
                                    // const previous = history[1]?.value_percent || 0;
                                    const current = latest?.value_percent || 0;
                                    // const trend = getTrend(current, previous);
                                    // const ChartIcon = trend.icon;

                                    const displayValue = latest ? `${latest.value_percent.toFixed(2)}%` : '-';
                                    const displayAccumulated = latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '-';

                                    // Heatmap-aligned color logic
                                    const getChartColor = (val: number) => {
                                        if (val > 0.5) return '#ef4444'; // Red (High Inflation/Value)
                                        if (val > 0.1) return '#f59e0b'; // Amber (Moderate)
                                        if (val >= -0.1) return '#6b7280'; // Gray (Neutral)
                                        return '#10b981'; // Emerald (Low/Negative)
                                    };

                                    const chartColor = getChartColor(current);

                                    return (
                                        <div key={meta.id} className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow">
                                            <div className="p-5 md:p-6">
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
                                                    <MiniIndexChart data={history} color={chartColor} />
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
                        </div>
                    );
                })}
            </div>

            {/* SEO Content */}
            <div className="mt-16 max-w-4xl mx-auto space-y-12 text-muted-foreground">
                <div className="space-y-4">
                    <h2 className="text-3xl font-bold text-foreground tracking-tight">
                        {(dict as any).panoramaPage?.title}
                    </h2>
                    <p className="text-lg leading-relaxed">
                        {(dict as any).panoramaPage?.description}
                    </p>
                    <p className="text-lg leading-relaxed">
                        {(dict as any).panoramaPage?.intro}
                    </p>
                </div>

                <div className="space-y-10">
                    {(dict as any).panoramaPage?.sections?.map((section: any, idx: number) => (
                        <section key={idx} className="space-y-4">
                            <h3 className="text-2xl font-semibold text-foreground">
                                {section.title}
                            </h3>
                            {section.text && (
                                <p className="leading-relaxed whitespace-pre-line">
                                    {section.text}
                                </p>
                            )}

                            {section.items && (
                                <ul className="grid gap-4 mt-4 sm:grid-cols-2">
                                    {section.items.map((item: any, i: number) => (
                                        <li key={i} className="bg-muted/50 p-4 rounded-lg">
                                            <span className="font-bold text-foreground block mb-1">{item.term}</span>
                                            <span className="text-sm">{item.def}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {section.list && (
                                <ul className="list-disc list-inside space-y-2 ml-2 mt-2">
                                    {section.list.map((item: string, i: number) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            )}

                            {section.conclusion && (
                                <p className="leading-relaxed mt-4 whitespace-pre-line">
                                    {section.conclusion}
                                </p>
                            )}
                        </section>
                    ))}
                </div>
                <div className="text-lg font-medium text-foreground text-center pt-8">
                    {(dict as any).panoramaPage?.finalCta}
                </div>
            </div>

            {/* CTA Standard */}
            <div className="mt-16 text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h3 className="text-3xl md:text-3xl font-bold tracking-tight whitespace-pre-line text-foreground">
                        {(dict as any).calculatorCtaStandard?.title}
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                        {(dict as any).calculatorCtaStandard?.description}
                    </p>
                    <div className="pt-4 flex flex-col items-center gap-3">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                {(dict as any).calculatorCtaStandard?.button}
                            </Button>
                        </Link>
                        <p className="text-xs md:text-sm text-muted-foreground font-medium opacity-80">
                            {(dict as any).calculatorCtaStandard?.microcopy}
                        </p>
                    </div>
                </div>
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
        </div>
    );
}
