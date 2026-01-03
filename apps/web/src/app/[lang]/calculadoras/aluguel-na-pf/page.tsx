import { Metadata } from 'next';
import { getDictionary } from '@/dictionaries';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.rentOnIndividualCalculatorPage.seo;

    return {
        title: t.title,
        description: t.description,
        alternates: {
            canonical: `https://kitnets.com/${lang}/calculadoras/aluguel-na-pf`,
            languages: {
                'pt': 'https://kitnets.com/pt/calculadoras/aluguel-na-pf',
                'en': 'https://kitnets.com/en/calculadoras/aluguel-na-pf',
                'es': 'https://kitnets.com/es/calculadoras/aluguel-na-pf',
            },
        },
    };
}

export default async function RentOnIndividualCalculatorPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
            <h1 className="text-3xl font-bold">{dict.rentOnIndividualCalculatorPage.title}</h1>
            <p className="text-muted-foreground">{dict.rentOnIndividualCalculatorPage.description}</p>
            <div className="bg-muted p-8 rounded-xl text-center border dashed border-2 border-muted-foreground/20">
                Calculator Component Placeholder
            </div>
        </div>
    );
}
