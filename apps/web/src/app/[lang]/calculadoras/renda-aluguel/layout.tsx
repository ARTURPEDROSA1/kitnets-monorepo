import { Metadata } from "next";
import { getDictionary } from "../../../../dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

    return {
        title: dict.rentalIncomeCalculatorPage.title,
        description: dict.rentalIncomeCalculatorPage.description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/renda-aluguel`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/renda-aluguel`,
                'en': `${baseUrl}/en/calculadoras/renda-aluguel`,
                'es': `${baseUrl}/es/calculadoras/renda-aluguel`,
            },
        },
    };
}

export default async function Layout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": dict.rentalIncomeCalculatorPage.title,
        "description": dict.rentalIncomeCalculatorPage.description,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {children}
        </>
    );
}
