
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndexMetadata, getIndexValues, getAllIndexes } from '@/lib/indexes';
import { IndexChart } from '@/components/indices/IndexChart';
import { IndexHeatmap } from '@/components/indices/IndexHeatmap';
import Link from 'next/link';
import { Button } from '@kitnets/ui'; // Button exists now
import { ArrowLeft } from 'lucide-react';

export const revalidate = 3600; // Revalidate every hour


interface Props {
    params: Promise<{
        lang: string;
        code: string;
    }>;
}

export async function generateStaticParams() {
    const indices = await getAllIndexes();
    return indices.map((idx) => ({
        code: idx.code.toLowerCase(),
    }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { code } = await params;
    const metadata = await getIndexMetadata(code);

    if (!metadata) {
        return {
            title: 'Índice não encontrado',
        };
    }

    return {
        title: `Índice ${metadata.code} - Histórico, Tabela e Gráfico 2025 | Kitnets`,
        description: `Acompanhe a variação do ${metadata.code} (${metadata.name}). Tabela histórica completa dos últimos meses, gráfico de evolução e acumulado de 12 meses.`,
        alternates: {
            canonical: `/indices/${code.toLowerCase()}`,
        },
        openGraph: {
            title: `Índice ${metadata.code} - Histórico e Gráfico`,
            description: `Tabela completa e atualizada do índice ${metadata.code} (${metadata.name}).`,
            type: 'article',
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

    // Schema.org Structured Data
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `Histórico do Índice ${metadata.code}`,
        description: `Dados históricos mensais do índice ${metadata.code} (${metadata.name})`,
        provider: {
            '@type': 'Organization',
            name: 'Kitnets.com',
        },
        temporalCoverage: history.length > 0 ? `${history[history.length - 1].year}-${history[history.length - 1].month}/${history[0].year}-${history[0].month}` : '2023-2025',
        variableMeasured: 'Percentage Change',
    };

    return (
        <div className="container mx-auto py-10 px-4 max-w-5xl">
            <Link href={`/${lang}`} passHref>
                <Button variant="ghost" className="mb-6 pl-0 hover:bg-transparent hover:text-primary">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Home
                </Button>
            </Link>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Header Section */}
                <div className="md:col-span-3 space-y-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold tracking-tight">{metadata.code}</h1>
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
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-6 pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Variação Mensal</h3>
                    </div>
                    <div className="p-6 pt-0">
                        <div className="text-3xl font-bold">
                            {latest ? `${latest.value_percent}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Referência: {latest ? `${latest.month}/${latest.year}` : '--'}
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-6 pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Acumulado 12 Meses</h3>
                    </div>
                    <div className="p-6 pt-0">
                        <div className="text-3xl font-bold">
                            {latest?.accumulated_12m ? `${latest.accumulated_12m}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Últimos 12 meses
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-6 pb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Frequência</h3>
                    </div>
                    <div className="p-6 pt-0">
                        <div className="text-3xl font-bold capitalize">
                            {metadata.frequency === 'monthly' ? 'Mensal' : metadata.frequency}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Atualização
                        </p>
                    </div>
                </div>

                {/* Chart Section */}
                <div className="md:col-span-3">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1.5 p-6">
                            <h3 className="text-2xl font-semibold leading-none tracking-tight">Histórico de Variação (%)</h3>
                            <p className="text-sm text-muted-foreground">Visualização gráfica da evolução do índice nos últimos 5 anos.</p>
                        </div>
                        <div className="p-6 pt-0">
                            <IndexChart data={history} indexCode={code} />
                        </div>
                    </div>
                </div>

                {/* Heatmap Section */}
                <div className="md:col-span-3">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1.5 p-6">
                            <h3 className="text-2xl font-semibold leading-none tracking-tight">Mapa de Calor Mensal</h3>
                            <p className="text-sm text-muted-foreground">Comportamento mensal e acumulado anual.</p>
                        </div>
                        <div className="p-6 pt-0">
                            <IndexHeatmap data={history} />
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="md:col-span-3">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                        <div className="flex flex-col space-y-1.5 p-6">
                            <h3 className="text-2xl font-semibold leading-none tracking-tight">Tabela de Dados Históricos</h3>
                            <p className="text-sm text-muted-foreground">Valores detalhados mês a mês.</p>
                        </div>
                        <div className="p-6 pt-0">
                            <div className="w-full overflow-auto">
                                <table className="w-full caption-bottom text-sm">
                                    <thead className="[&_tr]:border-b">
                                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 w-[200px]">Mês/Ano</th>
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
        </div>
    );
}
