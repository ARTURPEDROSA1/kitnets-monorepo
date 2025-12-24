import { Button } from "@kitnets/ui";
import Link from "next/link";
import { getDictionary } from "../../dictionaries";
import { FLAGS } from "../../lib/flags";

export default async function Home({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center">
            {/* Hero Section */}
            <main className="flex w-full flex-col items-center justify-center px-4 py-20 text-center md:py-32">
                <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight max-w-4xl">
                    {dict.home.welcome}
                </h1>

                <p className="mt-6 text-xl md:text-2xl text-muted-foreground max-w-2xl">
                    {dict.home.subtitle}
                </p>

                {FLAGS.SHOW_HOME_CTA && (
                    <div className="mt-10">
                        <Link href={lang === 'pt' ? '/onboarding' : `/${lang}/onboarding`}>
                            <Button size="lg" className="h-12 px-8 text-lg">{dict.home.cta}</Button>
                        </Link>
                    </div>
                )}
            </main>

            {/* Marketing Content */}
            {dict.homeContent && (
                <section className="w-full max-w-6xl mx-auto px-4 py-12 md:py-20 space-y-24 text-left border-t border-border">
                    <div className="text-center space-y-6 max-w-4xl mx-auto pt-16">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
                            {dict.homeContent.mainTitle}
                        </h2>
                        <div className="space-y-4 text-lg md:text-xl text-muted-foreground">
                            {dict.homeContent.mainIntro.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                        {dict.homeContent.sections.map((section, idx) => (
                            <div key={idx} className="flex flex-col space-y-6 rounded-3xl border border-border bg-card p-8 md:p-10 shadow-sm transition-shadow hover:shadow-md">
                                <div>
                                    <h3 className="text-2xl font-bold text-foreground mb-3">{section.title}</h3>
                                    {section.description && <p className="text-muted-foreground leading-relaxed">{section.description}</p>}
                                </div>

                                {section.items && section.items.length > 0 && (
                                    <ul className="space-y-3 flex-grow">
                                        {section.items.map((item, i) => (
                                            <li key={i} className="flex items-start gap-3 text-foreground/90">
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                                                <span className="leading-relaxed">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {section.footer && (
                                    <div className="pt-4 border-t border-border/50">
                                        <p className="font-semibold text-primary">{section.footer}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="rounded-3xl bg-muted/50 p-12 md:p-20 text-center space-y-8 border border-border">
                        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                            {dict.homeContent.finalCta.title}
                        </h2>
                        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                            {dict.homeContent.finalCta.subtitle}
                        </p>
                        {FLAGS.SHOW_HOME_CTA && (
                            <div className="pt-4">
                                <Link href={lang === 'pt' ? '/onboarding' : `/${lang}/onboarding`}>
                                    <Button size="lg" className="h-12 px-8 text-lg">{dict.home.cta}</Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
