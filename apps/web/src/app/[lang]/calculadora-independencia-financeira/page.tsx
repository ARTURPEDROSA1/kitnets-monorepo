import { FinancialIndependenceCalculator } from "@/components/calculators/FinancialIndependenceCalculator";
import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const t = dict.financialIndependenceCalculator;

    return {
        title: t?.title || "Calculadora de Independência Financeira",
        description: t?.subtitle || "Simule sua liberdade financeira com inflação e impostos reais.",
        keywords: [
            "independência financeira", "financial independence", "FIRE movement", "calculadora FIRE",
            "financial calculator", "inflação real", "ganho real", "rentabilidade real",
            "investimentos", "aposentadoria", "early retirement", "kitnets", "renda passiva"
        ],
        openGraph: {
            title: t?.title || "Calculadora de Independência Financeira",
            description: t?.subtitle || "Simule sua liberdade financeira com inflação e impostos reais.",
            url: `${baseUrl}/${lang}/calculadora-independencia-financeira`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
            images: [
                {
                    url: `${baseUrl}/images/calculadora-fire-og.jpg`, // Assuming a generic og image or placeholder
                    width: 1200,
                    height: 630,
                    alt: t?.title,
                }
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: t?.title || "Calculadora de Independência Financeira",
            description: t?.subtitle || "Simule sua liberdade financeira com inflação e impostos reais.",
            images: [`${baseUrl}/images/calculadora-fire-og.jpg`],
        },
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadora-independencia-financeira`,
            languages: {
                'pt': `${baseUrl}/pt/calculadora-independencia-financeira`,
                'en': `${baseUrl}/en/calculadora-independencia-financeira`,
                'es': `${baseUrl}/es/calculadora-independencia-financeira`,
            },
        },
    }
}

export default async function FinancialIndependenceCalculatorPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.financialIndependenceCalculator;

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl">
            <header className="mb-10 text-center max-w-4xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
                    {t?.title || "Calculadora de Independência Financeira"}
                </h1>
                <h2 className="text-xl md:text-2xl text-muted-foreground font-medium mb-8">
                    {t?.subtitle || "Simule sua liberdade financeira com inflação e impostos reais."}
                </h2>
            </header>

            <div className="mb-16">
                <FinancialIndependenceCalculator dict={dict} lang={lang} />
            </div>

            <div className="mt-16 max-w-4xl mx-auto">
                <CalculatorSuggestion />
            </div>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": t?.title || "Calculadora de Independência Financeira",
                        "applicationCategory": "FinanceApplication",
                        "operatingSystem": "Any",
                        "offers": {
                            "@type": "Offer",
                            "price": "0",
                            "priceCurrency": "BRL"
                        },
                        "description": t?.subtitle || "Simule sua liberdade financeira com inflação e impostos reais.",
                        "featureList": [
                            "Simulação com Inflação Real (IPCA)",
                            "Cálculo de Imposto de Renda sobre Ganho de Capital",
                            "Cenário de Renda Perpétua vs Renda Finita",
                            "Comparação Nominal vs Real"
                        ]
                    })
                }}
            />
        </div>
    );
}
