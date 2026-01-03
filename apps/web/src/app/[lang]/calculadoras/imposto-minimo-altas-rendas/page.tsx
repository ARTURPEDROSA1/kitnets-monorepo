import { HighIncomeTaxCalculator } from "@/components/calculators/HighIncomeTaxCalculator";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const content = dict.highIncomeTaxCalculatorPage;
    const title = `${content?.seo?.title || "Calculadora Imposto Mínimo para Altas Rendas (IRPFM)"} | Kitnets.com`;
    const description = content?.seo?.description || "Simule o Imposto Mínimo para Altas Rendas (IRPFM) conforme Lei 15.270/2025.";

    return {
        title,
        description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/imposto-minimo-altas-rendas`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/imposto-minimo-altas-rendas`,
                'en': `${baseUrl}/en/calculadoras/imposto-minimo-altas-rendas`,
                'es': `${baseUrl}/es/calculadoras/imposto-minimo-altas-rendas`,
            },
        },
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/calculadoras/imposto-minimo-altas-rendas`,
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
    const content = dict.highIncomeTaxCalculatorPage;
    const article = content?.article;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": content?.title,
        "description": content?.subtitle,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": "Cálculo de IRPFM, Simulação de Alíquota Efetiva, Redutor Lei 15.270"
    };

    return (
        <div className="container mx-auto py-10 px-4 space-y-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <HighIncomeTaxCalculator dict={dict} />

            {/* Article Content */}
            {article && (
                <article className="max-w-4xl mx-auto space-y-12 text-foreground/90 leading-relaxed">
                    {/* Header */}
                    <section className="space-y-6">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{article.title}</h1>
                        <p className="text-xl leading-relaxed text-muted-foreground">{article.intro}</p>
                        <p className="text-lg leading-relaxed">{article.description}</p>
                    </section>

                    {/* What Is */}
                    {article.whatIs && (
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">{article.whatIs.title}</h2>
                            <p className="text-lg">{article.whatIs.content}</p>
                            <ul className="grid gap-2 pl-4">
                                {article.whatIs.list.map((item: string, i: number) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0 mt-2.5" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
                                <p className="font-medium">{article.whatIs.note}</p>
                            </div>
                        </section>
                    )}

                    {/* How It Works */}
                    {article.howItWorks && (
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">{article.howItWorks.title}</h2>
                            <p className="text-lg">{article.howItWorks.content}</p>
                            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-3">
                                {article.howItWorks.list.map((item: string, i: number) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                                            {i + 1}
                                        </div>
                                        <span className="font-medium">{item}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-muted-foreground italic">{article.howItWorks.note}</p>
                        </section>
                    )}

                    {/* What To Simulate */}
                    {article.whatToSimulate && (
                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">{article.whatToSimulate.title}</h2>
                            <p className="text-lg">{article.whatToSimulate.content}</p>
                            <ul className="grid gap-3 pt-2">
                                {article.whatToSimulate.list.map((item: string, i: number) => (
                                    <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-transparent hover:border-border transition-colors">
                                        <span className="text-primary font-bold">✓</span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Dividends */}
                        {article.dividends && (
                            <section className="space-y-4">
                                <h2 className="text-xl font-bold text-foreground">{article.dividends.title}</h2>
                                <p className="leading-relaxed text-muted-foreground">{article.dividends.content}</p>
                            </section>
                        )}

                        {/* Redutor */}
                        {article.redutor && (
                            <section className="space-y-4">
                                <h2 className="text-xl font-bold text-foreground">{article.redutor.title}</h2>
                                <p className="leading-relaxed text-muted-foreground">{article.redutor.content}</p>
                            </section>
                        )}
                    </div>

                    {/* Why Use */}
                    {article.whyUse && (
                        <section className="space-y-6 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-6 md:p-8 rounded-2xl border">
                            <h2 className="text-2xl font-bold text-foreground">{article.whyUse.title}</h2>
                            <ul className="grid gap-3">
                                {article.whyUse.list.map((item: string, i: number) => (
                                    <li key={i} className="flex items-center gap-3">
                                        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                                            <span className="text-primary-foreground text-xs">★</span>
                                        </div>
                                        <span className="font-medium">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Important & CTA */}
                    <div className="grid md:grid-cols-2 gap-6 pt-4">
                        {article.important && (
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-6 rounded-xl space-y-3">
                                <h3 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                    ⚠️ {article.important.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                                    {article.important.content}
                                </p>
                            </div>
                        )}

                        {article.cta && (
                            <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl space-y-3">
                                <h3 className="font-bold text-primary flex items-center gap-2">
                                    🚀 {article.cta.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    {article.cta.content}
                                </p>
                            </div>
                        )}
                    </div>
                </article>
            )}
        </div>
    );
}
