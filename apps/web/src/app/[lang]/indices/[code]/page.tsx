import { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValuesByDateRange, getAllIndexes } from '@/lib/indexes';
import { getFipeZapData } from '@/lib/fipezap';
import { getDictionary } from '../../../../dictionaries';
import { IndexChartLazy } from '@/components/indices/IndexChartLazy';
import { IndexHeatmapLazy } from '@/components/indices/IndexHeatmapLazy';
import { IndexDateFilterLazy } from '@/components/indices/IndexDateFilterLazy';
import { IndexHistoryTableLazy } from '@/components/indices/IndexHistoryTableLazy';
import { IPCACalculatorLazy } from '@/components/indices/IPCACalculatorLazy';
import { IPCAAlertFormLazy } from '@/components/indices/IPCAAlertFormLazy';
import Link from 'next/link';
import { ArrowLeft, MapPinned, Home, CalendarDays, Hourglass } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { FipeZapDashboardWrapper } from '@/components/indices/FipeZap/FipeZapDashboardWrapper';
import { MinimumWageDashboardWrapper } from '@/components/indices/MinimumWage/MinimumWageDashboardWrapper';
import { getMinimumWageData, MinimumWageData } from '@/lib/minimum-wage';
import {
    IBGE_RELEASE_DATES_2026, IBGE_CALENDAR_2026,
    IGPM_CALENDAR_2026, IVAR_CALENDAR_2026,
    getReleaseDay, getToday, MONTH_NAMES,
} from '@/lib/release-calendars';
import { ReleaseCalendarTable } from '@/components/indices/ReleaseCalendarTable';
import { IndexMetricsCards } from '@/components/indices/IndexMetricsCards';

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
    const indices = dict.indices ?? {};
    const indexContent = (indices as Record<string, IndexContent | undefined>)[code.toLowerCase()];

    let title = indexContent?.title || `Índice ${metadata.code} - Histórico, Tabela e Gráfico 2026 | Kitnets`;
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
    const indices = dict.indices ?? {};
    const indexContent = (indices as Record<string, IndexContent | undefined>)[code.toLowerCase()];

    const metadata = await getIndexMetadata(code);
    if (!metadata) {
        notFound();
    }

    const startDateStr = typeof startDate === 'string' ? startDate : defaultStartDate;
    const endDateStr = typeof endDate === 'string' ? endDate : defaultEndDate;

    // Fetch history based on date range or default to recent
    const history = await getIndexValuesByDateRange(metadata.id, startDateStr, endDateStr);
    const latest = history[0];

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

    // Hardcoded FAQ for IPCA/INPC (SEO-optimized)
    const ipcaFaqItems = (code === 'IPCA' || code === 'INPC') ? [
        {
            '@type': 'Question',
            name: `O que é o ${code}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: code === 'IPCA'
                    ? 'O IPCA (Índice Nacional de Preços ao Consumidor Amplo) é o indicador oficial de inflação do Brasil. Calculado mensalmente pelo IBGE, ele mede a variação de preços de bens e serviços consumidos por famílias com renda de 1 a 40 salários mínimos. É usado pelo Banco Central como meta de inflação e serve de referência para reajuste de aluguéis, contratos e salários.'
                    : 'O INPC (Índice Nacional de Preços ao Consumidor) mede a variação de preços para famílias com renda de 1 a 5 salários mínimos. Calculado pelo IBGE, é amplamente usado para reajuste de salários, benefícios previdenciários e acordos coletivos.'
            }
        },
        {
            '@type': 'Question',
            name: `Como calcular o reajuste de aluguel pelo ${code}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `Para calcular o reajuste pelo ${code}, multiplique o valor atual pelo fator (1 + ${code} acumulado 12 meses / 100). Na Kitnets.com, você pode usar a calculadora de correção pelo ${code} para simular automaticamente o valor corrigido entre quaisquer duas datas.`
            }
        },
        {
            '@type': 'Question',
            name: `Quando sai o próximo ${code}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `O ${code} é divulgado pelo IBGE por volta do dia 10 de cada mês, referente ao mês anterior. A data exata da próxima divulgação é informada no topo da página do ${code} na Kitnets.com. Você também pode se cadastrar para receber um alerta por e-mail ou WhatsApp.`
            }
        }
    ] : null;

    const allFaqItems = [
        ...(faqItems || []),
        ...(ipcaFaqItems || [])
    ];

    const faqJsonLd = allFaqItems.length > 0 ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: allFaqItems
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

    const t = dict.indexPage;
    const ctaContent = dict.indicesCta;

    // Compute today once for the entire render
    const today = getToday();

    // Compute next release date for Event schema (IPCA/INPC)
    const nextReleaseDate = (() => {
        if (code !== 'IPCA' && code !== 'INPC') return null;
        if (!latest) return null;
        let nextRefMonth = latest.month + 1;
        let nextRefYear = latest.year;
        if (nextRefMonth > 12) { nextRefMonth = 1; nextRefYear++; }
        let relMonth = nextRefMonth + 1;
        let relYear = nextRefYear;
        if (relMonth > 12) { relMonth = 1; relYear++; }
        let day = getReleaseDay(IBGE_RELEASE_DATES_2026, 2026, relMonth, relYear);
        let date = new Date(relYear, relMonth - 1, day);
        if (date <= today) {
            relMonth++;
            if (relMonth > 12) { relMonth = 1; relYear++; }
            day = getReleaseDay(IBGE_RELEASE_DATES_2026, 2026, relMonth, relYear);
            date = new Date(relYear, relMonth - 1, day);
        }
        return date;
    })();

    const eventJsonLd = nextReleaseDate ? {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `Divulgação do ${code} – ${nextReleaseDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
        startDate: nextReleaseDate.toISOString().split('T')[0],
        endDate: nextReleaseDate.toISOString().split('T')[0],
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
            '@type': 'VirtualLocation',
            url: `https://kitnets.com/${lang}/indices/${code.toLowerCase()}`
        },
        organizer: {
            '@type': 'Organization',
            name: 'IBGE',
            url: 'https://www.ibge.gov.br'
        },
        description: `O IBGE divulga o novo ${code} referente ao mês anterior. Acompanhe o resultado em tempo real na Kitnets.com.`
    } : null;

    return (
        <div className="container mx-auto py-4 md:py-10 px-4 max-w-5xl">
            <Link href={`/${lang}`} passHref>
                <div className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-2">
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    {t.back}
                </div>
            </Link>

            {/* Header Section */}
            <div className="space-y-4 mb-6 md:mb-8">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
                        {(code === 'IPCA' || code === 'INPC') && indexContent?.title
                            ? indexContent.title
                            : code === 'REAJUSTE-SALARIO-MINIMO'
                                ? metadata.code.replace(/-/g, ' ')
                                : metadata.code
                        }
                    </h1>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${metadata.is_official ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80' : 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                        {metadata.is_official ? t.official : t.projection}
                    </span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground border-border">
                        {(() => {
                            const categoryMap: Record<string, string> = {
                                rent: t.categoryRent,
                                market: t.categoryMarket,
                                inflation: t.categoryInflation,
                            };
                            const category = code === 'IGPM' ? 'inflation' : metadata.category;
                            return categoryMap[category] ?? category;
                        })()}
                    </span>
                </div>
                {code !== 'REAJUSTE-SALARIO-MINIMO' && !(code === 'IPCA' || code === 'INPC') && (
                    <h2 className="text-xl text-muted-foreground">{metadata.name}</h2>
                )}

                {/* SEO-rich intro for IPCA/INPC */}
                {(code === 'IPCA' || code === 'INPC') && indexContent ? (
                    <div className="max-w-3xl space-y-3">
                        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                            {indexContent.description}
                        </p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                            {[
                                t.rentAdjust,
                                t.contractUpdate,
                                t.salaryCorrection,
                                t.economicAnalysis,
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-muted-foreground/80">
                            {indexContent.pageDescription} {t.source}: <strong>{metadata.source}</strong>.
                        </p>
                    </div>
                ) : (
                    <p className="max-w-3xl text-muted-foreground/80">
                        {t.followEvolution} {code === 'REAJUSTE-SALARIO-MINIMO' ? metadata.code.replace(/-/g, ' ') : metadata.code}, {t.updatedMonthly}
                        {t.source}: <strong>{metadata.source}</strong>.
                    </p>
                )}
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
                    <IndexMetricsCards
                        code={code}
                        lang={lang}
                        latest={latest}
                        today={today}
                        labels={{
                            today: t.today,
                            referentTo: t.referentTo,
                            accumulated12m: t.accumulated12m,
                            last12m: t.last12m,
                            accumulatedYear: t.accumulatedYear,
                            until: t.until,
                            nextRelease: t.nextRelease,
                        }}
                    />

                    {/* IPCA/INPC Correction Calculator */}
                    {(code === 'IPCA' || code === 'INPC') && (
                        <Suspense fallback={<div className="rounded-xl border bg-card shadow-sm p-6 h-48 animate-pulse" />}>
                            <IPCACalculatorLazy indexCode={code} />
                        </Suspense>
                    )}

                    {/* IPCA/INPC Alert Form */}
                    {(code === 'IPCA' || code === 'INPC') && (
                        <Suspense fallback={<div className="rounded-xl border bg-card shadow-sm p-6 h-32 animate-pulse" />}>
                            <IPCAAlertFormLazy indexCode={code} lang={lang} />
                        </Suspense>
                    )}

                    {/* Date Filter */}
                    <div className="md:col-span-3 min-w-0">
                        <h3 className="text-lg md:text-xl font-semibold text-foreground mb-3">
                            {t.filterHistory} {code !== 'FIPEZAP' ? `do ${code}` : ''}
                        </h3>
                        <Suspense fallback={<div className="bg-card border rounded-xl p-4 shadow-sm mb-6 h-20 animate-pulse" />}>
                            <IndexDateFilterLazy
                                defaultStartDate={defaultStartDate}
                                defaultEndDate={defaultEndDate}
                            />
                        </Suspense>
                    </div>

                    {/* Chart Section */}
                    <div id="grafico" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">{t.chartTitle}</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">{t.chartSubtitle}</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <Suspense fallback={<div className="h-[250px] md:h-[350px] w-full bg-muted/20 animate-pulse rounded-lg" />}>
                                    <IndexChartLazy data={history} indexCode={code} />
                                </Suspense>
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Section */}
                    <div id="mapa-calor" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">{t.heatmapTitle}</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">{t.heatmapSubtitle}</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <Suspense fallback={<div className="h-[300px] w-full bg-muted/20 animate-pulse rounded-lg" />}>
                                    <IndexHeatmapLazy data={history} />
                                </Suspense>
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div id="tabela" className="md:col-span-3 min-w-0 scroll-mt-20">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">{t.tableTitle}</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">{t.tableSubtitle}</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <Suspense fallback={
                                    <div className="w-full space-y-2">
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div key={i} className="h-10 w-full bg-muted/20 animate-pulse rounded" />
                                        ))}
                                    </div>
                                }>
                                    <IndexHistoryTableLazy data={history} />
                                </Suspense>
                            </div>
                            <p className="text-xs text-center text-muted-foreground pb-3 md:hidden">{t.swipeHint}</p>
                        </div>
                    </div>

                    {/* IGPM Calendar */}
                    {code === 'IGPM' && (
                        <ReleaseCalendarTable
                            title="Calendário de divulgação IGP-M 2026"
                            items={IGPM_CALENDAR_2026}
                            pesquisa="IGP-M e os componentes: IPA-M e IPC-M"
                        />
                    )}

                    {/* IPCA / INPC Calendar */}
                    {(code === 'IPCA' || code === 'INPC') && (
                        <ReleaseCalendarTable
                            title={`Calendário de divulgação ${code} 2026`}
                            items={IBGE_CALENDAR_2026}
                            pesquisa={`${code} — Índice Nacional de Preços ao Consumidor ${code === 'IPCA' ? 'Amplo' : ''}`}
                        />
                    )}

                    {/* IVAR Calendar */}
                    {code === 'IVAR' && (
                        <ReleaseCalendarTable
                            title="Calendário de divulgação IVAR 2026"
                            items={IVAR_CALENDAR_2026}
                        />
                    )}
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
                            const months = MONTH_NAMES[lang] || MONTH_NAMES['pt'];
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

                                {dynamicText && (() => {
                                    const linkPhrase = 'calculadora de reajuste de aluguel';
                                    const lowerText = dynamicText.toLowerCase();
                                    const linkIdx = lowerText.lastIndexOf(linkPhrase);
                                    if (linkIdx === -1) {
                                        return <p className="text-muted-foreground leading-relaxed">{dynamicText}</p>;
                                    }
                                    const before = dynamicText.slice(0, linkIdx);
                                    const match = dynamicText.slice(linkIdx, linkIdx + linkPhrase.length);
                                    const after = dynamicText.slice(linkIdx + linkPhrase.length);
                                    return (
                                        <p className="text-muted-foreground leading-relaxed">
                                            {before}
                                            <Link href={`/${lang}/calculadora-reajuste-aluguel`} className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                                                {match}
                                            </Link>
                                            {after}
                                        </p>
                                    );
                                })()}

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
            {(code === 'IPCA' || code === 'INPC') && (
                <section className="mt-16 max-w-3xl">
                    <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground mb-3">
                        {lang === 'pt' ? 'Calculadora de Correção pelo' : lang === 'es' ? 'Calculadora de Corrección por' : 'Correction Calculator by'} {code}
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                        {lang === 'pt' ? `Simule a atualização de valores pelo ${code} entre duas datas. Ideal para:` : lang === 'es' ? `Simule la actualización de valores por ${code} entre dos fechas. Ideal para:` : `Simulate value adjustments using ${code} between two dates. Ideal for:`}
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-4">
                        {[
                            t.rentAdjust,
                            t.contractUpdate,
                            t.judicialCorrection,
                            t.purchasingPower,
                        ].map((item) => (
                            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t.calcIntro}
                    </p>

                    {/* Internal links for SEO */}
                    <nav className="mt-6 pt-4 border-t border-border" aria-label={t.relatedPages}>
                        <h3 className="text-sm font-semibold text-foreground mb-2">{t.relatedPages}</h3>
                        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                            <li>
                                <Link href={`/${lang}/calculadora-reajuste-aluguel`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                                    {t.rentAdjustCalc}
                                </Link>
                            </li>
                            <li>
                                <Link href={`/${lang}/indices/igpm`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                                    {t.igpmHistory}
                                </Link>
                            </li>
                            <li>
                                <Link href={`/${lang}/indices/${code === 'IPCA' ? 'inpc' : 'ipca'}`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                                    {code === 'IPCA' ? t.inpcHistory : t.ipcaHistory}
                                </Link>
                            </li>
                            <li>
                                <Link href={`/${lang}/indices/ivar`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                                    {t.ivarHistory}
                                </Link>
                            </li>
                        </ul>
                    </nav>
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
                </div>
            </div>

            {/* IPCA/INPC Alert Form — Standalone card below CTA */}
            {(code === 'IPCA' || code === 'INPC') && (
                <div className="mt-10 w-full">
                    <Suspense fallback={<div className="rounded-xl border bg-card shadow-sm p-6 h-32 animate-pulse" />}>
                        <IPCAAlertFormLazy indexCode={code} lang={lang} />
                    </Suspense>
                </div>
            )}

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
            {eventJsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
                />
            )}
        </div>
    );
}
