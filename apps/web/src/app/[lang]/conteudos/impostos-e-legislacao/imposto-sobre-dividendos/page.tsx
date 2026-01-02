import { getDictionary } from '@/dictionaries';
import { Calendar, Clock, Wallet, TrendingUp, Scale, Building2, AlertTriangle, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);
    return {
        title: `Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças do PL 1087/2025 | Kitnets.com`,
        description: "Entenda o PL 1087/2025: novas regras para dividendos, isenção de IR até R$ 5 mil e imposto mínimo para altas rendas.",
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos/impostos-e-legislacao/imposto-sobre-dividendos`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos/impostos-e-legislacao/imposto-sobre-dividendos',
                'en': 'https://kitnets.com/en/conteudos/impostos-e-legislacao/imposto-sobre-dividendos',
                'es': 'https://kitnets.com/es/conteudos/impostos-e-legislacao/imposto-sobre-dividendos',
            },
        },
    };
}

export default async function DividendTaxArticle({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças no Imposto de Renda',
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
                url: 'https://kitnets.com/kitnets-logo.png', // Replace with actual logo URL if available
            },
        },
        description: 'O PL 1087/2025 redesenha a tributação da renda, amplia isenções e cria novas regras para dividendos. Descubra quem ganha e quem paga a conta.',
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
                    Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças no Imposto de Renda
                </h1>

                <p className="text-xl text-muted-foreground leading-relaxed">
                    O PL 1087/2025 redesenha a tributação da renda, amplia isenções e cria novas regras para dividendos. Descubra quem ganha e quem paga a conta.
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
                            <span>10 min de leitura</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Body */}
            <div className="prose prose-lg dark:prose-invert max-w-none space-y-8 text-foreground/90">
                <p>
                    O Imposto de Renda no Brasil passa por uma das mudanças mais relevantes das últimas décadas. Com o avanço do <strong>PL 1087/2025</strong>, o país redesenha a tributação da renda ao mesmo tempo em que amplia a isenção do IR para milhões de brasileiros.
                </p>
                <p>
                    A proposta combina alívio fiscal para quem ganha menos com novas regras de tributação para dividendos e altas rendas, alterando a lógica histórica do sistema tributário brasileiro. A discussão deixa de ser apenas “quanto cada um paga” e passa a responder uma pergunta central: quem financia a ampliação da isenção do Imposto de Renda e quais são os efeitos econômicos dessa escolha?
                </p>
                <p>
                    Neste guia completo da <strong>Kitnets.com</strong>, você entende o que muda na prática, quem ganha, quem paga mais, como funcionará o imposto sobre dividendos, os impactos no Simples Nacional, a janela de transição até 2028 e o funcionamento do novo imposto mínimo para altas rendas.
                </p>

                <div className="bg-muted/40 p-8 rounded-2xl border border-border my-12">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-primary">
                        <TrendingUp className="h-6 w-6" />
                        O que muda no Imposto de Renda com o PL 1087/2025
                    </h2>
                    <p className="mb-6">
                        O projeto aprovado na Câmara e em análise no Senado redefine três pilares centrais da tributação da renda no Brasil, com vigência a partir de 2026:
                    </p>
                    <ul className="space-y-4 list-none pl-0">
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">1</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Isenção total do IR para quem ganha até R$ 5.000 por mês</strong>
                                Contribuintes nessa faixa passam a não pagar Imposto de Renda, aumentando diretamente a renda disponível das famílias e estimulando o consumo.
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">2</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Desconto parcial para rendas até R$ 7.350</strong>
                                Quem recebe entre R$ 5.000,01 e R$ 7.350 terá um benefício decrescente. Acima desse patamar, volta a valer a tabela progressiva tradicional, sem aumento das alíquotas máximas.
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">3</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Compensação via altas rendas e dividendos</strong>
                                <span className="block mb-2">Para financiar a renúncia fiscal, o projeto institui:</span>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                    <li>Imposto mínimo anual para altas rendas, com alíquota de 0% a 10%;</li>
                                    <li>Retenção de 10% sobre dividendos que excederem R$ 50 mil por mês, por empresa pagadora;</li>
                                    <li>Tributação de 10% sobre lucros e dividendos remetidos ao exterior, com exceções específicas.</li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                    <p className="mt-6 text-sm text-muted-foreground italic border-t border-border/50 pt-4">
                        A lógica fiscal é clara: aliviar a base da pirâmide de renda sem gerar desequilíbrio fiscal, preservando a arrecadação de estados e municípios.
                    </p>
                </div>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <Wallet className="h-7 w-7 text-primary" />
                    Quem paga a conta da nova isenção do IR?
                </h2>
                <p>
                    A ampliação da isenção do IRPF gera renúncia de arrecadação. O PL 1087/2025 estrutura a compensação em três frentes principais:
                </p>
                <div className="grid md:grid-cols-3 gap-6 my-8">
                    {[
                        "Imposto mínimo sobre rendas totais acima de R$ 600 mil por ano, com progressividade até 10%.",
                        "Retenção de 10% sobre dividendos elevados, como antecipação do imposto devido.",
                        "Tributação de dividendos remetidos ao exterior, preservando exceções legais."
                    ].map((item, idx) => (
                        <div key={idx} className="bg-card border border-border p-6 rounded-xl shadow-sm text-sm font-medium">
                            {item}
                        </div>
                    ))}
                </div>
                <p>
                    A engenharia do projeto prioriza <strong>compensar perdas de estados e municípios (FPE e FPM)</strong> para, apenas depois, avaliar eventuais reduções na CBS (tributo sobre consumo). Na prática, o sistema passa a considerar menos cada fonte isolada de renda e mais a alíquota efetiva global do contribuinte ao final do ano.
                </p>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Scale className="h-7 w-7 text-primary" />
                    Imposto sobre dividendos no Brasil: como funciona a retenção de 10%
                </h2>
                <p>
                    O ponto mais debatido do PL 1087/2025 é a criação da retenção de 10% sobre dividendos pagos a pessoas físicas residentes no Brasil.
                </p>

                <h3 className="text-xl font-bold mt-8 mb-4">Como funciona na prática</h3>
                <p>A retenção incide somente sobre o valor que exceder <strong>R$ 50 mil no mês</strong>, por empresa pagadora.</p>

                <div className="grid md:grid-cols-2 gap-6 my-6">
                    <div className="bg-green-50 dark:bg-green-950/20 p-6 rounded-xl border border-green-100 dark:border-green-900">
                        <h4 className="font-bold text-green-800 dark:text-green-400 mb-2">Exemplo 1:</h4>
                        <p className="text-green-900 dark:text-green-100 font-medium">Dividendos de R$ 80 mil de uma empresa.</p>
                        <p className="text-sm mt-2 text-green-800 dark:text-green-300">Retenção de 10% sobre R$ 30 mil (excedente).</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-xl border border-blue-100 dark:border-blue-900">
                        <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-2">Exemplo 2:</h4>
                        <p className="text-blue-900 dark:text-blue-100 font-medium">Dividendos de R$ 40 mil de duas empresas diferentes.</p>
                        <p className="text-sm mt-2 text-blue-800 dark:text-blue-300">Sem retenção mensal (cada fonte está abaixo do teto).</p>
                    </div>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Importante: a retenção não é definitiva. Ela é compensável no ajuste anual, funcionando como antecipação do imposto mínimo, quando aplicável.
                </p>

                <h3 className="text-xl font-bold mt-10 mb-4 text-orange-600 dark:text-orange-400">Janela de transição 2025–2028: oportunidade com governança</h3>
                <p>
                    O projeto cria uma regra de transição relevante: <strong>Lucros apurados até 2025, com distribuição aprovada até 31/12/2025, não sofrem a retenção de 10%</strong>, mesmo que sejam pagos entre 2026 e 2028.
                </p>
                <p>Para empresas com reservas acumuladas, isso traz previsibilidade — desde que haja governança e documentação robusta (demonstrações financeiras, atas societárias e fluxo de caixa real). Sem substância econômica, antecipações artificiais podem gerar risco fiscal relevante.</p>

                <h2 className="text-3xl font-bold mt-16 mb-6">Imposto mínimo para altas rendas: como funciona</h2>
                <p>O imposto mínimo não cria uma nova tabela progressiva tradicional. Ele estabelece um piso de tributação efetiva sobre a renda total anual:</p>

                <div className="overflow-hidden rounded-xl border border-border my-6">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-foreground font-medium">
                            <tr>
                                <th className="p-4">Renda anual total</th>
                                <th className="p-4">Alíquota mínima</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="p-4">Até R$ 600 mil</td>
                                <td className="p-4 font-bold text-green-600">0%</td>
                            </tr>
                            <tr>
                                <td className="p-4">R$ 600 mil a R$ 1,2 milhão</td>
                                <td className="p-4 font-bold text-orange-600">0% → 10% (progressão linear)</td>
                            </tr>
                            <tr>
                                <td className="p-4">Acima de R$ 1,2 milhão</td>
                                <td className="p-4 font-bold text-red-600">10%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="grid md:grid-cols-2 gap-8 my-8">
                    <div>
                        <h4 className="font-semibold text-lg mb-3 text-green-600">✅ O que entra na base de cálculo</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Salários</li>
                            <li>Dividendos</li>
                            <li>Rendimentos hoje isentos</li>
                            <li>Rendimentos tributados exclusivamente na fonte</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-lg mb-3 text-red-600">❌ O que fica fora</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Poupança</li>
                            <li>Indenizações</li>
                            <li>Heranças e doações</li>
                            <li>Rendimentos isentos por doença grave</li>
                            <li>LCI, LCA, CRI, CRA, debêntures incentivadas</li>
                            <li>FIIs e Fiagros (sob requisitos legais)</li>
                        </ul>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 border-l-4 border-blue-500 p-6 my-8 rounded-r-xl">
                    <h3 className="font-bold text-lg mb-2 text-blue-700 dark:text-blue-400">O redutor: evitando bitributação</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                        Para evitar que a soma da tributação na empresa (IRPJ + CSLL) com a tributação na pessoa física ultrapasse limites razoáveis, o projeto institui um redutor automático. Limites máximos combinados:
                    </p>
                    <ul className="mt-3 grid grid-cols-2 gap-4 text-sm font-medium">
                        <li className="bg-background p-2 rounded shadow-sm border border-border text-center">34% para empresas em geral</li>
                        <li className="bg-background p-2 rounded shadow-sm border border-border text-center">40% a 45% inst. financeiras</li>
                    </ul>
                </div>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Building2 className="h-7 w-7 text-primary" />
                    Simples Nacional e a distribuição de lucros
                </h2>
                <p>No Simples Nacional, a lógica estrutural permanece: lucros devidamente apurados continuam isentos no IRPF. Sem contabilidade, aplicam-se os tetos legais de presunção.</p>
                <p className="border-l-4 border-orange-500 pl-4 py-3 my-4 bg-orange-50 dark:bg-orange-950/20 text-orange-950 dark:text-orange-100 rounded-r-lg">
                    <strong>O que muda:</strong> Se a distribuição ao sócio exceder R$ 50 mil por mês por empresa, haverá retenção de 10% sobre o excedente, compensável no ajuste anual.
                </p>
                <p>Na prática, a contabilidade deixa de ser opcional para quem distribui valores elevados e passa a ser instrumento estratégico de proteção fiscal.</p>

                <h2 className="text-3xl font-bold mt-16 mb-6">Perguntas Frequentes (FAQ)</h2>
                <div className="space-y-4">
                    {[
                        { q: "Dividendos passam a ser tributados no Brasil?", a: "Sim. Haverá retenção de 10% sobre o excedente mensal acima de R$ 50 mil por empresa e possível incidência do imposto mínimo anual." },
                        { q: "Quem ganha apenas salário é afetado negativamente?", a: "Não. Até R$ 5 mil há isenção total; até R$ 7.350 há desconto parcial." },
                        { q: "O imposto mínimo cria bitributação?", a: "O projeto prevê redutores justamente para impedir que a carga combinada ultrapasse os limites legais." },
                        { q: "Estados e municípios perdem arrecadação?", a: "Não. A compensação aos entes subnacionais é prioridade na arquitetura fiscal do projeto." }
                    ].map((item, i) => (
                        <div key={i} className="border border-border rounded-lg p-4">
                            <h4 className="font-bold text-lg mb-2">{item.q}</h4>
                            <p className="text-muted-foreground">{item.a}</p>
                        </div>
                    ))}
                </div>

                <div className="border-t-2 border-primary/20 pt-10 mt-16">
                    <h2 className="text-3xl font-bold mb-6">Conclusão: o que muda na prática</h2>
                    <p>
                        O PL 1087/2025 representa uma virada estrutural na tributação da renda no Brasil. Ele reduz o peso do imposto para a base da população, amplia a incidência sobre rendas elevadas e introduz, pela primeira vez em décadas, um modelo sistemático de tributação de dividendos.
                    </p>
                    <p className="font-medium text-lg text-primary">
                        Para trabalhadores, o impacto é imediato: mais renda líquida no bolso. <br className="hidden md:block" />
                        Para empresários e investidores, o novo cenário exige planejamento tributário com governança.
                    </p>
                    <p>
                        Na <strong>Kitnets.com</strong>, você encontra análises atualizadas, simuladores e conteúdos práticos para entender como essas mudanças afetam sua renda, seus investimentos e seu patrimônio ao longo do tempo.
                    </p>
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
