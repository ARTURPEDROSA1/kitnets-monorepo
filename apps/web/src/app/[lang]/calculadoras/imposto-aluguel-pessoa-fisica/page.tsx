
import { IndividualRentalTaxCalculator } from "@/components/calculators/IndividualRentalTaxCalculator";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const title = `${dict.rentalTaxCalculatorPage?.seo?.title || "Calculadora Imposto Aluguel Pessoa Física"} | Kitnets.com`;
    const description = dict.rentalTaxCalculatorPage?.seo?.description || "Simule IRPF + IBS/CBS na locação de imóveis.";

    return {
        title,
        description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/imposto-aluguel-pessoa-fisica`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/imposto-aluguel-pessoa-fisica`,
                'en': `${baseUrl}/en/calculators/individual-rental-income-tax`, // Mapping requested by user, but strictly typically folders match. Using folder path for now to be safe.
                'es': `${baseUrl}/es/calculadoras/imposto-aluguel-pessoa-fisica`,
            },
        },
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/calculadoras/imposto-aluguel-pessoa-fisica`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    }
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const content = dict.rentalTaxCalculatorPage;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": content?.title || "Calculadora de Imposto sobre Aluguel - Pessoa Física",
        "description": content?.subtitle || "Simule sua carga tributária considerando IRPF + IBS/CBS",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": "Cálculo de IRPF, Classificação Pequeno/Grande Locador, IBS e CBS (Reforma Tributária)"
    };

    if (!content) return null;
    const { page } = content;

    return (
        <div className="container mx-auto py-10 px-4 space-y-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="max-w-4xl mx-auto text-center space-y-4 mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{content.title}</h1>
                <p className="text-xl text-muted-foreground">{content.subtitle}</p>
            </div>

            <IndividualRentalTaxCalculator content={content} />

            {/* Educational Content */}
            {page && (
                <article className="max-w-4xl mx-auto space-y-12 text-foreground/90 leading-relaxed">

                    {/* Intro */}
                    <section className="space-y-6">
                        <p className="text-lg whitespace-pre-line text-muted-foreground leading-relaxed">{page.intro}</p>
                    </section>

                    {/* Who Needs */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-bold text-primary">{page.whoNeeds.title}</h2>
                        <p>{page.whoNeeds.text}</p>
                        <ul className="space-y-2 bg-muted/30 p-5 rounded-xl border">
                            {page.whoNeeds.list.map((item: string, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                    <span className="text-primary">•</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="font-medium text-foreground">{page.whoNeeds.footer}</p>
                    </section>

                    {/* Small vs Large Landlord Distinction */}
                    <section className="space-y-6">
                        <h2 className="text-2xl font-bold text-primary">{page.landlordDistinction.title}</h2>
                        <p>{page.landlordDistinction.intro}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Small */}
                            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400">{page.landlordDistinction.smallTitle}</h3>
                                <p className="text-sm">{page.landlordDistinction.smallText}</p>
                                <ul className="space-y-2 text-sm">
                                    {page.landlordDistinction.smallList.map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="text-green-500 mt-1">✓</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">{page.landlordDistinction.smallFooter}</p>
                            </div>

                            {/* Large */}
                            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{page.landlordDistinction.largeTitle}</h3>
                                <p className="text-sm">{page.landlordDistinction.largeText}</p>
                                <ul className="space-y-2 text-sm">
                                    {page.landlordDistinction.largeList.map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="text-primary mt-1">⚠</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground whitespace-pre-line bg-muted p-2 rounded">{page.landlordDistinction.largeFooter}</p>
                            </div>
                        </div>
                        <p className="font-medium text-center italic">{page.landlordDistinction.conclusion}</p>
                    </section>

                    {/* How It Works */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-bold text-primary">{page.howItWorks.title}</h2>
                        <p>{page.howItWorks.text}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {page.howItWorks.list.map((item: string, i: number) => (
                                <div key={i} className="flex items-center gap-2 bg-muted/20 p-2 rounded">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                        <p className="whitespace-pre-line text-muted-foreground">{page.howItWorks.footer}</p>
                    </section>

                    {/* Substitution Myth */}
                    <section className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 space-y-4">
                        <h2 className="text-xl font-bold text-red-700 dark:text-red-400">{page.substitution.title}</h2>
                        <p className="text-2xl font-black text-red-600 dark:text-red-400">{page.substitution.answer}</p>
                        <p className="font-medium text-red-900 dark:text-red-100">{page.substitution.explanation}</p>
                        <div className="bg-background/80 p-4 rounded border">
                            <p className="font-bold text-primary mb-2">{page.substitution.highlight}</p>
                            <p className="text-sm">{page.substitution.text}</p>
                        </div>
                        <p className="text-sm italic text-red-800/80 dark:text-red-200/80">{page.substitution.footer}</p>
                    </section>

                    {/* Effective Rate Explanation */}
                    <section className="space-y-4">
                        <h2 className="text-2xl font-bold text-primary">{page.effectiveRate.title}</h2>
                        <p>{page.effectiveRate.text}</p>
                        <ul className="pl-6 list-disc space-y-1">
                            {page.effectiveRate.list.map((item: string, i: number) => <li key={i}>{item}</li>)}
                        </ul>
                        <p className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-200 text-yellow-800 dark:text-yellow-200">
                            {page.effectiveRate.explanation}
                        </p>
                        <p className="font-medium">{page.effectiveRate.footer}</p>
                    </section>

                    {/* Transparency & Important Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="space-y-4">
                            <h2 className="text-xl font-bold text-primary">{page.transparency.title}</h2>
                            <ul className="space-y-2">
                                {page.transparency.list.map((item: string, i: number) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <span className="text-green-500">✓</span> {item}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-sm text-muted-foreground">{page.transparency.footer}</p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-xl font-bold text-primary">{page.important.title}</h2>
                            <ul className="space-y-2 bg-muted/30 p-4 rounded-lg">
                                {page.important.list.map((item: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                        <span className="text-primary mt-1">•</span> {item}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>

                    {/* Planning & CTA */}
                    <section className="bg-primary/5 border border-primary/20 rounded-2xl p-8 text-center space-y-6">
                        <h2 className="text-2xl font-bold text-primary">{page.planning.title}</h2>
                        <p>{page.planning.text}</p>
                        <div className="flex flex-wrap justify-center gap-4">
                            {page.planning.list.map((item: string, i: number) => (
                                <span key={i} className="bg-background px-4 py-2 rounded-full border shadow-sm font-medium">
                                    {item}
                                </span>
                            ))}
                        </div>
                        <p className="font-bold text-lg">{page.planning.footer}</p>
                        <div className="pt-4 border-t border-primary/20">
                            <p className="text-xl font-semibold text-primary">{page.cta}</p>
                        </div>
                    </section>

                </article>
            )}
        </div>
    );
}
