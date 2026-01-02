import { getDictionary } from '@/dictionaries';
import { FileText } from 'lucide-react';
import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: `${dict.menu.contents} | Kitnets.com`,
        alternates: {
            canonical: `https://kitnets.com/${lang}/conteudos`,
            languages: {
                'pt': 'https://kitnets.com/pt/conteudos',
                'en': 'https://kitnets.com/en/conteudos',
                'es': 'https://kitnets.com/es/conteudos',
            },
        },
    };
}

export default async function ContentsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);

    return (
        <div className="container py-8 space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{dict.menu.contents}</h1>
                <p className="text-muted-foreground">
                    {lang === 'pt' ? 'Explore nossos artigos, guias e notícias sobre o mercado imobiliario.' :
                        lang === 'es' ? 'Explore nuestros artículos, guías y noticias sobre el mercado inmobiliario.' :
                            'Explore our articles, guides, and news about the real estate market.'}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link
                    href={`/${lang}/conteudos/impostos-e-legislacao`}
                    className="block group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/50"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <FileText className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-semibold group-hover:text-primary transition-colors">
                            {dict.menu.taxesAndLegislation}
                        </h2>
                    </div>
                    <p className="text-muted-foreground">
                        {lang === 'pt' ? 'Tudo sobre impostos, leis e regulamentações para kitnets e imóveis compactos.' :
                            lang === 'es' ? 'Todo sobre impuestos, leyes y regulaciones para kitnets y propiedades compactas.' :
                                'Everything about taxes, laws, and regulations for kitnets and compact properties.'}
                    </p>
                </Link>
            </div>
        </div>
    );
}
