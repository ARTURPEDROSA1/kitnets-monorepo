import { getDictionary } from "@/dictionaries";
import RentLateFineCalculatorClient from "./RentLateFineCalculatorClient";
import { Metadata } from "next";

type Props = {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.rentLateFineCalculatorPage;

    // SEO & Open Graph
    return {
        title: t.seo.title,
        description: t.seo.description,
        alternates: {
            canonical: `https://kitnets.com/${lang}/calculadoras/multa-atraso-aluguel`,
            languages: {
                'pt': 'https://kitnets.com/pt/calculadoras/multa-atraso-aluguel',
                'en': 'https://kitnets.com/en/calculators/rent-late-fine',
                'es': 'https://kitnets.com/es/calculadoras/multa-alquiler',
            },
        },
        openGraph: {
            title: t.seo.title,
            description: t.seo.description,
            url: `https://kitnets.com/${lang}/calculadoras/multa-atraso-aluguel`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
            images: [
                {
                    url: 'https://kitnets.com/og-calculator-rent-fine.jpg', // Placeholder or specific image
                    width: 1200,
                    height: 630,
                    alt: t.seo.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: t.seo.title,
            description: t.seo.description,
        },
        robots: {
            index: true,
            follow: true,
        },
    };
}

export default async function RentLateFineCalculatorPage({ params }: Props) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.rentLateFineCalculatorPage;

    // JSON-LD Structured Data for Calculator
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": t.title,
        "description": t.description,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "url": `https://kitnets.com/${lang}/calculadoras/multa-atraso-aluguel`,
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": [
            "Cálculo de multa de aluguel",
            "Correção monetária IGP-M/IPCA",
            "Juros de mora pro-rata"
        ],
        "author": {
            "@type": "Organization",
            "name": "Kitnets.com",
            "url": "https://kitnets.com"
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <RentLateFineCalculatorClient />
        </>
    );
}
