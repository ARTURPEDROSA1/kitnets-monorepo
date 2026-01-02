import { getDictionary } from '@/dictionaries';
import { Calendar, MapPin, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return {
        title: `Artur Pedrosa - Fundador da Kitnets.com | Kitnets.com`,
        description: "Perfil de Artur Pedrosa, fundador da Kitnets.com e especialista em mercado imobiliário e finanças pessoais.",
        alternates: {
            canonical: `https://kitnets.com/${lang}/autor/artur-pedrosa`,
            languages: {
                'pt': 'https://kitnets.com/pt/autor/artur-pedrosa',
                'en': 'https://kitnets.com/en/autor/artur-pedrosa',
                'es': 'https://kitnets.com/es/autor/artur-pedrosa',
            },
        },
    };
}

export default async function AuthorPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    await getDictionary(lang);

    return (
        <div className="container py-12 max-w-4xl">
            {/* Profile Header */}
            <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
                <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-muted flex items-center justify-center text-4xl font-bold text-muted-foreground border-4 border-background shadow-lg overflow-hidden shrink-0 relative">
                    <Image
                        src="/images/authors/artur-pedrosa.jpg"
                        alt="Artur Pedrosa"
                        fill
                        className="object-cover"
                    />
                </div>
                <div className="flex-1 space-y-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Artur Pedrosa</h1>
                        <p className="text-xl text-muted-foreground font-medium text-primary">
                            Fundador da Kitnets.com
                        </p>
                    </div>

                    <p className="text-lg leading-relaxed text-foreground/80">
                        Especialista em mercado imobiliário e finanças pessoais, com foco em otimização de rentabilidade para imóveis compactos. Criou a Kitnets.com para trazer dados, transparência e tecnologia para um dos segmentos que mais crescem no Brasil.
                    </p>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                        <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            <span>Belo Horizonte, Brasil</span>
                        </div>
                        <a href="https://kitnets.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                            <Image
                                src="/icon.png"
                                alt="Kitnets Logo"
                                width={16}
                                height={16}
                                className="object-contain"
                            />
                            <span>kitnets.com</span>
                        </a>
                        {/* 
                        <a href="#" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                            <Linkedin className="h-4 w-4" />
                            <span>LinkedIn</span>
                        </a>
                        */}
                    </div>
                </div>
            </div>

            <div className="border-t border-border pt-12">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    {lang === 'pt' ? 'Artigos recentes' : lang === 'es' ? 'Artículos recientes' : 'Recent Articles'}
                </h2>

                <div className="grid gap-6">
                    {/* Manual list of articles for now */}
                    {/* Recent Articles List */}
                    <Link
                        href={`/${lang}/conteudos/impostos-e-legislacao/imposto-sobre-dividendos`}
                        className="group block p-6 rounded-xl border border-border bg-card hover:shadow-md transition-all hover:border-primary/50"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Impostos e Legislação</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> 01 Jan 2026
                            </span>
                        </div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                            Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças no Imposto de Renda
                        </h3>
                        <p className="text-muted-foreground line-clamp-2">
                            O PL 1087/2025 redesenha a tributação da renda. Entenda as novas regras para dividendos, isenção até R$ 5 mil e imposto mínimo para altas rendas.
                        </p>
                    </Link>

                    <Link
                        href={`/${lang}/conteudos/impostos-e-legislacao/renda-fixa-reforma-imposto-de-renda`}
                        className="group block p-6 rounded-xl border border-border bg-card hover:shadow-md transition-all hover:border-primary/50"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Impostos e Legislação</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> 01 Jan 2026
                            </span>
                        </div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                            Como fica a renda fixa (CDB, Tesouro Direto e fundos) com a reforma do Imposto de Renda
                        </h3>
                        <p className="text-muted-foreground line-clamp-2">
                            A reforma do Imposto de Renda não altera a tributação do CDB, mas muda o contexto para contribuintes de alta renda. Entenda o impacto do imposto mínimo.
                        </p>
                    </Link>

                    <Link
                        href={`/${lang}/conteudos/salario-e-renda/salario-minimo-2026`}
                        className="group block p-6 rounded-xl border border-border bg-card hover:shadow-md transition-all hover:border-primary/50"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Salário e Renda</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> 01 Jan 2026
                            </span>
                        </div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                            Salário mínimo 2026 no Brasil: valor, reajuste e impactos na economia
                        </h3>
                        <p className="text-muted-foreground line-clamp-2">
                            O salário mínimo de 2026 foi fixado em R$ 1.621. Confira o reajuste de 6,79%, o ganho real e os impactos na economia e benefícios sociais.
                        </p>
                    </Link>
                </div>
            </div>
        </div>
    );
}
