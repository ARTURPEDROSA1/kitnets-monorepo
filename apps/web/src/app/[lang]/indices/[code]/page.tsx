
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValues, getAllIndexes } from '@/lib/indexes';
import { IndexChart } from '@/components/indices/IndexChart';
import { IndexHeatmap } from '@/components/indices/IndexHeatmap';
import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

interface Props {
    params: Promise<{
        lang: string;
        code: string;
    }>;
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

    return {
        title: `Índice ${metadata.code} - Histórico, Tabela e Gráfico 2025 | Kitnets`,
        description: `Acompanhe a variação do ${metadata.code} (${metadata.name}). Tabela histórica completa dos últimos meses, gráfico de evolução e acumulado de 12 meses.`,
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
            title: `Índice ${metadata.code} - Histórico e Gráfico`,
            description: `Tabela completa e atualizada do índice ${metadata.code} (${metadata.name}).`,
            type: 'article',
            siteName: 'Kitnets',
            locale: lang,
            tags: [metadata.code, 'Economia', 'Índices'],
        },
        twitter: {
            card: 'summary_large_image',
            title: `Índice ${metadata.code} - Histórico e Gráfico`,
            description: `Acompanhe a variação do ${metadata.code}. Dados atualizados mensalmente.`,
        }
    };
}

export default async function IndexPage({ params }: Props) {
    const { code: codeParam, lang } = await params;
    const code = codeParam.toUpperCase();

    const metadata = await getIndexMetadata(code);
    if (!metadata) {
        notFound();
    }

    // Fetch last 60 months (5 years) to populate heatmap with decent history
    const history = await getIndexValues(metadata.id, 60);
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

            <div className="grid gap-3 md:grid-cols-3 md:gap-6">
                {/* Header Section */}
                <div className="md:col-span-3 space-y-2 md:space-y-4">
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

                {/* Chart Section */}
                <div className="md:col-span-3 min-w-0">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                            <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">Histórico de Variação (%)</h3>
                            <p className="text-xs md:text-sm text-muted-foreground">Visualização gráfica da evolução do índice nos últimos 5 anos.</p>
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
