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
            canonical: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadoras`,
            languages: {
                'pt': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/pt/calculadoras`,
                'en': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/en/calculadoras`,
                'es': `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/es/calculadoras`,
            },
        },
        openGraph: {
            title: t.title,
            description: t.subtitle,
            url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadoras`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
            images: [
                {
                    url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/og-calculators.jpg`,
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
        "url": `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadoras`,
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "item": {
                        "@type": "SoftwareApplication",
                        "name": dict.rentAdjustmentCalculatorPage.seo.title,
                        "url": `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadora-reajuste-aluguel`
                    }
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "item": {
                        "@type": "SoftwareApplication",
                        "name": dict.rentLateFineCalculatorPage.seo.title,
                        "url": `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadoras/multa-atraso-aluguel`
                    }
                },
                {
                    "@type": "ListItem",
                    "position": 3,
                    "item": {
                        "@type": "SoftwareApplication",
                        "name": dict.rentOnIndividualCalculatorPage.seo.title,
                        "url": `${process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com'}/${lang}/calculadoras/aluguel-na-pf`
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
