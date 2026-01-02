import { getDictionary } from '@/dictionaries';
import { Calendar, Clock, DollarSign, Wallet, ArrowUpRight, TrendingUp, Globe, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);
    return {
        title: `Salário mínimo 2026 no Brasil: valor, reajuste e impactos | Kitnets.com`,
        description: "Confira o novo valor do salário mínimo de 2026, entenda o cálculo do reajuste e o impacto na economia brasileira.",
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos/salario-e-renda/salario-minimo-2026`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos/salario-e-renda/salario-minimo-2026',
                'en': 'https://kitnets.com/en/conteudos/salario-e-renda/salario-minimo-2026',
                'es': 'https://kitnets.com/es/conteudos/salario-e-renda/salario-minimo-2026',
            },
        },
    };
}

export default async function MinimumWage2026({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Salário mínimo 2026 no Brasil: valor, reajuste e impactos na economia',
        datePublished: '2026-01-01',
        dateModified: '2026-01-01',
        author: {
            '@type': 'Person',
            name: 'Artur Pedrosa',
            url: `https://kitnets.com/${lang}/autor/artur-pedrosa`,
        },
        publisher: {
            '@type': 'Organization',
            name: 'Kitnets.com',
            logo: {
                '@type': 'ImageObject',
                url: 'https://kitnets.com/kitnets-logo.png',
            },
        },
        description: 'O salário mínimo de 2026 no Brasil passou a vigorar em 1º de janeiro, com o novo valor fixado em R$ 1.621.',
        reviewedBy: {
            '@type': 'Organization',
            name: 'Equipe Editorial Kitnets.com',
        },
    };

    return (
        <article className="container max-w-4xl py-12 space-y-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* Header */}
            <header className="space-y-6">
                <div className="flex items-center gap-2 text-sm text-primary font-medium">
                    <Link href={`/${lang}/conteudos`} className="hover:underline opacity-80">Conteúdos</Link>
                    <span>/</span>
                    <Link href={`/${lang}/conteudos/salario-e-renda`} className="hover:underline opacity-80">Salário e Renda</Link>
                </div>

                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight text-foreground">
                    Salário mínimo 2026 no Brasil: valor, reajuste e impactos na economia
                </h1>

                <p className="text-xl text-muted-foreground leading-relaxed">
                    O salário mínimo de 2026 no Brasil passou a vigorar em 1º de janeiro, com o novo valor fixado em R$ 1.621. O reajuste representa um aumento de 6,79%, equivalente a R$ 103 em relação ao salário mínimo anterior, que era de R$ 1.518.
                </p>

                <div className="pt-6 border-t border-border space-y-4">
                    <div className="flex gap-4 items-start">
                        <div className="flex-shrink-0 pt-1">
                            <Link href={`/${lang}/autor/artur-pedrosa`}>
                                <div className="relative h-12 w-12 rounded-full overflow-hidden border border-border">
                                    <Image
                                        src="/images/authors/artur-pedrosa.jpg"
                                        alt="Artur Pedrosa"
                                        fill
                                        sizes="48px"
                                        className="object-cover"
                                    />
                                </div>
                            </Link>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="font-semibold text-foreground">
                                Por <Link href={`/${lang}/autor/artur-pedrosa`} className="hover:text-primary hover:underline transition-colors">Artur Pedrosa</Link>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Fundador da Kitnets.com | Especialista em mercado imobiliário e finanças pessoais
                            </div>
                            <div className="text-xs text-muted-foreground/60 uppercase tracking-wide font-medium">
                                Revisado pela Equipe Editorial Kitnets.com
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>01 Jan 2026</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>5 min de leitura</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Body */}
            <div className="prose prose-lg dark:prose-invert max-w-none space-y-8 text-foreground/90">
                <p>
                    A atualização já se aplica aos salários e benefícios referentes a janeiro, pagos no início de fevereiro.
                </p>
                <p>
                    A confirmação oficial do novo valor foi feita pelo Ministério do Planejamento e Orçamento após a divulgação do INPC, índice que serve de base para o cálculo anual do salário mínimo.
                </p>

                <div className="bg-card border border-border p-6 rounded-xl my-8 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1 space-y-2 text-center md:text-left">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Novo Valor (2026)</span>
                            <div className="text-4xl font-extrabold text-primary">R$ 1.621,00</div>
                            <div className="text-sm text-green-600 font-medium flex items-center justify-center md:justify-start gap-1">
                                <TrendingUp className="h-4 w-4" />
                                +6,79% de aumento
                            </div>
                        </div>
                        <div className="w-px h-16 bg-border hidden md:block"></div>
                        <div className="flex-1 space-y-2 text-center md:text-left">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Aumento Real</span>
                            <div className="text-xl font-bold text-foreground">R$ 103,00</div>
                            <div className="text-sm text-muted-foreground">Sobre os R$ 1.518 de 2025</div>
                        </div>
                    </div>
                </div>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <DollarSign className="h-7 w-7 text-primary" />
                    Como foi calculado o salário mínimo de 2026
                </h2>
                <p>
                    A política de reajuste do salário mínimo combina correção inflacionária com ganho real, seguindo regras definidas em lei e condicionadas ao arcabouço fiscal.
                </p>

                <div className="space-y-6 my-8">
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">1</div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">Correção pela inflação (INPC)</h3>
                            <p className="text-muted-foreground">
                                O Índice Nacional de Preços ao Consumidor (INPC), apurado pelo IBGE, acumulou 4,18% em 12 meses até novembro de 2025. Esse percentual recompõe o poder de compra do trabalhador frente à inflação.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">2</div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">Crescimento econômico (PIB)</h3>
                            <p className="text-muted-foreground">
                                Além da inflação, a regra prevê a incorporação do crescimento do PIB de dois anos antes. Em dezembro, o IBGE revisou os dados do PIB de 2024, confirmando uma expansão de 3,4% da economia brasileira.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">3</div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">Limite imposto pelo arcabouço fiscal</h3>
                            <p className="text-muted-foreground">
                                Apesar do crescimento econômico mais forte, o arcabouço fiscal limita o ganho real do salário mínimo a um intervalo entre 0,6% e 2,5% acima da inflação. Esse teto visa controlar a trajetória dos gastos públicos, especialmente em um cenário de maior rigor fiscal.
                            </p>
                        </div>
                    </div>
                </div>

                <p className="bg-muted p-4 rounded-lg border-l-4 border-primary text-sm font-medium">
                    Com base nessas regras, o valor técnico do salário mínimo chegaria a R$ 1.620,99, que, após o arredondamento legal, foi fixado em R$ 1.621.
                </p>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Globe className="h-7 w-7 text-primary" />
                    Impacto do novo salário mínimo na economia
                </h2>
                <p>
                    De acordo com estimativas do Dieese, o novo salário mínimo deve injetar cerca de <strong>R$ 81,7 bilhões</strong> na economia brasileira. Esse efeito ocorre por meio de:
                </p>
                <ul className="grid md:grid-cols-3 gap-4 list-none pl-0 my-6">
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <ArrowUpRight className="h-5 w-5 text-green-500 mb-2" />
                        <strong>Aumento da renda disponível</strong> de trabalhadores e aposentados
                    </li>
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <Wallet className="h-5 w-5 text-blue-500 mb-2" />
                        <strong>Estímulo ao consumo</strong>, especialmente nos setores de varejo e serviços
                    </li>
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <FileText className="h-5 w-5 text-orange-500 mb-2" />
                        <strong>Impacto positivo indireto</strong> na arrecadação de tributos
                    </li>
                </ul>
                <p>
                    Mesmo sob restrições fiscais mais rígidas, o reajuste do salário mínimo continua sendo um dos principais mecanismos de distribuição de renda no país.
                </p>

                <h2 className="text-2xl font-bold mt-12 mb-6">Quem é diretamente afetado pelo reajuste</h2>
                <p>O novo valor do salário mínimo impacta milhões de brasileiros, incluindo:</p>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                    <li>Trabalhadores formais que recebem piso salarial;</li>
                    <li>Beneficiários do INSS, como aposentados e pensionistas;</li>
                    <li>Programas sociais e benefícios vinculados ao salário mínimo;</li>
                    <li>Contratos privados que utilizam o piso nacional como referência de reajuste.</li>
                </ul>

                <div className="my-12 p-8 bg-gradient-to-br from-muted to-background rounded-2xl border border-border">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <Clock className="h-6 w-6 text-primary" />
                        Salário mínimo e reajustes ao longo do tempo
                    </h2>
                    <p className="mb-6 text-muted-foreground">
                        A evolução do salário mínimo reflete não apenas a inflação, mas também decisões de política econômica, ciclos de crescimento e mudanças no regime fiscal. Para quem acompanha o poder de compra ao longo dos anos — seja por interesse pessoal, planejamento financeiro ou análise econômica — o histórico completo é fundamental.
                    </p>
                    <p className="mb-6 font-medium">
                        No Kitnets.com, é possível consultar a série histórica completa do salário mínimo no Brasil, com filtros por ano, valores nominais e comparações entre períodos.
                    </p>
                    <Link
                        href={`/${lang}/indices/reajuste-salario-minimo`}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Veja todos os reajustes desde o Plano Real <ArrowRight className="h-4 w-4" />
                    </Link>
                    <p className="mt-4 text-sm text-muted-foreground">
                        Essa base histórica ajuda a entender como o salário mínimo evoluiu, como se comportou em diferentes governos e qual foi seu papel na economia brasileira ao longo das últimas décadas.
                    </p>
                </div>

                <div className="border-t-2 border-primary/20 pt-10 mt-16">
                    <h2 className="text-3xl font-bold mb-6">Conclusão</h2>
                    <p>
                        O salário mínimo de R$ 1.621 em 2026 representa um reajuste relevante, que recompõe a inflação e garante ganho real dentro dos limites do arcabouço fiscal. Além de afetar diretamente a renda de milhões de brasileiros, o novo valor tem impacto macroeconômico expressivo, reforçando o consumo e a atividade econômica.
                    </p>
                    <p className="font-medium text-lg text-primary mt-4">
                        Acompanhar o salário mínimo — não apenas o valor atual, mas sua trajetória histórica — é essencial para entender o mercado de trabalho, os benefícios sociais e o próprio custo de vida no Brasil.
                    </p>
                </div>

                <div className="flex flex-col gap-2 mt-8 text-sm text-muted-foreground bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 font-medium">
                        <FileText className="h-4 w-4" />
                        Fonte Oficial
                    </div>
                    <span className="text-muted-foreground">
                        Ministério do Planejamento e Orçamento / IBGE (Índice Nacional de Preços ao Consumidor - INPC)
                    </span>
                </div>
            </div>
        </article>
    );
}
