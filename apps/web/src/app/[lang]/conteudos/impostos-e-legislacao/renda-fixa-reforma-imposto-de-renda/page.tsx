import { getDictionary } from '@/dictionaries';
import { Calendar, Clock, TrendingUp, FileText, BadgePercent, Coins, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);
    return {
        title: `Como fica a renda fixa com a reforma do Imposto de Renda | Kitnets.com`,
        description: "A reforma do Imposto de Renda (PL 1087/2025) não muda a tributação direta do CDB e Tesouro, mas altera o planejamento para altas rendas. Entenda.",
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos/impostos-e-legislacao/renda-fixa-reforma-imposto-de-renda`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos/impostos-e-legislacao/renda-fixa-reforma-imposto-de-renda',
                'en': 'https://kitnets.com/en/conteudos/impostos-e-legislacao/renda-fixa-reforma-imposto-de-renda',
                'es': 'https://kitnets.com/es/conteudos/impostos-e-legislacao/renda-fixa-reforma-imposto-de-renda',
            },
        },
    };
}

export default async function RendaFixaArticle({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Como fica a renda fixa (CDB, Tesouro Direto e fundos) com a reforma do Imposto de Renda',
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
        description: 'A reforma do Imposto de Renda proposta pelo PL 1087/2025 não altera diretamente a forma de tributação da renda fixa tradicional, mas muda o contexto para contribuintes de alta renda.',
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
                    <Link href={`/${lang}/conteudos/impostos-e-legislacao`} className="hover:underline opacity-80">Impostos e Legislação</Link>
                </div>

                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight text-foreground">
                    Como fica a renda fixa (CDB, Tesouro Direto e fundos) com a reforma do Imposto de Renda
                </h1>

                <p className="text-xl text-muted-foreground leading-relaxed">
                    A reforma do Imposto de Renda proposta pelo PL 1087/2025 não altera diretamente a forma de tributação da renda fixa tradicional, mas muda o contexto em que esses rendimentos passam a ser analisados, especialmente para contribuintes de alta renda.
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
                            <span>8 min de leitura</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Body */}
            <div className="prose prose-lg dark:prose-invert max-w-none space-y-8 text-foreground/90">
                <p>
                    Em outras palavras: <strong>o imposto do CDB não aumenta, mas o papel do CDB no planejamento tributário muda</strong>.
                </p>
                <p>
                    Neste artigo da <strong>Kitnets.com</strong>, você entende o que permanece igual, o que muda na prática e como a renda fixa passa a interagir com o novo imposto mínimo sobre altas rendas.
                </p>

                <h2 className="text-2xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <BadgePercent className="h-7 w-7 text-primary" />
                    A tributação do CDB muda com a reforma do IR?
                </h2>
                <div className="bg-muted/40 p-6 rounded-xl border-l-4 border-green-500">
                    <p className="font-bold text-lg mb-2">Não.</p>
                    <p className="mb-0">A tributação do CDB e da renda fixa tributada permanece exatamente como é hoje.</p>
                </div>

                <div className="my-8">
                    <h3 className="text-xl font-bold mb-4">Como o CDB continua sendo tributado</h3>
                    <ul className="space-y-3 list-none pl-0">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>Imposto de Renda retido na fonte</strong></div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div>
                                <strong>Tabela regressiva:</strong>
                                <ul className="pl-4 mt-2 space-y-1 text-muted-foreground text-sm">
                                    <li>22,5% até 180 dias</li>
                                    <li>20% de 181 a 360 dias</li>
                                    <li>17,5% de 361 a 720 dias</li>
                                    <li>15% acima de 720 dias</li>
                                </ul>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>IR considerado definitivo na fonte</strong></div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>IOF apenas nos primeiros 30 dias</strong> (regra já existente)</div>
                        </li>
                    </ul>
                </div>

                <p className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <span className="text-lg">👉</span>
                    Não há nova alíquota, não há mudança de tabela e não há nova retenção específica sobre CDB, Tesouro Direto ou fundos DI.
                </p>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <TrendingUp className="h-7 w-7 text-primary" />
                    Então o que muda com o PL 1087/2025?
                </h2>
                <p>
                    A mudança não está na tributação do produto, mas na forma como a Receita passa a olhar a <strong>renda total da pessoa física</strong>.
                </p>
                <p>
                    O projeto cria o chamado <strong>imposto mínimo para altas rendas</strong>, que considera a soma de todos os rendimentos recebidos no ano, inclusive aqueles que:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                    <li>Já foram tributados na fonte</li>
                    <li>São tributados de forma exclusiva</li>
                    <li>Tradicionalmente não entravam em um cálculo global de alíquota efetiva</li>
                </ul>
                <p>E é aqui que a renda fixa tributada passa a ter relevância estratégica.</p>

                <h2 className="text-2xl font-bold mt-12 mb-6">O que é o imposto mínimo e por que ele afeta a renda fixa?</h2>
                <p>
                    A partir de 2026, pessoas físicas com renda anual total acima de <strong>R$ 600 mil</strong> passam a estar sujeitas a um piso de tributação efetiva, nos seguintes termos:
                </p>

                <div className="overflow-hidden rounded-xl border border-border my-6">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-foreground font-medium">
                            <tr>
                                <th className="p-4">Renda Anual Total</th>
                                <th className="p-4">Alíquota Mínima</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="p-4">Até R$ 600 mil/ano</td>
                                <td className="p-4 font-bold text-green-600">0%</td>
                            </tr>
                            <tr>
                                <td className="p-4">R$ 600 mil a R$ 1,2 milhão/ano</td>
                                <td className="p-4 font-bold text-orange-600">Alíquota cresce de 0% a 10%</td>
                            </tr>
                            <tr>
                                <td className="p-4">Acima de R$ 1,2 milhão/ano</td>
                                <td className="p-4 font-bold text-red-600">10%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p>Para calcular esse piso, o governo soma todas as rendas do contribuinte, incluindo:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Salários</li>
                    <li>Dividendos</li>
                    <li>Rendimentos de aplicações financeiras tributadas na fonte, como <Link href={`/${lang}/indices/cdi`} className="text-primary hover:underline">CDB</Link> e <Link href={`/${lang}/indices/selic`} className="text-primary hover:underline">Tesouro</Link></li>
                </ul>
                <p className="font-semibold text-primary">
                    👉 Ou seja: o rendimento do CDB entra no cálculo da renda total anual, mesmo já tendo pago imposto.
                </p>

                <h2 className="text-2xl font-bold mt-12 mb-6">Isso significa pagar imposto duas vezes no CDB?</h2>
                <p className="font-bold">Não automaticamente.</p>
                <p>O funcionamento é o seguinte:</p>
                <ol className="list-decimal pl-5 space-y-2">
                    <li>O CDB continua pagando IR normalmente na fonte (15% a 22,5%).</li>
                    <li>No ajuste anual, calcula-se o imposto mínimo devido com base na renda total.</li>
                    <li>Todo o IR já pago é abatido desse valor:
                        <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                            <li>IR sobre salário</li>
                            <li>IR sobre dividendos</li>
                            <li>IR sobre renda fixa (CDB, Tesouro, fundos)</li>
                        </ul>
                    </li>
                </ol>
                <p className="bg-muted p-4 rounded-lg border-l-4 border-blue-500 my-4 text-sm">
                    <strong>Ponto chave:</strong> Só haverá imposto adicional se, após todas as deduções, a alíquota efetiva global ficar abaixo do piso exigido.
                </p>

                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl my-8">
                    <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Exemplo prático simplificado
                    </h3>
                    <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                        <p><strong>Renda total anual:</strong> R$ 1,3 milhão</p>
                        <p><strong>Alíquota mínima exigida:</strong> 10%</p>
                        <p className="border-b border-slate-200 dark:border-slate-700 pb-2 mb-2"><strong>Imposto mínimo esperado:</strong> R$ 130 mil</p>

                        <p>Se o contribuinte já tiver pago:</p>
                        <ul className="list-disc pl-5 mb-2">
                            <li>R$ 90 mil em IR sobre salários</li>
                            <li>R$ 30 mil em IR sobre CDB e outros investimentos</li>
                        </ul>
                        <p className="font-semibold">Total pago: R$ 120 mil</p>

                        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded mt-3 font-bold text-slate-900 dark:text-white">
                            ➡️ Diferença a pagar no ajuste: R$ 10 mil
                        </div>
                        <p className="text-xs mt-2 text-muted-foreground">Se já tivesse pago R$ 130 mil ou mais (somando todas as fontes), não haveria imposto adicional.</p>
                    </div>
                </div>

                <h2 className="text-2xl font-bold mt-12 mb-6">Renda fixa tributada x renda fixa isenta: o novo contraste</h2>
                <p>
                    A reforma não penaliza diretamente o CDB, mas valoriza ainda mais os ativos isentos, porque eles <strong>não entram no cálculo do imposto mínimo</strong>.
                </p>

                <div className="overflow-x-auto my-6">
                    <table className="w-full text-sm border-collapse border border-border">
                        <thead className="bg-muted">
                            <tr>
                                <th className="p-3 border border-border">Produto</th>
                                <th className="p-3 border border-border">Entra no imposto mínimo?</th>
                                <th className="p-3 border border-border">Observação</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-3 border border-border font-medium">CDB</td>
                                <td className="p-3 border border-border text-red-600 font-bold">✅ Sim</td>
                                <td className="p-3 border border-border text-muted-foreground">Mesmo com IR pago</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">Tesouro Direto</td>
                                <td className="p-3 border border-border text-red-600 font-bold">✅ Sim</td>
                                <td className="p-3 border border-border text-muted-foreground">Mesmo tratamento</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">Fundos DI</td>
                                <td className="p-3 border border-border text-red-600 font-bold">✅ Sim</td>
                                <td className="p-3 border border-border text-muted-foreground">Igual ao CDB</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">LCI / LCA</td>
                                <td className="p-3 border border-border text-green-600 font-bold">❌ Não</td>
                                <td className="p-3 border border-border text-muted-foreground">Explicitamente excluídos</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">CRI / CRA</td>
                                <td className="p-3 border border-border text-green-600 font-bold">❌ Não</td>
                                <td className="p-3 border border-border text-muted-foreground">Excluídos</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">Debêntures inc.</td>
                                <td className="p-3 border border-border text-green-600 font-bold">❌ Não</td>
                                <td className="p-3 border border-border text-muted-foreground">Excluídas</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p>
                    👉 Para contribuintes de alta renda, a reforma incentiva a migração gradual para títulos isentos, quando compatíveis com o perfil de risco.
                </p>

                <h2 className="text-2xl font-bold mt-12 mb-6">Quem realmente sente o impacto dessa mudança?</h2>
                <div className="grid gap-4">
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 text-green-600 flex items-center justify-center flex-shrink-0">❌</div>
                        <div><strong>Pequeno investidor:</strong> não sente impacto algum.</div>
                    </div>
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 text-green-600 flex items-center justify-center flex-shrink-0">❌</div>
                        <div><strong>Quem ganha até R$ 600 mil por ano:</strong> nenhuma mudança prática.</div>
                    </div>
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-600 flex items-center justify-center flex-shrink-0">✅</div>
                        <div><strong>Alta renda com grande volume financeiro:</strong> precisa rever a estratégia de alocação e planejamento tributário.</div>
                    </div>
                </div>
                <p className="mt-4">
                    O objetivo do projeto não é punir a renda fixa tradicional, mas evitar que grandes patrimônios tenham alíquota efetiva muito baixa quando somados todos os rendimentos.
                </p>

                <div className="border-t-2 border-primary/20 pt-10 mt-16">
                    <h2 className="text-3xl font-bold mb-6">Conclusão: o CDB continua válido, mas o contexto mudou</h2>
                    <p>
                        A reforma do Imposto de Renda não altera a tributação do CDB, mas muda o ambiente de decisão para quem acumula renda elevada.
                    </p>
                    <div className="grid md:grid-cols-3 gap-6 my-6">
                        <div className="bg-card p-4 rounded-lg border border-border">
                            <h4 className="font-bold text-primary mb-2">Simples</h4>
                            <p className="text-sm text-muted-foreground">O CDB segue sendo simples, previsível e seguro.</p>
                        </div>
                        <div className="bg-card p-4 rounded-lg border border-border">
                            <h4 className="font-bold text-primary mb-2">Reserva</h4>
                            <p className="text-sm text-muted-foreground">Continua adequado para reserva de emergência e liquidez.</p>
                        </div>
                        <div className="bg-card p-4 rounded-lg border border-border">
                            <h4 className="font-bold text-primary mb-2">Eficiência</h4>
                            <p className="text-sm text-muted-foreground">Perde eficiência relativa frente a ativos isentos para altas rendas.</p>
                        </div>
                    </div>

                    <p className="font-medium text-lg text-primary mt-6">
                        Em resumo: A reforma não muda o produto, muda o planejamento.
                    </p>

                    <div className="mt-8 bg-muted p-6 rounded-xl flex items-start gap-4">
                        <div className="bg-primary/10 p-3 rounded-full hidden md:block">
                            <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <p className="mb-0 text-muted-foreground">
                                Na <strong>Kitnets.com</strong>, você encontra guias, simuladores e análises práticas para entender como decisões de investimento, impostos e renda se conectam no mundo real — sem ruído e sem ideologia, apenas números e regras claras.
                            </p>
                        </div>
                    </div>

                    <div className="my-12 p-8 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/20">
                        <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                            <Coins className="h-6 w-6 text-primary" />
                            Planeje seu futuro com precisão
                        </h3>
                        <p className="mb-6 text-muted-foreground">
                            A reforma tributária muda as regras, mas o planejamento continua sendo a melhor estratégia. Utilize nossas ferramentas gratuitas para simular seus investimentos:
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            <Link
                                href={`/${lang}/calculadora-juros-compostos`}
                                className="flex flex-col p-4 bg-background hover:bg-muted/50 border border-border rounded-xl transition-all hover:shadow-sm group"
                            >
                                <span className="font-bold text-primary group-hover:underline mb-1">Calculadora de Juros Compostos →</span>
                                <span className="text-sm text-muted-foreground">Simule o crescimento do seu patrimônio com a força dos juros sobre juros.</span>
                            </Link>
                            <Link
                                href={`/${lang}/calculadora-independencia-financeira`}
                                className="flex flex-col p-4 bg-background hover:bg-muted/50 border border-border rounded-xl transition-all hover:shadow-sm group"
                            >
                                <span className="font-bold text-primary group-hover:underline mb-1">Independência Financeira →</span>
                                <span className="text-sm text-muted-foreground">Descubra quanto tempo falta para você viver de renda.</span>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-8 text-sm text-muted-foreground bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 font-medium">
                        <FileText className="h-4 w-4" />
                        Fonte Oficial
                    </div>
                    <a
                        href="https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=2868788&filename=PL%201087/2025"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                    >
                        Projeto de Lei nº 1087/2025 – Congresso Nacional
                    </a>
                </div>
            </div>
        </article>
    );
}
