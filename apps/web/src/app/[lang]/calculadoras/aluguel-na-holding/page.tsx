import { HoldingRentalTaxCalculator } from "@/components/calculators/holding-rental/HoldingRentalTaxCalculator";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const title = `${dict.holdingRentalPage?.title || "Calculadora Aluguel na Holding"} | Kitnets.com`;
    const description = dict.holdingRentalPage?.intro?.slice(0, 160) || "Simule a carga tributária de aluguel em Holding Familiar no Lucro Presumido com a Reforma Tributária (IBS + CBS).";

    return {
        title,
        description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/aluguel-na-holding`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/aluguel-na-holding`,
                'en': `${baseUrl}/en/calculadoras/aluguel-na-holding`,
                'es': `${baseUrl}/es/calculadoras/aluguel-na-holding`,
            },
        },
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/calculadoras/aluguel-na-holding`,
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
    const content = dict.holdingRentalPage;

    if (!content) {
        return (
            <div className="container mx-auto py-10 px-4">
                <HoldingRentalTaxCalculator dict={dict} lang={lang} />
            </div>
        )
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": content.title,
        "description": content.intro,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": "Cálculo de IRPJ, CSLL, PIS, COFINS, CBS, IBS, Comparativo 2026-2033"
    };

    return (
        <div className="container mx-auto py-10 px-4 space-y-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <HoldingRentalTaxCalculator dict={dict} lang={lang} />

            {/* Educational Content */}
            <article className="max-w-4xl mx-auto space-y-12 text-foreground/90 leading-relaxed">

                {/* Intro */}
                <section className="space-y-6">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{content.title}</h1>
                    <p className="text-lg whitespace-pre-line text-muted-foreground">{content.intro}</p>
                </section>

                {/* What It Does */}
                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-primary">{content.whatItDoes.title}</h2>
                    <p>{content.whatItDoes.p1}</p>
                    <div className="bg-card border rounded-xl p-6 shadow-sm">
                        <p className="font-semibold mb-3">{content.whatItDoes.listTitle}</p>
                        <ul className="space-y-2">
                            {content.whatItDoes.list.map((item, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="text-primary mt-1">•</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p>{content.whatItDoes.p2}</p>
                </section>

                {/* Target Audience */}
                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-primary">{content.targetAudience.title}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {content.targetAudience.list.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 bg-muted/30 p-4 rounded-lg border">
                                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                <span className="font-medium">{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* How to Use */}
                <section className="space-y-6">
                    <h2 className="text-2xl font-bold text-primary">{content.howToUse.title}</h2>
                    <div className="space-y-8">
                        {content.howToUse.steps.map((step, i) => (
                            <div key={i} className="relative pl-8 border-l-2 border-muted">
                                <span className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-muted border-2 border-background" />
                                <h3 className="text-xl font-semibold mb-2 text-foreground">{step.title}</h3>
                                <p className="mb-2">{step.text}</p>
                                {step.bullets && (
                                    <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3 pl-4">
                                        {step.bullets.map((b, j) => <li key={j}>{b}</li>)}
                                    </ul>
                                )}
                                {step.note && (
                                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded border-l-4 border-primary/40 italic">
                                        {step.note}
                                    </p>
                                )}
                                {step.attention && (
                                    <div className="mt-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm rounded-lg border border-yellow-200 dark:border-yellow-800">
                                        {step.attention}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Methodology */}
                <section className="space-y-6">
                    <h2 className="text-2xl font-bold text-primary">{content.methodology.title}</h2>
                    <div className="grid grid-cols-1 gap-6">
                        {content.methodology.sections.map((sec, i) => (
                            <div key={i} className="bg-card p-6 rounded-xl border shadow-sm">
                                <h3 className="text-lg font-bold mb-3">{sec.title}</h3>
                                <p className="mb-3 text-sm">{sec.text}</p>
                                {sec.list && (
                                    <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                                        {sec.list.map((l, j) => <li key={j}>{l}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Results & Important */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-primary">{content.resultsDesc.title}</h2>
                        <ul className="space-y-2 bg-muted/20 p-5 rounded-xl border">
                            {content.resultsDesc.list.map((l, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                    <span className="text-emerald-500">✓</span> {l}
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-muted-foreground px-2">{content.resultsDesc.note}</p>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-primary">{content.important.title}</h2>
                        <ul className="space-y-2 bg-muted/20 p-5 rounded-xl border">
                            {content.important.list.map((l, i) => (
                                <li key={i} className="text-sm">{l}</li>
                            ))}
                        </ul>
                        <p className="text-xs text-muted-foreground px-2">{content.important.disclaimer}</p>
                    </section>
                </div>

                {/* Why Unique */}
                <section className="bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8 rounded-2xl border border-primary/10">
                    <h2 className="text-2xl font-bold text-primary mb-4">{content.whyUnique.title}</h2>
                    <p className="mb-4">{content.whyUnique.text}</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                        {content.whyUnique.list.map((l, i) => (
                            <li key={i} className="flex items-center gap-2 font-medium">
                                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                {l}
                            </li>
                        ))}
                    </ul>
                    <p className="text-lg font-medium text-foreground">{content.whyUnique.conclusion}</p>
                </section>

            </article>
        </div>
    );
}
