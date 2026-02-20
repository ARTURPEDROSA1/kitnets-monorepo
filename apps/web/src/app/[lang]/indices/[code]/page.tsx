import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValuesByDateRange, getAllIndexes, getAllIndexValuesForCalculator } from '@/lib/indexes';
import { getFipeZapData } from '@/lib/fipezap';
import { getDictionary } from '../../../../dictionaries';
import { IndexChartLazy } from '@/components/indices/IndexChartLazy';
import { IndexHeatmapLazy } from '@/components/indices/IndexHeatmapLazy';
import { IndexDateFilter } from '@/components/indices/IndexDateFilter';
import { IndexHistoryTable } from '@/components/indices/IndexHistoryTable';
import { IPCACalculatorLazy } from '@/components/indices/IPCACalculatorLazy';
import { IPCAAlertForm } from '@/components/indices/IPCAAlertForm';
import Link from 'next/link';
import { ArrowLeft, MapPinned, Home, CalendarDays, Hourglass } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { FipeZapDashboardWrapper } from '@/components/indices/FipeZap/FipeZapDashboardWrapper';
import { MinimumWageDashboardWrapper } from '@/components/indices/MinimumWage/MinimumWageDashboardWrapper';
import { getMinimumWageData, MinimumWageData } from '@/lib/minimum-wage';

interface Props {
    params: Promise<{
        lang: string;
        code: string;
    }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface IndexSection {
    title: string;
    text?: string;
    items?: { title: string; text?: string }[];
    list?: string[];
    footer?: string;
}

interface IndexContent {
    title: string;
    description: string;
    pageDescription?: string;
    keywords?: string[];
    closing?: string;
    cta?: string;
    sections?: IndexSection[];
}

// Revalidate every hour
export const revalidate = 3600;

const ivarReleaseDates2026 = [
    { formatted: '06/02/2026', time: '9h', ref: 'Janeiro/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
    { formatted: '05/03/2026', time: '9h', ref: 'Fevereiro/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
    { formatted: '08/04/2026', time: '9h', ref: 'Março/2026', label: 'Índice de Variação de Aluguéis Residenciais (IVAR)' },
];

export async function generateStaticParams() {
    const indices = await getAllIndexes();
    return indices.map((idx) => ({
        code: idx.code.toLowerCase(),
    }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const { code, lang } = await params;
    const { type, bedrooms } = await searchParams;
    const metadata = await getIndexMetadata(code);

    if (!metadata) {
        return {
            title: 'Índice não encontrado',
        };
    }

    const dict = getDictionary(lang as "pt" | "en" | "es");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indices = (dict as any).indices || {};
    const indexContent = indices[code.toLowerCase()] as IndexContent | undefined;

    let title = indexContent?.title || `Índice ${metadata.code} - Histórico, Tabela e Gráfico 2025 | Kitnets`;
    let description = indexContent?.description || `Acompanhe a variação do ${metadata.code} (${metadata.name}). Tabela histórica completa dos últimos meses, gráfico de evolução e acumulado de 12 meses.`;

    // Dynamic SEO for FIPEZAP
    if (code.toUpperCase() === 'FIPEZAP') {
        const typeLabel = type === 'venda' ? 'Venda' : type === 'yield' ? 'Yield' : 'Locação';
        const bedroomsLabel = bedrooms === '1' ? '1 Quarto' :
            bedrooms === '2' ? '2 Quartos' :
                bedrooms === '3' ? '3 Quartos' :
                    bedrooms === '4' ? '4+ Quartos' : 'Todos os Quartos';

        title = `FipeZAP ${typeLabel} ${bedroomsLabel} - Histórico e Gráfico 2025`;
        description = `Veja o histórico do Índice FipeZAP para ${typeLabel} de imóveis com ${bedroomsLabel}. Dados atualizados, gráficos e tabelas completas.`;
    }

    return {
        title,
        description,
        keywords: indexContent?.keywords || [metadata.code, metadata.name, 'índice econômico', 'inflação', 'reajuste aluguel', 'brasil', 'economia', 'histórico', 'tabela', 'gráfico'],
        authors: [{ name: 'Kitnets.com' }],
        applicationName: 'Kitnets',
        robots: {
            index: true,
            follow: true,
            'max-snippet': -1,
            'max-image-preview': 'large' as const,
            'max-video-preview': -1,
        },
        alternates: {
            canonical: `/${lang}/indices/${code.toLowerCase()}${type ? `?type=${type}` : ''}${bedrooms ? `&bedrooms=${bedrooms}` : ''}`,
            languages: {
                'pt': `/pt/indices/${code.toLowerCase()}`,
                'en': `/en/indices/${code.toLowerCase()}`,
                'es': `/es/indices/${code.toLowerCase()}`,
            },
        },
        openGraph: {
            title,
            description,
            type: 'article',
            siteName: 'Kitnets',
            locale: lang,
            tags: [metadata.code, 'Economia', 'Índices', 'Inflação', 'Brasil', '2026'],
            publishedTime: '2024-01-01T00:00:00Z',
            modifiedTime: new Date().toISOString(),
            authors: ['Kitnets.com'],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        }
    };
}

export default async function IndexPage({ params, searchParams }: Props) {
    const { code: codeParam, lang } = await params;
    const { startDate, endDate, type, bedrooms } = await searchParams;
    const code = codeParam.toUpperCase();

    // Default dates logic applied to all indexes
    const defaultStartDate = '2021-01-01';
    const defaultEndDate = new Date().toISOString().split('T')[0];

    const dict = getDictionary(lang as "pt" | "en" | "es");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indices = (dict as any).indices || {};
    const indexContent = indices[code.toLowerCase()] as IndexContent | undefined;

    const metadata = await getIndexMetadata(code);
    if (!metadata) {
        notFound();
    }

    const startDateStr = typeof startDate === 'string' ? startDate : defaultStartDate;
    const endDateStr = typeof endDate === 'string' ? endDate : defaultEndDate;

    // Fetch history based on date range or default to recent
    const history = await getIndexValuesByDateRange(metadata.id, startDateStr, endDateStr);
    const latest = history[0];

    // Fetch full dataset for IPCA calculator
    const ipcaCalcData = (code === 'IPCA' || code === 'INPC')
        ? await getAllIndexValuesForCalculator(metadata.id)
        : [];

    // Prepare Minimum Wage Data
    let minWageData: MinimumWageData[] = [];
    let minWageLatest: MinimumWageData | null = null;
    let minWageNext: MinimumWageData | null = null;

    if (code === 'REAJUSTE-SALARIO-MINIMO') {
        const allMw = await getMinimumWageData(); // Sorted DESC

        // Filter for dashboard table/charts
        minWageData = allMw.filter(d => d.reference_date >= startDateStr && d.reference_date <= endDateStr);

        const today = new Date().toISOString().split('T')[0];
        minWageLatest = allMw.find(d => !d.is_projection && d.reference_date <= today) || null;

        // Find next adjustment (closest future date)
        // Data is DESC: [FutureFar, FutureNear, Present, Past]
        // Filter > Present => [FutureFar, FutureNear]
        // We want FutureNear (Last item of the future array)
        const currentRefDate = minWageLatest?.reference_date || today;
        const future = allMw.filter(d => d.reference_date > currentRefDate);
        if (future.length > 0) {
            minWageNext = future[future.length - 1];
        }
    }

    // Schema.org Structured Data - Dataset
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `Histórico do Índice ${metadata.code}`,
        description: `Dados históricos mensais do índice ${metadata.code} (${metadata.name})`,
        url: `https://kitnets.com/${lang}/indices/${code.toLowerCase()}`,
        sameAs: metadata.source ? [metadata.source] : [],
        provider: {
            '@type': 'Organization',
            name: 'Kitnets.com',
            url: 'https://kitnets.com'
        },
        temporalCoverage: history.length > 0 ? `${history[history.length - 1].year}-${String(history[history.length - 1].month).padStart(2, '0')}/${history[0].year}-${String(history[0].month).padStart(2, '0')}` : '2023-2026',
        variableMeasured: 'Percentage Change',
        dateModified: latest ? new Date(latest.year, latest.month - 1, 15).toISOString() : new Date().toISOString(),
    };

    // Schema.org Structured Data - WebPage (for richer SERP snippets)
    const webPageJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: indexContent?.title || `Índice ${metadata.code}`,
        description: indexContent?.description || `Acompanhe a variação do ${metadata.code}`,
        url: `https://kitnets.com/${lang}/indices/${code.toLowerCase()}`,
        datePublished: '2024-01-01T00:00:00Z',
        dateModified: latest ? new Date(latest.year, latest.month - 1, 15).toISOString() : new Date().toISOString(),
        inLanguage: lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en',
        isPartOf: {
            '@type': 'WebSite',
            name: 'Kitnets.com',
            url: 'https://kitnets.com'
        },
        publisher: {
            '@type': 'Organization',
            name: 'Kitnets.com',
            url: 'https://kitnets.com'
        },
        about: {
            '@type': 'Thing',
            name: metadata.code,
            description: metadata.name
        },
        mainEntity: {
            '@type': 'Dataset',
            name: `Histórico do Índice ${metadata.code}`
        },
        speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: ['h1', 'h2', '.text-primary']
        }
    };

    // Schema.org Structured Data - FAQ
    const faqItems = indexContent?.sections
        ?.filter(s => s.title.includes('?'))
        .map(s => ({
            '@type': 'Question',
            name: s.title,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${s.text || ''} ${s.items ? s.items.map(i => `${i.title}: ${i.text}`).join('. ') : ''}`
            }
        }));

    const faqJsonLd = faqItems && faqItems.length > 0 ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems
    } : null;

    // Schema.org Structured Data - Breadcrumbs
    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `https://kitnets.com/${lang}`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'Índices',
                item: `https://kitnets.com/${lang}/indices`,
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: metadata.code,
                item: `https://kitnets.com/${lang}/indices/${code.toLowerCase()}`,
            }
        ],
    };

    interface IndicesCta {
        title: string;
        description: string;
        button: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctaContent = (dict as any).indicesCta as IndicesCta | undefined;

    return (
        <div className="container mx-auto py-4 md:py-10 px-4 max-w-5xl">
            <Link href={`/${lang}`} passHref>
                <div className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-2">
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Voltar
                </div>
            </Link>

            {/* Header Section */}
            <div className="space-y-4 mb-6 md:mb-8">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{code === 'REAJUSTE-SALARIO-MINIMO' ? metadata.code.replace(/-/g, ' ') : metadata.code}</h1>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${metadata.is_official ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80' : 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                        {metadata.is_official ? 'Oficial' : 'Projeção'}
                    </span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground border-border">
                        {(() => {
                            const translations: Record<string, Record<string, string>> = {
                                'rent': { 'pt': 'Aluguel', 'en': 'Rent', 'es': 'Alquiler' },
                                'market': { 'pt': 'Mercado', 'en': 'Market', 'es': 'Mercado' },
                                'inflation': { 'pt': 'Inflação', 'en': 'Inflation', 'es': 'Inflación' }
                            };
                            const category = code === 'IGPM' ? 'inflation' : metadata.category;
                            return translations[category]?.[lang] || category;
                        })()}
                    </span>
                </div>
                {code !== 'REAJUSTE-SALARIO-MINIMO' && (
                    <h2 className="text-xl text-muted-foreground">{metadata.name}</h2>
                )}
                <p className="max-w-3xl text-muted-foreground/80">
                    Acompanhe a evolução do {code === 'REAJUSTE-SALARIO-MINIMO' ? metadata.code.replace(/-/g, ' ') : metadata.code}, atualizado mensalmente.
                    Fonte: <strong>{metadata.source}</strong>.
                </p>
            </div>

            {/* FIPEZAP Specific Layout */}
            {code === 'FIPEZAP' && (
                <div className="md:col-span-3 min-w-0">
                    <FipeZapDashboardWrapper
                        startDate={startDateStr}
                        endDate={endDateStr}
                        type={(type as string) || 'locacao'}
                        bedrooms={(bedrooms as string) || 'todos'}
                        data={await getFipeZapData(startDateStr, endDateStr, (bedrooms as string) || 'todos')}
                    />
                </div>
            )}

            {code === 'REAJUSTE-SALARIO-MINIMO' && (
                <div className="md:col-span-3 min-w-0">
                    <MinimumWageDashboardWrapper
                        data={minWageData}
                        latest={minWageLatest}
                        startDate={startDateStr}
                        endDate={endDateStr}
                        nextAdjustment={minWageNext}
                    />
                </div>
            )}

            {/* Standard Index Layout for non-custom indexes */}
            {code !== 'FIPEZAP' && code !== 'REAJUSTE-SALARIO-MINIMO' && (
                <div className="grid gap-3 md:grid-cols-3 md:gap-6">
                    {/* Key Metrics Cards */}
                    <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                        {/* Card 1: Variação Mensal */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} variação mensal`}>
                            <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                                <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} hoje:</h3>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <div className="text-2xl md:text-3xl font-bold text-primary">
                                    {latest ? `${latest.value_percent}%` : '--'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Referente a <time dateTime={latest ? `${latest.year}-${String(latest.month).padStart(2, '0')}` : ''}>{latest ? `${latest.month.toString().padStart(2, '0')}/${latest.year}` : '--'}</time>
                                </p>
                            </div>
                        </div>

                        {/* Card 2: Acumulado 12m */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} acumulado 12 meses`}>
                            <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                                <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} acumulado em 12 meses:</h3>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <div className="text-2xl md:text-3xl font-bold text-primary">
                                    {latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '--'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Últimos 12 meses
                                </p>
                            </div>
                        </div>

                        {/* Card 3: Acumulado Ano (YTD) */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm" role="region" aria-label={`${code} acumulado no ano`}>
                            <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                                <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} acumulado em {latest?.year}:</h3>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <div className="text-2xl md:text-3xl font-bold text-primary">
                                    {latest?.accumulated_year ? `${latest.accumulated_year}%` : '--'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Até {latest ? `${latest.month.toString().padStart(2, '0')}/${latest.year}` : '--'}
                                </p>
                            </div>
                        </div>

                        {/* Card 4: Next Release Date */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                                <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Data da próxima divulgação:</h3>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <div className="text-2xl md:text-3xl font-bold text-primary">
                                    <span className="text-sm md:text-xl">
                                        {(() => {
                                            if (code === 'CDI') {
                                                return '1º dia útil/mês';
                                            }

                                            if (code === 'SELIC') {
                                                const copomDates2026 = [
                                                    new Date(2026, 0, 28), // Jan 28
                                                    new Date(2026, 2, 18), // Mar 18
                                                    new Date(2026, 3, 29), // Apr 29
                                                    new Date(2026, 5, 17), // Jun 17
                                                    new Date(2026, 7, 5),  // Aug 5
                                                    new Date(2026, 8, 16), // Sep 16
                                                    new Date(2026, 10, 4), // Nov 4
                                                    new Date(2026, 11, 9), // Dec 9
                                                ];

                                                const now = new Date();
                                                now.setHours(0, 0, 0, 0);

                                                const nextMeeting = copomDates2026.find(d => d >= now);

                                                if (nextMeeting) {
                                                    const locale = lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en-US' : 'es-ES';
                                                    return nextMeeting.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
                                                }
                                                return 'A definir';
                                            }

                                            if (!latest) return '--';
                                            // Determine next reference month (default: latest + 1)
                                            let nextRefMonth = latest.month + 1;
                                            let nextRefYear = latest.year;
                                            if (nextRefMonth > 12) {
                                                nextRefMonth = 1;
                                                nextRefYear++;
                                            }

                                            if (code === 'IGPM') {
                                                // Calendar for 2026
                                                const releaseDates_2026: Record<number, number> = {
                                                    1: 29, // Jan
                                                    2: 26, // Feb
                                                    3: 30, // Mar
                                                    4: 29, // Apr
                                                };

                                                // Helper to get release day for a given month/year
                                                const getDay = (m: number, y: number) =>
                                                    (y === 2026 && releaseDates_2026[m]) ? releaseDates_2026[m] : 29;

                                                let day = getDay(nextRefMonth, nextRefYear);
                                                let date = new Date(nextRefYear, nextRefMonth - 1, day);

                                                // Check if this calculated date is today or in the past
                                                const now = new Date();
                                                now.setHours(0, 0, 0, 0);

                                                if (date <= now) {
                                                    // Advance to NEXT month
                                                    nextRefMonth++;
                                                    if (nextRefMonth > 12) {
                                                        nextRefMonth = 1;
                                                        nextRefYear++;
                                                    }
                                                    day = getDay(nextRefMonth, nextRefYear);
                                                    date = new Date(nextRefYear, nextRefMonth - 1, day);
                                                }

                                                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                            }


                                            if (code === 'IVAR') {
                                                const today = new Date();
                                                today.setHours(0, 0, 0, 0);

                                                const nextDate = ivarReleaseDates2026.find(item => {
                                                    const [day, month, year] = item.formatted.split('/').map(Number);
                                                    const dateObj = new Date(year, month - 1, day);
                                                    return dateObj >= today;
                                                });

                                                if (nextDate) {
                                                    const [day, month, year] = nextDate.formatted.split('/').map(Number);
                                                    const dateObj = new Date(year, month - 1, day);
                                                    return dateObj.toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es-ES' : 'en-US', { day: '2-digit', month: 'short' });
                                                }
                                                return 'A definir';
                                            }

                                            // IPCA / INPC — IBGE official release calendar 2026
                                            // Key = release month, Value = release day
                                            if (code === 'IPCA' || code === 'INPC') {
                                                const ibgeReleaseDates2026: Record<number, number> = {
                                                    1: 10,  // 10/Jan — ref Dez/2025
                                                    2: 10,  // 10/Feb — ref Jan/2026
                                                    3: 12,  // 12/Mar — ref Feb/2026
                                                    4: 10,  // 10/Apr — ref Mar/2026
                                                    5: 12,  // 12/May — ref Apr/2026
                                                    6: 12,  // 12/Jun — ref May/2026
                                                    7: 10,  // 10/Jul — ref Jun/2026
                                                    8: 11,  // 11/Aug — ref Jul/2026
                                                    9: 11,  // 11/Sep — ref Aug/2026
                                                    10: 9,  // 09/Oct — ref Sep/2026
                                                    11: 12, // 12/Nov — ref Oct/2026
                                                    12: 11, // 11/Dec — ref Nov/2026
                                                };

                                                // Release month is 2 months after latest data month
                                                let relMonth = nextRefMonth + 1;
                                                let relYear = nextRefYear;
                                                if (relMonth > 12) { relMonth = 1; relYear++; }

                                                const getIbgeDay = (m: number, y: number) =>
                                                    (y === 2026 && ibgeReleaseDates2026[m]) ? ibgeReleaseDates2026[m] : 10;

                                                let day = getIbgeDay(relMonth, relYear);
                                                let date = new Date(relYear, relMonth - 1, day);

                                                const now = new Date();
                                                now.setHours(0, 0, 0, 0);

                                                if (date <= now) {
                                                    relMonth++;
                                                    if (relMonth > 12) { relMonth = 1; relYear++; }
                                                    day = getIbgeDay(relMonth, relYear);
                                                    date = new Date(relYear, relMonth - 1, day);
                                                }

                                                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                            }

                                            // Default fallback for other indexes
                                            let releaseMonth = nextRefMonth + 1;
                                            let releaseYear = nextRefYear;
                                            if (releaseMonth > 12) {
                                                releaseMonth = 1;
                                                releaseYear++;
                                            }
                                            const date = new Date(releaseYear, releaseMonth - 1, 10);
                                            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* IPCA/INPC Correction Calculator */}
                    {(code === 'IPCA' || code === 'INPC') && ipcaCalcData.length > 0 && (
                        <IPCACalculatorLazy data={ipcaCalcData} />
                    )}

                    {/* IPCA/INPC Alert Form — Primary placement */}
                    {(code === 'IPCA' || code === 'INPC') && (
                        <IPCAAlertForm indexCode={code} lang={lang} />
                    )}

                    {/* Date Filter */}
                    <div className="md:col-span-3 min-w-0">
                        <h3 className="text-lg md:text-xl font-semibold text-foreground mb-3">
                            Filtrar Série Histórica {code !== 'FIPEZAP' ? `do ${code}` : ''}
                        </h3>
                        <IndexDateFilter
                            key={`${startDateStr || 'start'}-${endDateStr || 'end'}`}
                            defaultStartDate={defaultStartDate}
                            defaultEndDate={defaultEndDate}
                        />
                    </div>

                    {/* Chart Section */}
                    <div id="grafico" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Histórico de Variação (%)</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Visualização gráfica da evolução do índice no período selecionado.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexChartLazy data={history} indexCode={code} />
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Section */}
                    <div id="mapa-calor" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Mapa de Calor Mensal</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Comportamento mensal e acumulado anual.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexHeatmapLazy data={history} />
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div id="tabela" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Série Histórica</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Valores detalhados mês a mês.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexHistoryTable data={history} />
                            </div>
                            <p className="text-xs text-center text-muted-foreground pb-3 md:hidden">← Deslize para ver mais →</p>
                        </div>
                    </div>

                    {/* IGPM Calendar Specific Section */}
                    {code === 'IGPM' && (() => {
                        const igpmCalendar2026 = [
                            { date: '29/01/2026', ref: 'Janeiro/2026', time: '8h' },
                            { date: '26/02/2026', ref: 'Fevereiro/2026', time: '8h' },
                            { date: '30/03/2026', ref: 'Março/2026', time: '8h' },
                            { date: '29/04/2026', ref: 'Abril/2026', time: '8h' },
                        ];

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const parseDate = (d: string) => {
                            const [day, month, year] = d.split('/').map(Number);
                            return new Date(year, month - 1, day);
                        };

                        const nextIdx = igpmCalendar2026.findIndex(item => parseDate(item.date) >= today);
                        const pesquisa = 'IGP-M e os componentes: IPA-M e IPC-M';

                        return (
                            <div id="calendario" className="md:col-span-3 min-w-0 scroll-mt-20">
                                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Calendário de divulgação IGP-M 2026</h3>
                                    </div>
                                    <div className="p-3 md:p-6 pt-0 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="text-muted-foreground bg-muted/50 text-xs uppercase">
                                                <tr className="border-b">
                                                    <th className="p-4 font-medium min-w-[120px]">Prev. divulgação</th>
                                                    <th className="p-4 font-medium min-w-[200px]">Pesquisa</th>
                                                    <th className="p-4 font-medium min-w-[150px]">Referência</th>
                                                    <th className="p-4 font-medium">Horário</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {igpmCalendar2026.map((item, i) => {
                                                    const isNext = i === nextIdx;
                                                    const isPast = nextIdx === -1 ? true : i < nextIdx;

                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={
                                                                isNext
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 font-semibold'
                                                                    : isPast
                                                                        ? 'opacity-50 hover:opacity-75 transition-opacity'
                                                                        : 'hover:bg-muted/50 transition-colors'
                                                            }
                                                        >
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'font-medium'}`}>
                                                                {item.date}
                                                                {isNext && <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Próxima</span>}
                                                            </td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{pesquisa}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.ref}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.time}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* IPCA / INPC Calendar Section */}
                    {(code === 'IPCA' || code === 'INPC') && (() => {
                        const ibgeCalendar2026 = [
                            { date: '10/01/2026', ref: 'Dezembro/2025', time: '9h' },
                            { date: '10/02/2026', ref: 'Janeiro/2026', time: '9h' },
                            { date: '12/03/2026', ref: 'Fevereiro/2026', time: '9h' },
                            { date: '10/04/2026', ref: 'Março/2026', time: '9h' },
                            { date: '12/05/2026', ref: 'Abril/2026', time: '9h' },
                            { date: '12/06/2026', ref: 'Maio/2026', time: '9h' },
                            { date: '10/07/2026', ref: 'Junho/2026', time: '9h' },
                            { date: '11/08/2026', ref: 'Julho/2026', time: '9h' },
                            { date: '11/09/2026', ref: 'Agosto/2026', time: '9h' },
                            { date: '09/10/2026', ref: 'Setembro/2026', time: '9h' },
                            { date: '12/11/2026', ref: 'Outubro/2026', time: '9h' },
                            { date: '11/12/2026', ref: 'Novembro/2026', time: '9h' },
                            { date: '12/01/2027', ref: 'Dezembro/2026', time: '9h' },
                        ];

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const parseDate = (d: string) => {
                            const [day, month, year] = d.split('/').map(Number);
                            return new Date(year, month - 1, day);
                        };

                        // Find the index of the next upcoming release (first date >= today)
                        const nextIdx = ibgeCalendar2026.findIndex(item => parseDate(item.date) >= today);
                        const pesquisa = `${code} — Índice Nacional de Preços ao Consumidor ${code === 'IPCA' ? 'Amplo' : ''}`;

                        return (
                            <div id="calendario" className="md:col-span-3 min-w-0 scroll-mt-20">
                                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Calendário de divulgação {code} 2026</h3>
                                    </div>
                                    <div className="p-3 md:p-6 pt-0 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="text-muted-foreground bg-muted/50 text-xs uppercase">
                                                <tr className="border-b">
                                                    <th className="p-4 font-medium min-w-[120px]">Prev. divulgação</th>
                                                    <th className="p-4 font-medium min-w-[200px]">Pesquisa</th>
                                                    <th className="p-4 font-medium min-w-[150px]">Referência</th>
                                                    <th className="p-4 font-medium">Horário</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {ibgeCalendar2026.map((item, i) => {
                                                    const isNext = i === nextIdx;
                                                    const isPast = nextIdx === -1 ? true : i < nextIdx;

                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={
                                                                isNext
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 font-semibold'
                                                                    : isPast
                                                                        ? 'opacity-50 hover:opacity-75 transition-opacity'
                                                                        : 'hover:bg-muted/50 transition-colors'
                                                            }
                                                        >
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'font-medium'}`}>
                                                                {item.date}
                                                                {isNext && <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Próxima</span>}
                                                            </td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{pesquisa}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.ref}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.time}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* IVAR Calendar Specific Section */}
                    {code === 'IVAR' && (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const parseDate = (d: string) => {
                            const [day, month, year] = d.split('/').map(Number);
                            return new Date(year, month - 1, day);
                        };

                        const nextIdx = ivarReleaseDates2026.findIndex(item => parseDate(item.formatted) >= today);

                        return (
                            <div id="calendario" className="md:col-span-3 min-w-0 scroll-mt-20">
                                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                                    <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                        <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Calendário de divulgação IVAR 2026</h3>
                                    </div>
                                    <div className="p-3 md:p-6 pt-0 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="text-muted-foreground bg-muted/50 text-xs uppercase">
                                                <tr className="border-b">
                                                    <th className="p-4 font-medium min-w-[120px]">Prev. divulgação</th>
                                                    <th className="p-4 font-medium min-w-[200px]">Pesquisa</th>
                                                    <th className="p-4 font-medium min-w-[150px]">Referência</th>
                                                    <th className="p-4 font-medium">Horário</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {ivarReleaseDates2026.map((item, i) => {
                                                    const isNext = i === nextIdx;
                                                    const isPast = nextIdx === -1 ? true : i < nextIdx;

                                                    return (
                                                        <tr
                                                            key={i}
                                                            className={
                                                                isNext
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 font-semibold'
                                                                    : isPast
                                                                        ? 'opacity-50 hover:opacity-75 transition-opacity'
                                                                        : 'hover:bg-muted/50 transition-colors'
                                                            }
                                                        >
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'font-medium'}`}>
                                                                {item.formatted}
                                                                {isNext && <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Próxima</span>}
                                                            </td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.label}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.ref}</td>
                                                            <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.time}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Index Specific Content Article (SEO) */}
            {indexContent && (
                <article className="mt-12 md:mt-20 pt-8 border-t border-border space-y-8 md:space-y-12 max-w-4xl">
                    <div className="space-y-4">
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{indexContent.title}</h2>
                        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                            {indexContent.description}
                        </p>
                        {indexContent.pageDescription && (
                            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                                {indexContent.pageDescription}
                            </p>
                        )}
                    </div>

                    {indexContent.sections && indexContent.sections.map((section: IndexSection, idx: number) => {
                        // Dynamically generate "Análise" section from latest Supabase data
                        // so the cron job auto-updates this text when new data is ingested
                        const isAnalysisSection = section.title.startsWith('Análise:');
                        const isAutoUpdatableIndex = ['IPCA', 'INPC', 'IGPM'].includes(code);

                        let dynamicTitle = section.title;
                        let dynamicText = section.text;

                        if (isAnalysisSection && isAutoUpdatableIndex && latest) {
                            const monthNames: Record<string, string[]> = {
                                pt: ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
                                en: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
                                es: ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
                            };
                            const months = monthNames[lang] || monthNames['pt'];
                            const monthLabel = months[latest.month];
                            const shortRef = `${String(latest.month).padStart(2, '0')}/${latest.year}`;

                            dynamicTitle = lang === 'pt'
                                ? `Análise: ${monthLabel} de ${latest.year}`
                                : lang === 'es'
                                    ? `Análisis: ${monthLabel} de ${latest.year}`
                                    : `Analysis: ${monthLabel} ${latest.year}`;

                            if (lang === 'pt') {
                                dynamicText = `O ${code} do último mês foi de ${latest.value_percent?.toFixed(2).replace('.', ',')}% em ${monthLabel.slice(0, 3)}/${latest.year}`;
                                if (latest.accumulated_12m) {
                                    dynamicText += ` e o ${code} acumulado de 12 meses foi de ${latest.accumulated_12m.toFixed(2).replace('.', ',')}% em ${monthLabel.slice(0, 3)}/${latest.year}`;
                                }
                                dynamicText += '.';
                            } else if (lang === 'es') {
                                dynamicText = `El ${code} del último mes fue de ${latest.value_percent?.toFixed(2)}% en ${shortRef}`;
                                if (latest.accumulated_12m) {
                                    dynamicText += ` y el ${code} acumulado de 12 meses fue de ${latest.accumulated_12m.toFixed(2)}% en ${shortRef}`;
                                }
                                dynamicText += '.';
                            } else {
                                dynamicText = `Last month's ${code} was ${latest.value_percent?.toFixed(2)}% in ${shortRef}`;
                                if (latest.accumulated_12m) {
                                    dynamicText += ` and the 12-month accumulated ${code} was ${latest.accumulated_12m.toFixed(2)}% in ${shortRef}`;
                                }
                                dynamicText += '.';
                            }
                        }

                        return (
                            <section key={idx} className="space-y-4 md:space-y-6">
                                <h3 className="text-xl md:text-2xl font-semibold text-foreground">{dynamicTitle}</h3>

                                {dynamicText && (
                                    <p className="text-muted-foreground leading-relaxed">{dynamicText}</p>
                                )}

                                {section.items && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {section.items.map((item, itemIdx: number) => {
                                            let Icon = null;
                                            const titleLower = item.title.toLowerCase();
                                            if (titleLower.includes("geográfica")) Icon = MapPinned;
                                            else if (titleLower.includes("setorial")) Icon = Home;
                                            else if (titleLower.includes("coleta")) Icon = CalendarDays;
                                            else if (titleLower.includes("periodicidade")) Icon = Hourglass;

                                            return (
                                                <div key={itemIdx} className="bg-card border rounded-lg p-4 flex items-start gap-3">
                                                    {Icon && <Icon className="h-5 w-5 text-primary mt-1 shrink-0" />}
                                                    <div>
                                                        <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                                                        <p className="text-sm text-muted-foreground">{item.text}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {section.list && (
                                    <ul className="space-y-2">
                                        {section.list.map((listItem: string, listIdx: number) => (
                                            <li key={listIdx} className="flex items-start gap-2 text-muted-foreground">
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                                                <span>{listItem}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {section.footer && (
                                    <p className="text-muted-foreground leading-relaxed mt-4">
                                        {section.footer}
                                    </p>
                                )}
                            </section>
                        );
                    })}

                    <div className="bg-muted/50 rounded-xl p-6 md:p-8 space-y-4">
                        <p className="text-lg font-medium text-foreground">
                            {indexContent.closing}
                        </p>
                        <p className="text-muted-foreground italic">
                            {indexContent.cta}
                        </p>
                    </div>
                </article>
            )}

            {/* SEO text for IPCA/INPC calculator */}
            {(code === 'IPCA' || code === 'INPC') && ipcaCalcData.length > 0 && (
                <section className="mt-16 max-w-3xl">
                    <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground mb-3">
                        Calculadora de Correção pelo {code}
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                        Simule a atualização de valores pelo {code} entre duas datas. Ideal para:
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-4">
                        {[
                            'Reajuste de aluguel',
                            'Atualização de contratos',
                            'Correção judicial',
                            'Preservação do poder de compra',
                        ].map((item) => (
                            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Digite o valor inicial, escolha o período e veja o valor corrigido automaticamente com base nos dados oficiais do IBGE.
                    </p>
                </section>
            )}

            {/* Authority CTA */}
            <div className="mt-20 w-full text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h3 className="text-3xl md:text-3xl font-bold tracking-tight whitespace-pre-line text-foreground">
                        {ctaContent?.title}
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                        {ctaContent?.description}
                    </p>
                    <div className="pt-4 flex flex-col items-center gap-3">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                {ctaContent?.button}
                            </Button>
                        </Link>
                    </div>

                    {/* IPCA/INPC Alert Form — Secondary placement within CTA */}
                    {(code === 'IPCA' || code === 'INPC') && (
                        <div className="pt-6 max-w-xl mx-auto w-full">
                            <IPCAAlertForm indexCode={code} lang={lang} variant="compact" />
                        </div>
                    )}
                </div>
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            {faqJsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
                />
            )}
        </div>
    );
}
