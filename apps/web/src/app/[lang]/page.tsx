import { getDictionary } from "../../dictionaries";
import { FLAGS } from "../../lib/flags";
import { LeadForm } from "@/components/waitlist/LeadForm";
import { Building2, Droplets, Sparkles, Sun, TrendingUp } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

    return {
        title: `${dict.home.welcome} — Kitnets.com`,
        description: dict.home.subtitle,
        alternates: {
            canonical: `${baseUrl}/${lang}`,
            languages: {
                'pt': `${baseUrl}/pt`,
                'en': `${baseUrl}/en`,
                'es': `${baseUrl}/es`,
                'x-default': `${baseUrl}/pt`,
            },
        }
    };
}

const HIGHLIGHT_ICONS = [Building2, Droplets, Sun, TrendingUp];

export default async function Home({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center bg-background selection:bg-primary/20">
            {/* Hero */}
            <main className="relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-20 text-center md:py-28 lg:py-36">
                <div className="absolute inset-0 -z-10 overflow-hidden">
                    <div className="absolute -top-[20%] left-[20%] h-[400px] w-[400px] rounded-full bg-primary/20 blur-[100px]" />
                    <div className="absolute right-[20%] top-[10%] h-[300px] w-[300px] rounded-full bg-emerald-500/20 blur-[100px]" />
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        {dict.home.eyebrow}
                    </span>
                    <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-foreground md:text-6xl lg:text-7xl text-balance">
                        {dict.home.welcome}
                    </h1>
                </div>

                <div className="mt-6 max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <p className="text-lg text-muted-foreground md:text-2xl leading-relaxed text-balance">
                        {dict.home.subtitle}
                    </p>
                </div>

                {FLAGS.SHOW_HOME_CTA && (
                    <div className="mt-10 w-full animate-in fade-in zoom-in duration-1000 delay-300">
                        <LeadForm labels={dict.home.lead} source="home_hero" lang={lang} />
                    </div>
                )}

                <ul className="mt-10 flex flex-wrap items-center justify-center gap-2.5 animate-in fade-in duration-1000 delay-500">
                    {dict.home.highlights.map((label, i) => {
                        const Icon = HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length];
                        return (
                            <li key={label} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur-sm">
                                <Icon className="h-4 w-4 text-emerald-600" />
                                {label}
                            </li>
                        );
                    })}
                </ul>
            </main>

            {/* Marketing content */}
            {dict.homeContent && (
                <section className="w-full max-w-7xl mx-auto px-4 py-12 md:py-24 space-y-20 md:space-y-32">
                    {/* Main intro */}
                    <div className="text-center space-y-8 max-w-4xl mx-auto">
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight text-balance">
                            {dict.homeContent.mainTitle}
                        </h2>
                        <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
                            {dict.homeContent.mainIntro.map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </div>
                    </div>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16">
                        {dict.homeContent.sections.map((section, idx) => (
                            <article
                                key={idx}
                                className="group relative flex flex-col space-y-6 rounded-3xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 md:p-12 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 hover:bg-card/80"
                            >
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent scale-x-0 opacity-0 transition-all duration-500 group-hover:scale-x-100 group-hover:opacity-100" />

                                <div>
                                    <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
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
                    <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-muted/50 to-background border border-border p-8 md:p-16 lg:p-24 text-center space-y-12 shadow-2xl">
                        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />

                        <div className="relative z-10 space-y-10 max-w-4xl mx-auto">
                            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight leading-tight text-balance">
                                {dict.homeContent.finalCta.title}
                            </h2>

                            <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
                                <p className="font-medium text-primary text-xl md:text-2xl">
                                    {dict.homeContent.finalCta.status}
                                </p>
                                <p>{dict.homeContent.finalCta.description}</p>
                            </div>

                            <div className="bg-card/40 backdrop-blur-sm rounded-2xl p-8 border border-border/50 text-left space-y-6">
                                <p className="text-xl font-bold text-foreground">
                                    {dict.homeContent.finalCta.listTitle}
                                </p>
                                <ul className="space-y-4">
                                    {dict.homeContent.finalCta.benefits.map((benefit: string, i: number) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className="mt-1 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            </div>
                                            <span className="text-foreground/90 text-lg">{benefit}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="space-y-6">
                                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                                    {dict.homeContent.finalCta.closing}
                                </p>
                                <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                                    {dict.homeContent.finalCta.callToAction}
                                </h3>
                            </div>

                            {FLAGS.SHOW_HOME_CTA && (
                                <div className="pt-4 space-y-4">
                                    <p className="text-base text-muted-foreground font-medium">
                                        {dict.homeContent.finalCta.subText1}
                                    </p>
                                    <LeadForm labels={dict.home.lead} source="home_cta" lang={lang} tone="card" />
                                    <p className="text-sm text-balance text-muted-foreground max-w-lg mx-auto">
                                        {dict.homeContent.finalCta.subText2}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
