import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValuesByDateRange, getAllIndexes } from '@/lib/indexes';
import { getFipeZapData } from '@/lib/fipezap';
import { getDictionary } from '../../../../dictionaries';
import { IndexChart } from '@/components/indices/IndexChart';
import { IndexHeatmap } from '@/components/indices/IndexHeatmap';
import { IndexDateFilter } from '@/components/indices/IndexDateFilter';
import { IndexHistoryTable } from '@/components/indices/IndexHistoryTable';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { FipeZapDashboardWrapper } from '@/components/indices/FipeZap/FipeZapDashboardWrapper';

interface Props {
    params: Promise<{
        lang: string;
        code: string;
    }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
    const indexContent = (dict as any).indices?.[code.toLowerCase()];

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
            tags: [metadata.code, 'Economia', 'Índices'],
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
    const indexContent = (dict as any).indices?.[code.toLowerCase()];

    const metadata = await getIndexMetadata(code);
    if (!metadata) {
        notFound();
    }

    const startDateStr = typeof startDate === 'string' ? startDate : defaultStartDate;
    const endDateStr = typeof endDate === 'string' ? endDate : defaultEndDate;

    // Fetch history based on date range or default to recent
    const history = await getIndexValuesByDateRange(metadata.id, startDateStr, endDateStr);
    const latest = history[0];

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
        temporalCoverage: history.length > 0 ? `${history[history.length - 1].year}-${history[history.length - 1].month}/${history[0].year}-${history[0].month}` : '2023-2025',
        variableMeasured: 'Percentage Change',
        dateModified: latest ? new Date(latest.year, latest.month - 1, 1).toISOString() : new Date().toISOString(),
    };

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
                    <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{metadata.code}</h1>
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
                <h2 className="text-xl text-muted-foreground">{metadata.name}</h2>
                <p className="max-w-3xl text-muted-foreground/80">
                    Acompanhe a evolução do {metadata.code}, atualizado mensalmente.
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

            {/* Standard Index Layout for non-FIPEZAP */}
            {code !== 'FIPEZAP' && (
                <div className="grid gap-3 md:grid-cols-3 md:gap-6">
                    {/* Key Metrics Cards */}
                    <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                        {/* Card 1: Variação Mensal */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                                <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">{code} hoje:</h3>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <div className="text-2xl md:text-3xl font-bold text-primary">
                                    {latest ? `${latest.value_percent}%` : '--'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Referente a {latest ? `${latest.month.toString().padStart(2, '0')}/${latest.year}` : '--'}
                                </p>
                            </div>
                        </div>

                        {/* Card 2: Acumulado 12m */}
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
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
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
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
                                                return '07 de jan';
                                            }

                                            // Default (IPCA, etc) - Release happens month AFTER Next Ref Month (2 months after latest data month?)
                                            // Logic in original code: nextRef = latest+1. Release = nextRef+1.
                                            // Example: Latest = Nov. Next Ref = Dec. Release for Dec = Jan.
                                            // So releaseMonth = nextRefMonth + 1.
                                            let releaseMonth = nextRefMonth + 1;
                                            let releaseYear = nextRefYear;
                                            if (releaseMonth > 12) {
                                                releaseMonth = 1;
                                                releaseYear++;
                                            }

                                            // Format 09/MMM (IPCA usually around 9th-11th)
                                            const date = new Date(releaseYear, releaseMonth - 1, 9);
                                            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Date Filter */}
                    <div className="md:col-span-3 min-w-0">
                        <IndexDateFilter
                            key={`${startDateStr || 'start'}-${endDateStr || 'end'}`}
                            defaultStartDate={defaultStartDate}
                            defaultEndDate={defaultEndDate}
                        />
                    </div>

                    {/* Chart Section */}
                    <div className="md:col-span-3 min-w-0">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Histórico de Variação (%)</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Visualização gráfica da evolução do índice no período selecionado.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexChart data={history} indexCode={code} />
                            </div>
                        </div>
                    </div>

                    {/* Heatmap Section */}
                    <div className="md:col-span-3 min-w-0">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Mapa de Calor Mensal</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Comportamento mensal e acumulado anual.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexHeatmap data={history} />
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="md:col-span-3 min-w-0">
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                                <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Série Histórica</h3>
                                <p className="text-xs md:text-sm text-muted-foreground">Valores detalhados mês a mês.</p>
                            </div>
                            <div className="p-3 md:p-6 pt-0">
                                <IndexHistoryTable data={history} />
                            </div>
                        </div>
                    </div>

                    {/* IGPM Calendar Specific Section */}
                    {code === 'IGPM' && (
                        <div className="md:col-span-3 min-w-0">
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
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4 font-medium">29/01/2026</td>
                                                <td className="p-4 text-muted-foreground">IGP-M e os componentes: IPA-M e IPC-M</td>
                                                <td className="p-4 text-muted-foreground">Janeiro/2026</td>
                                                <td className="p-4 text-muted-foreground">8h</td>
                                            </tr>
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4 font-medium">26/02/2026</td>
                                                <td className="p-4 text-muted-foreground">IGP-M e os componentes: IPA-M e IPC-M</td>
                                                <td className="p-4 text-muted-foreground">Fevereiro/2026</td>
                                                <td className="p-4 text-muted-foreground">8h</td>
                                            </tr>
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4 font-medium">30/03/2026</td>
                                                <td className="p-4 text-muted-foreground">IGP-M e os componentes: IPA-M e IPC-M</td>
                                                <td className="p-4 text-muted-foreground">Março/2026</td>
                                                <td className="p-4 text-muted-foreground">8h</td>
                                            </tr>
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4 font-medium">29/04/2026</td>
                                                <td className="p-4 text-muted-foreground">IGP-M e os componentes: IPA-M e IPC-M</td>
                                                <td className="p-4 text-muted-foreground">Abril/2026</td>
                                                <td className="p-4 text-muted-foreground">8h</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
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

                    {indexContent.sections && indexContent.sections.map((section: any, idx: number) => (
                        <section key={idx} className="space-y-4 md:space-y-6">
                            <h3 className="text-xl md:text-2xl font-semibold text-foreground">{section.title}</h3>

                            {section.text && (
                                <p className="text-muted-foreground leading-relaxed">{section.text}</p>
                            )}

                            {section.items && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {section.items.map((item: any, itemIdx: number) => (
                                        <div key={itemIdx} className="bg-card border rounded-lg p-4">
                                            <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                                            <p className="text-sm text-muted-foreground">{item.text}</p>
                                        </div>
                                    ))}
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
                    ))}

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

            {/* Authority CTA */}
            <div className="mt-20 w-full text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h3 className="text-3xl md:text-3xl font-bold tracking-tight whitespace-pre-line text-foreground">
                        {(dict as any).indicesCta?.title}
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                        {(dict as any).indicesCta?.description}
                    </p>
                    <div className="pt-4 flex flex-col items-center gap-3">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                {(dict as any).indicesCta?.button}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
        </div>
    );
}
