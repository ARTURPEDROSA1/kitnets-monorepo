import { Irpf2026Calculator } from "@/components/calculators/Irpf2026Calculator";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const title = `${dict.irpf2026CalculatorPage?.title || "Calculadora IRPF 2026"} | Kitnets.com`;
    const description = dict.irpf2026CalculatorPage?.subtitle || "Simulação oficial com redução da Lei 15.270/2025";

    return {
        title,
        description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/irpf-2026`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/irpf-2026`,
                'en': `${baseUrl}/en/calculadoras/irpf-2026`,
                'es': `${baseUrl}/es/calculadoras/irpf-2026`,
            },
        },
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/calculadoras/irpf-2026`,
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
    const content = dict.irpf2026CalculatorPage;

    if (!content) {
        return (
            <div className="container mx-auto py-10 px-4">
                <Irpf2026Calculator />
            </div>
        )
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": content.title,
        "description": content.subtitle,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": "Cálculo de IRPF 2026, Comparativo Mensal/Anual, Redução Lei 15.270"
    };

    return (
        <div className="container mx-auto py-10 px-4 space-y-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Irpf2026Calculator />

            {/* Content Article - displayed if content exists */}
            {content && (
                <article className="max-w-4xl mx-auto space-y-12 text-foreground/90 leading-relaxed">
                    <section className="space-y-6">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{content.title}</h1>
                        <p className="text-xl text-muted-foreground">{content.subtitle}</p>
                        <p className="text-lg leading-relaxed">{content.intro}</p>


                        {content.featuresIntro && (
                            <p className="text-lg font-medium pt-4">{content.featuresIntro}</p>
                        )}

                        {content.featuresList && (
                            <ul className="grid gap-3 pt-2">
                                {content.featuresList.map((feature: string, i: number) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-primary text-sm font-bold">✓</span>
                                        </div>
                                        <span className="text-lg">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="font-medium text-lg pt-2 border-l-4 border-primary pl-4">{content.introConclusion}</p>
                    </section>

                    {/* Changes 2026 */}
                    {content.changes && (
                        <section className="space-y-6">
                            <h2 className="text-2xl md:text-3xl font-bold text-foreground">{content.changes.title}</h2>
                            <p className="text-lg">{content.changes.intro}</p>

                            <div className="grid gap-6">
                                {content.changes.items.map((item: { title: string; text: string }, i: number) => (
                                    <div key={i} className="bg-card border rounded-xl p-6 shadow-sm">
                                        <h3 className="text-xl font-bold text-primary mb-3 flex items-center gap-2">
                                            {i === 2 ? '❌' : '✅'} {item.title}
                                        </h3>
                                        <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                                    </div>
                                ))}
                            </div>

                            {content.changes.appliesTo && (
                                <div className="bg-muted/30 rounded-xl p-6 border">
                                    <h3 className="font-semibold mb-4 text-lg">{content.changes.appliesTo.title}</h3>
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        {content.changes.appliesTo.list.map((item: string, i: number) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
                                                <span>{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* How To */}
                    {content.howTo && (
                        <section className="space-y-8">
                            <div className="border-b pb-4">
                                <h2 className="text-2xl md:text-3xl font-bold text-foreground">{content.howTo.title}</h2>
                                <p className="text-lg text-muted-foreground mt-2">{content.howTo.subtitle}</p>
                            </div>

                            <div className="grid gap-8 relative">
                                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-border hidden md:block" />
                                {content.howTo.steps.map((step: { title: string; text: string }, i: number) => (
                                    <div key={i} className="relative md:pl-12">
                                        <div className="hidden md:flex absolute left-0 top-0 h-10 w-10 text-lg font-bold items-center justify-center rounded-full bg-primary text-primary-foreground border-4 border-background z-10">
                                            {i + 1}
                                        </div>
                                        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                                            <span className="md:hidden flex h-6 w-6 text-xs items-center justify-center rounded-full bg-primary text-primary-foreground">{i + 1}</span>
                                            {step.title}
                                        </h3>
                                        <p className="text-muted-foreground leading-relaxed">{step.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Results */}
                    {content.results && (
                        <section className="space-y-6 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-6 md:p-8 rounded-2xl border">
                            <h2 className="text-2xl font-bold text-foreground">{content.results.title}</h2>
                            <p className="text-lg font-medium">{content.results.intro}</p>

                            <div className="grid md:grid-cols-2 gap-8">
                                <ul className="space-y-2">
                                    {content.results.list.map((item: string, i: number) => (
                                        <li key={i} className="flex items-center gap-2 text-muted-foreground">
                                            <span className="text-primary">✓</span> {item}
                                        </li>
                                    ))}
                                </ul>

                                <div className="bg-card bg-background rounded-xl p-6 border shadow-sm">
                                    <p className="font-bold mb-4">{content.results.classificationTitle}</p>
                                    <div className="grid gap-2">
                                        {content.results.classification.map((cls: string, i: number) => (
                                            <div key={i} className="px-3 py-2 rounded-lg bg-muted text-sm font-medium border text-center">
                                                {cls}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Why Use */}
                    {content.whyUse && (
                        <section className="space-y-6">
                            <h2 className="text-2xl font-bold text-foreground">{content.whyUse.title}</h2>
                            <div className="grid md:grid-cols-3 gap-6">
                                {content.whyUse.items.map((item: { title: string; text: string }, i: number) => (
                                    <div key={i} className="space-y-3">
                                        <div className="text-4xl">
                                            {i === 0 ? '🔎' : i === 1 ? '📐' : '🧮'}
                                        </div>
                                        <h3 className="font-bold text-lg">{item.title}</h3>
                                        <p className="text-sm text-muted-foreground">{item.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Target Audience & Warning */}
                    <div className="grid md:grid-cols-2 gap-8 items-start">
                        {content.targetAudience && (
                            <section className="space-y-4">
                                <h2 className="text-xl font-bold">{content.targetAudience.title}</h2>
                                <ul className="space-y-2">
                                    {content.targetAudience.list.map((item: string, i: number) => (
                                        <li key={i} className="flex items-center gap-2 text-sm bg-muted/40 p-2 rounded">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {content.warning && (
                            <section className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-6 rounded-xl space-y-3">
                                <h2 className="text-xl font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                    ⚠️ {content.warning.title}
                                </h2>
                                <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                                    {content.warning.text}
                                </p>
                            </section>
                        )}
                    </div>

                    {/* Legal */}
                    {content.legal && (
                        <section className="space-y-4 pt-8 border-t">
                            <h2 className="text-xl font-bold text-muted-foreground">{content.legal.title}</h2>
                            <p className="text-sm text-muted-foreground">{content.legal.intro}</p>
                            <ul className="grid sm:grid-cols-2 gap-2">
                                {content.legal.list.map((item: string, i: number) => (
                                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span className="text-muted-foreground/50">▪</span> {item}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs italic text-muted-foreground mt-2">{content.legal.disclaimer}</p>
                        </section>
                    )}
                </article>
            )}
        </div>
    );
}
