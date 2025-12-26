
import { CompoundInterestCalculator } from "@/components/calculators/CompoundInterestCalculator";
import { CalculatorSuggestion } from "@/components/calculators/CalculatorSuggestion";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const t = dict.compoundInterestCalculator.meta;

    return {
        title: t.title,
        description: t.description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadora-juros-compostos`,
            languages: {
                'pt': `${baseUrl}/pt/calculadora-juros-compostos`,
                'en': `${baseUrl}/en/calculadora-juros-compostos`,
                'es': `${baseUrl}/es/calculadora-juros-compostos`,
            },
        },
    }
}

export default async function CompoundInterestCalculatorPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const t = dict.compoundInterestCalculator as any;

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
                        {t.seoText?.title || t.title}
                    </h1>
                    <h2 className="text-xl md:text-2xl text-muted-foreground font-medium mb-8">
                        {t.subtitle}
                    </h2>
                </header>

                {/* Calculator Component */}
                <div className="mb-16">
                    <CompoundInterestCalculator dict={dict} lang={lang} />
                </div>

                {/* SEO Text Content */}
                {t.seoText && (
                    <div className="mt-16 max-w-4xl mx-auto space-y-12">

                        {/* Intro */}
                        <div className="text-left space-y-6">
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                {t.seoText.intro}
                            </p>
                        </div>

                        {/* How to Use - Styled as Info Block */}
                        {t.seoText.howToUse && (
                            <div className="space-y-4 rounded-lg bg-muted/40 p-6 text-sm text-muted-foreground">
                                <div className="flex items-start gap-3">
                                    <div className="space-y-4 w-full">
                                        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                            {t.seoText.howToUse.title}
                                        </h3>
                                        <ul className="list-disc list-inside space-y-2 opacity-90 ml-2">
                                            {t.seoText.howToUse.items?.map((item: string, i: number) => (
                                                <li key={i}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* What it Shows */}
                        {t.seoText.whatItShows && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-foreground">{t.seoText.whatItShows.title}</h3>
                                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                                    <ul className="list-disc list-inside space-y-3 text-muted-foreground ml-2">
                                        {t.seoText.whatItShows.items?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Features */}
                        {t.seoText.features && (
                            <div className="space-y-4 text-left">
                                <p className="text-muted-foreground leading-relaxed">
                                    {t.seoText.features}
                                </p>
                            </div>
                        )}

                        {/* Ideal For */}
                        {t.seoText.idealFor && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-foreground">{t.seoText.idealFor.title}</h3>
                                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
                                    {t.seoText.idealFor.items?.map((item: string, i: number) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Export & Conclusion */}
                        <div className="space-y-6 text-muted-foreground leading-relaxed border-t border-border pt-8">
                            {t.seoText.export && <p>{t.seoText.export}</p>}
                            {t.seoText.conclusion && (
                                <p className="font-medium text-foreground">
                                    {t.seoText.conclusion}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Feedback Section */}
                <div className="mt-16 max-w-4xl mx-auto">
                    <CalculatorSuggestion />
                </div>

            </div>
        </>
    );
}
