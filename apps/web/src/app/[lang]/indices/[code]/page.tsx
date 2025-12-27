
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValuesByDateRange, getAllIndexes } from '@/lib/indexes';
import { getDictionary } from '../../../../dictionaries';
import { IndexChart } from '@/components/indices/IndexChart';
import { IndexHeatmap } from '@/components/indices/IndexHeatmap';
import { IndexDateFilter } from '@/components/indices/IndexDateFilter';
import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { code, lang } = await params;
    const metadata = await getIndexMetadata(code);

    if (!metadata) {
        return {
            title: 'Índice não encontrado',
        };
    }

    const dict = getDictionary(lang as "pt" | "en" | "es");
    const indexContent = (dict as any).indices?.[code.toLowerCase()];

    const title = indexContent?.title || `Índice ${metadata.code} - Histórico, Tabela e Gráfico 2025 | Kitnets`;
    const description = indexContent?.description || `Acompanhe a variação do ${metadata.code} (${metadata.name}). Tabela histórica completa dos últimos meses, gráfico de evolução e acumulado de 12 meses.`;

    return {
        title,
        description,
        keywords: [metadata.code, metadata.name, 'índice econômico', 'inflação', 'reajuste aluguel', 'brasil', 'economia', 'histórico', 'tabela', 'gráfico'],
        authors: [{ name: 'Kitnets.com' }],
        applicationName: 'Kitnets',
        alternates: {
            canonical: `/${lang}/indices/${code.toLowerCase()}`,
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
    const { startDate, endDate } = await searchParams;
    const code = codeParam.toUpperCase();

    const dict = getDictionary(lang as "pt" | "en" | "es");
    const indexContent = (dict as any).indices?.[code.toLowerCase()];

    const metadata = await getIndexMetadata(code);
    if (!metadata) {
        notFound();
    }

    const startDateStr = typeof startDate === 'string' ? startDate : undefined;
    const endDateStr = typeof endDate === 'string' ? endDate : undefined;

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
                        {metadata.category}
                    </span>
                </div>
                <h2 className="text-xl text-muted-foreground">{metadata.name}</h2>
                <p className="max-w-3xl text-muted-foreground/80">
                    Acompanhe a evolução do {metadata.code}, atualizado mensalmente.
                    Fonte: <strong>{metadata.source}</strong>.
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3 md:gap-6">

                {/* Key Metrics Cards */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                            <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Variação Mensal</h3>
                        </div>
                        <div className="p-3 md:p-6 pt-0">
                            <div className="text-2xl md:text-3xl font-bold">
                                {latest ? `${latest.value_percent}%` : '--'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Ref: {latest ? `${latest.month}/${latest.year}` : '--'}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                            <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Acumulado 12m</h3>
                        </div>
                        <div className="p-3 md:p-6 pt-0">
                            <div className="text-2xl md:text-3xl font-bold">
                                {latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '--'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Últimos 12 meses
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1 p-3 md:p-6 pb-1 md:pb-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Frequência</h3>
                        </div>
                        <div className="p-3 md:p-6 pt-0">
                            <div className="text-2xl md:text-3xl font-bold capitalize">
                                {metadata.frequency === 'monthly' ? 'Mensal' : metadata.frequency}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Atualização
                            </p>
                        </div>
                    </div>
                </div>

                {/* Date Filter */}
                <div className="md:col-span-3 min-w-0">
                    <IndexDateFilter key={`${startDateStr || 'start'}-${endDateStr || 'end'}`} />
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
                            <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Tabela de Dados Históricos</h3>
                            <p className="text-xs md:text-sm text-muted-foreground">Valores detalhados mês a mês.</p>
                        </div>
                        <div className="p-3 md:p-6 pt-0">
                            <div className="w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 min-w-[100px]">Mês/Ano</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Índice no Mês (%)</th>
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">Acumulado 12m (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {history.map((row) => (
                                            <tr key={row.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 font-medium">
                                                    {row.month.toString().padStart(2, '0')}/{row.year}
                                                </td>
                                                <td className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${row.value_percent < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                    {row.value_percent > 0 ? '+' : ''}{row.value_percent}%
                                                </td>
                                                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                                                    {row.accumulated_12m ? `${row.accumulated_12m}%` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Index Specific Content (SEO) */}
            {
                indexContent && (
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
                )
            }

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
        </div >
    );
}
