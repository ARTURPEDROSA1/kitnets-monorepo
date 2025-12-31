import { getDictionary } from '@/dictionaries';
import { CalculatorsOverview } from '@/components/calculators/CalculatorsOverview';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.calculatorsOverview;

    return {
        title: t.title,
        description: t.subtitle,
        alternates: {
            canonical: `https://kitnets.com/${lang}/calculadoras`,
            languages: {
                'pt': 'https://kitnets.com/pt/calculadoras',
                'en': 'https://kitnets.com/en/calculators',
                'es': 'https://kitnets.com/es/calculadoras',
            },
        },
        openGraph: {
            title: t.title,
            description: t.subtitle,
            url: `https://kitnets.com/${lang}/calculadoras`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
            images: [
                {
                    url: 'https://kitnets.com/og-calculators.jpg',
                    width: 1200,
                    height: 630,
                    alt: t.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: t.title,
            description: t.subtitle,
        },
    };
}

export default async function CalculatorOverviewPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": dict.calculatorsOverview.title,
        "description": dict.calculatorsOverview.subtitle,
        "url": `https://kitnets.com/${lang}/calculadoras`,
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "item": {
                        "@type": "SoftwareApplication",
                        "name": dict.rentAdjustmentCalculatorPage.seo.title,
                        "url": `https://kitnets.com/${lang}/calculadoras/reajuste-aluguel`
                    }
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "item": {
                        "@type": "SoftwareApplication",
                        "name": dict.rentLateFineCalculatorPage.seo.title,
                        "url": `https://kitnets.com/${lang}/calculadoras/multa-atraso-aluguel`
                    }
                },
                // Add other known calculators here if available in dictionary
            ]
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <CalculatorsOverview lang={lang} dict={dict} />
        </>
    );
}
