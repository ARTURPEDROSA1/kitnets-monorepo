import { getDictionary } from '@/dictionaries';
import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: `${dict.menu.salariesAndIncome} | Kitnets.com`,
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos/salario-e-renda`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos/salario-e-renda',
                'en': 'https://kitnets.com/en/conteudos/salario-e-renda',
                'es': 'https://kitnets.com/es/conteudos/salario-e-renda',
            },
        },
    };
}

export default async function SalariesAndIncomePage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return (
        <div className="container py-8 space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{dict.menu.salariesAndIncome}</h1>
                <p className="text-muted-foreground">
                    {lang === 'pt' ? 'Notícias e análises sobre salário mínimo, renda e economia brasileira.' :
                        lang === 'es' ? 'Noticias y análisis sobre el salario mínimo, ingresos y la economía brasileña.' :
                            'News and analysis on minimum wage, income, and the Brazilian economy.'}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link
                    href={`/${lang}/conteudos/salario-e-renda/salario-minimo-2026`}
                    className="group bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col h-full"
                >
                    <div className="h-48 bg-muted w-full relative group-hover:opacity-90 transition-opacity">
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500/5 to-blue-500/10">
                            <span className="text-4xl font-bold text-blue-500/20">R$ 1.621</span>
                        </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                        <div className="mb-2 text-xs font-medium text-primary uppercase tracking-wider">
                            {lang === 'pt' ? 'Salário Mínimo' : 'Minimum Wage'}
                        </div>
                        <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                            Salário mínimo 2026 no Brasil: valor, reajuste e impactos
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
                            O salário mínimo de 2026 foi fixado em R$ 1.621. Entenda como foi calculado o reajuste e o impacto na economia.
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
