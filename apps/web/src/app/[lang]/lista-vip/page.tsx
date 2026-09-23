import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getDictionary } from "@/dictionaries";
import { LeadForm } from "@/components/waitlist/LeadForm";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    return {
        title: dict.homeContent.finalCta.title,
        description: dict.homeContent.finalCta.description,
        alternates: {
            canonical: `${baseUrl}/${lang}/lista-vip`,
            languages: {
                'pt': `${baseUrl}/pt/lista-vip`,
                'en': `${baseUrl}/en/lista-vip`,
                'es': `${baseUrl}/es/lista-vip`,
            },
        },
        openGraph: {
            title: dict.homeContent.finalCta.title,
            description: dict.homeContent.finalCta.description,
            url: `${baseUrl}/${lang}/lista-vip`,
            locale: lang,
            type: 'website',
            images: [{ url: `${baseUrl}/icon.png`, width: 512, height: 512, alt: "Kitnets.com" }],
        }
    };
}

/**
 * /lista-vip — the waitlist, now a single step: name + email.
 * Kept as its own page for links already in circulation; the home page has the same form.
 */
export default async function WaitlistPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const cta = dict.homeContent.finalCta;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Kitnets.com",
        "applicationCategory": "RealEstateApplication",
        "operatingSystem": "Web",
        "offers": { "@type": "Offer", "availability": "https://schema.org/PreOrder", "price": "0", "priceCurrency": "BRL" },
        "description": dict.home.subtitle,
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-background overflow-hidden">
                <div className="absolute inset-0 -z-10 overflow-hidden">
                    <div className="absolute -top-[10%] left-[15%] h-[400px] w-[400px] rounded-full bg-primary/15 blur-[100px]" />
                    <div className="absolute right-[15%] bottom-[10%] h-[300px] w-[300px] rounded-full bg-emerald-500/15 blur-[100px]" />
                </div>

                <div className="w-full max-w-3xl space-y-10 text-center">
                    <div className="space-y-5">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            <Sparkles className="h-3.5 w-3.5" />
                            {dict.home.eyebrow}
                        </span>
                        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground text-balance">{cta.title}</h1>
                        <p className="text-lg md:text-xl font-medium text-primary">{cta.status}</p>
                        <p className="text-base md:text-lg text-muted-foreground leading-relaxed text-balance">{cta.description}</p>
                    </div>

                    <LeadForm labels={dict.home.lead} source="lista_vip" lang={lang} />

                    <div className="bg-card/60 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-border/60 text-left space-y-4">
                        <p className="text-base font-bold text-foreground">{cta.listTitle}</p>
                        <ul className="space-y-3">
                            {cta.benefits.map((benefit: string, i: number) => (
                                <li key={i} className="flex items-start gap-3">
                                    <div className="mt-1 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>
                                    <span className="text-foreground/90">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <Link href={lang === 'pt' ? '/' : `/${lang}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Kitnets.com
                    </Link>
                </div>
            </div>
        </>
    );
}
