import { getDictionary } from '@/dictionaries';

import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: `${dict.menu.taxesAndLegislation} | Kitnets.com`,
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos/impostos-e-legislacao`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos/impostos-e-legislacao',
                'en': 'https://kitnets.com/en/conteudos/impostos-e-legislacao',
                'es': 'https://kitnets.com/es/conteudos/impostos-e-legislacao',
            },
        },
    };
}

export default async function TaxesAndLegislationPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return (
        <div className="container py-8 space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{dict.menu.taxesAndLegislation}</h1>
                <p className="text-muted-foreground">
                    {lang === 'pt' ? 'Artigos e guias sobre tributação e legislação imobiliária.' :
                        lang === 'es' ? 'Artículos y guías sobre tributación y legislación inmobiliaria.' :
                            'Articles and guides on real estate taxation and legislation.'}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link
                    href={`/${lang}/conteudos/impostos-e-legislacao/imposto-sobre-dividendos`}
                    className="group bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col h-full"
                >
                    <div className="h-48 bg-muted w-full relative group-hover:opacity-90 transition-opacity">
                        {/* Placeholder for future thumbnail */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                            <span className="text-4xl font-bold text-primary/20">PL 1087</span>
                        </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                        <div className="mb-2 text-xs font-medium text-primary uppercase tracking-wider">
                            {lang === 'pt' ? 'Imposto de Renda' : 'Income Tax'}
                        </div>
                        <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                            Imposto sobre dividendos e renda no Brasil: entenda as mudanças
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
                            O PL 1087/2025 redesenha a tributação da renda. Entenda as novas regras para dividendos, isenção até R$ 5 mil e imposto mínimo.
                        </p>
                        <div className="text-sm font-medium text-primary flex items-center gap-1 group-hover:gap-2 transition-all mt-auto">
                            {lang === 'pt' ? 'Ler artigo' : 'Read article'} -&gt;
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
