import { getDictionary } from '@/dictionaries';
import { Calendar, MapPin, Globe, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return {
        title: `Artur Pedrosa - Fundador da Kitnets.com | Kitnets.com`,
        description: "Perfil de Artur Pedrosa, fundador da Kitnets.com e especialista em mercado imobiliário e finanças pessoais.",
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
                            <Globe className="h-4 w-4" />
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
                </div>
            </div>
        </div>
    );
}
