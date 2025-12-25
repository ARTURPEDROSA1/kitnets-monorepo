
import { MortgageCalculator } from "@/components/calculators/MortgageCalculator";
import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

    return {
        title: dict.mortgageCalculatorPage.meta.title,
        description: dict.mortgageCalculatorPage.meta.description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadora-amortizacao-financiamento-imobiliario`,
            languages: {
                'pt': `${baseUrl}/pt/calculadora-amortizacao-financiamento-imobiliario`,
                'en': `${baseUrl}/en/calculadora-amortizacao-financiamento-imobiliario`,
                'es': `${baseUrl}/es/calculadora-amortizacao-financiamento-imobiliario`,
            },
        },
    }
}

export default async function MortgageCalculatorPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.mortgageCalculatorPage;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": t.meta.title,
        "description": t.meta.description,
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

            <div className="container mx-auto py-8 px-4 max-w-7xl">
                {/* H1 & Intro */}
                <header className="mb-10 text-center max-w-4xl mx-auto">
                    <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
                        {t.title}
                    </h1>
                    <h2 className="text-xl md:text-2xl text-muted-foreground font-medium mb-8">
                        {t.subtitle}
                    </h2>

                    <div className="text-left text-lg text-muted-foreground space-y-4 bg-muted/30 p-6 rounded-2xl">
                        <p>{t.intro.text1}</p>
                        <p>{t.intro.text2}</p>
                        <p className="font-semibold text-foreground">{t.intro.text3}</p>

                        <div className="mt-4">
                            <p className="font-medium mb-2">{t.intro.listTitle}</p>
                            <ul className="list-disc pl-5 space-y-1">
                                {t.intro.listItems.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </header>

                {/* Calculator Component */}
                <div className="mb-16">
                    <MortgageCalculator />
                </div>

                {/* CTA 1 - Simulation */}
                <div className="text-center bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl p-8 mb-16 max-w-4xl mx-auto">
                    <h3 className="text-2xl font-bold text-orange-700 dark:text-orange-400 mb-2">{t.ctaSection.title}</h3>
                    <p className="text-muted-foreground">{t.ctaSection.text1}</p>
                    <p className="font-semibold mt-2 text-foreground">{t.ctaSection.text2}</p>
                </div>


                {/* Content Sections */}
                <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                    <section>
                        <h3 className="text-2xl font-bold mb-4 text-foreground">{t.whatToSimulate.title}</h3>
                        <div className="space-y-4 text-muted-foreground">
                            <div>
                                <h4 className="font-semibold text-foreground">{t.whatToSimulate.list1Title}</h4>
                            </div>
                            <div>
                                <h4 className="font-semibold text-foreground">{t.whatToSimulate.list2Title}</h4>
                                <ul className="list-disc pl-5 mt-1">
                                    {t.whatToSimulate.list2Items.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold text-foreground">{t.whatToSimulate.list3Title}</h4>
                                <ul className="list-disc pl-5 mt-1">
                                    {t.whatToSimulate.list3Items.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold text-foreground">{t.whatToSimulate.list4Title}</h4>
                                <ul className="list-disc pl-5 mt-1">
                                    {t.whatToSimulate.list4Items.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold text-foreground">{t.whatToSimulate.list5Title}</h4>
                                <ul className="list-disc pl-5 mt-1">
                                    {t.whatToSimulate.list5Items.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                        </div>
                    </section>

                    <div className="space-y-12">
                        <section>
                            <h3 className="text-2xl font-bold mb-4 text-foreground">{t.whyAmortize.title}</h3>
                            <div className="text-muted-foreground space-y-3">
                                <p className="font-medium text-foreground">{t.whyAmortize.subtitle}</p>
                                <p>{t.whyAmortize.text1}</p>
                                <p>{t.whyAmortize.text2}</p>
                                <ul className="list-disc pl-5">
                                    {t.whyAmortize.listItems.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                                <p className="font-semibold text-green-600 dark:text-green-400">{t.whyAmortize.text3}</p>
                                <p className="text-sm italic">{t.whyAmortize.text4}</p>
                            </div>
                        </section>

                        <section className="bg-muted rounded-xl p-6">
                            <h3 className="text-2xl font-bold mb-4 text-foreground">{t.fgtsSection.title}</h3>
                            <div className="text-muted-foreground space-y-3">
                                <p>{t.fgtsSection.text1}</p>
                                <p className="font-medium text-foreground">{t.fgtsSection.listTitle}</p>
                                <ul className="list-disc pl-5">
                                    {t.fgtsSection.listItems.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                                <p className="font-semibold">{t.fgtsSection.text2}</p>
                            </div>
                        </section>
                    </div>
                </div>

                {/* Feedback Section */}
                <div className="mt-16 max-w-4xl mx-auto">
                    <CalculatorSuggestion />
                </div>

            </div>
        </>
    );
}
