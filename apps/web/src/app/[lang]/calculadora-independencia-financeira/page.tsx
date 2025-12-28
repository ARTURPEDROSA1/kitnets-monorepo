import { FinancialIndependenceCalculator } from "@/components/calculators/FinancialIndependenceCalculator";
import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

            {/* CTA Standard */}
            <div className="mt-16 text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                    <h3 className="text-3xl md:text-3xl font-bold tracking-tight whitespace-pre-line text-foreground">
                        {(dict as any).calculatorCtaStandard?.title}
                    </h3>
                    <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                        {(dict as any).calculatorCtaStandard?.description}
                    </p>
                    <div className="pt-4 flex flex-col items-center gap-3">
                        <Link href={`/${lang}/lista-vip?step=landing`}>
                            <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                {(dict as any).calculatorCtaStandard?.button}
                            </Button>
                        </Link>
                        <p className="text-xs md:text-sm text-muted-foreground font-medium opacity-80">
                            {(dict as any).calculatorCtaStandard?.microcopy}
                        </p>
                    </div>
                </div>
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
