import { Button } from "@kitnets/ui";
import Link from "next/link";
import { getDictionary } from "../../dictionaries";
import { FLAGS } from "../../lib/flags";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return {
        title: dict.home.welcome + " — " + dict.home.subtitle.split('.')[0], // "Bem-vindo ao Kitnets.com — A plataforma de IA para gestão de kitnets e studios"
        description: dict.home.subtitle,
        alternates: {
            canonical: `https://kitnets.com/${lang}`,
        }
    };
}

export default async function Home({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center bg-background selection:bg-primary/20">
            {/* Hero Section */}
            <main className="relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-20 text-center md:py-32 lg:py-40">
                {/* Background decorative elements */}
                <div className="absolute inset-0 -z-10 overflow-hidden">
                    <div className="absolute -top-[20%] left-[20%] h-[400px] w-[400px] rounded-full bg-primary/20 blur-[100px]" />
                    <div className="absolute right-[20%] top-[10%] h-[300px] w-[300px] rounded-full bg-blue-500/20 blur-[100px]" />
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-foreground md:text-6xl lg:text-7xl">
                        {dict.home.welcome}{" "}
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-600 to-purple-600">
                            {/* Optional: we could highlight part of the welcome text if we split it, but for now we keep it clean */}
                        </span>
                    </h1>
                </div>

                <div className="mt-6 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <p className="text-xl text-muted-foreground md:text-2xl leading-relaxed">
                        {dict.home.subtitle}
                    </p>
                </div>

                {FLAGS.SHOW_HOME_CTA && (
                    <div className="mt-10 animate-in fade-in zoom-in duration-1000 delay-300">
                        <Link href={lang === 'pt' ? '/onboarding' : `/${lang}/onboarding`}>
                            <Button size="lg" className="h-14 rounded-full px-10 text-xl font-semibold shadow-lg shadow-primary/25 transition-transform hover:scale-105 hover:shadow-xl">
                                {dict.home.cta}
                            </Button>
                        </Link>
                    </div>
                )}
            </main>

            {/* Marketing Content */}
            {dict.homeContent && (
                <section className="w-full max-w-7xl mx-auto px-4 py-12 md:py-24 space-y-20 md:space-y-32">
                    {/* Main Intro */}
                    <div className="text-center space-y-8 max-w-4xl mx-auto">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
                            {dict.homeContent.mainTitle}
                        </h2>
                        <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
                            {dict.homeContent.mainIntro.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </div>
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16">
                        {dict.homeContent.sections.map((section, idx) => (
                            <article
                                key={idx}
                                className="group relative flex flex-col space-y-6 rounded-3xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 md:p-12 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 hover:bg-card/80"
                            >
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent scale-x-0 opacity-0 transition-all duration-500 group-hover:scale-x-100 group-hover:opacity-100" />

                                <div>
                                    <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
                                        {section.title}
                                    </h3>
                                    {section.description && (
                                        <p className="text-muted-foreground text-lg leading-relaxed">
                                            {section.description}
                                        </p>
                                    )}
                                </div>

                                {section.items && section.items.length > 0 && (
                                    <ul className="space-y-4 flex-grow">
                                        {section.items.map((item, i) => (
                                            <li key={i} className="flex items-start gap-4 text-foreground/90">
                                                <div className="mt-1.5 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                </div>
                                                <span className="leading-relaxed text-base md:text-lg">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {section.footer && (
                                    <div className="pt-6 border-t border-border/50">
                                        <p className="font-medium text-primary text-lg">{section.footer}</p>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>

                    {/* Final CTA */}
                    <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-muted/50 to-background border border-border p-12 md:p-24 text-center space-y-10 shadow-2xl">
                        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />

                        <div className="relative z-10 space-y-6">
                            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight">
                                {dict.homeContent.finalCta.title}
                            </h2>
                            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto font-light">
                                {dict.homeContent.finalCta.subtitle}
                            </p>
                            {FLAGS.SHOW_HOME_CTA && (
                                <div className="pt-8">
                                    <Link href={lang === 'pt' ? '/onboarding' : `/${lang}/onboarding`}>
                                        <Button size="lg" className="h-16 px-12 text-xl rounded-full shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-105 transition-all">
                                            {dict.home.cta}
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
