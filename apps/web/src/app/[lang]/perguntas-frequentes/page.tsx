import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FaqSection } from './components/FaqSection';
import { AskForm } from './components/AskForm';
import { ContactForm } from './components/ContactForm';
import { faqData } from './faq-data';
import { getDictionary } from '../../../dictionaries';
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: 'Perguntas Frequentes - Kitnets.com',
    description: 'Tudo o que você precisa saber sobre a Kitnets.com — rápido, claro e sem complicação.',
};

export default async function FaqPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    // Generate JSON-LD for SEO
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqData.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
            },
        })),
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="max-w-4xl mx-auto px-4 py-12 sm:py-20 flex flex-col items-center">
                {/* Header Section */}
                <header className="text-center mb-12 max-w-2xl px-6">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
                        Perguntas Frequentes
                    </h1>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        Tudo o que você precisa saber sobre a Kitnets.com — rápido, claro e sem complicação.
                    </p>
                </header>

                {/* FAQ List Component */}
                <div className="w-full mb-16">
                    <Suspense fallback={<div className="h-64 flex items-center justify-center text-muted-foreground">Carregando perguntas...</div>}>
                        <FaqSection />
                    </Suspense>
                </div>

                {/* Ask Question Form */}
                <div className="w-full max-w-2xl mb-12">
                    <AskForm />
                </div>

                {/* Contact Form */}
                <div className="w-full">
                    <ContactForm />
                </div>

                {/* Final CTA */}
                <div className="mt-20 w-full text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
                    <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                        <h3 className="text-3xl md:text-3xl font-bold tracking-tight whitespace-pre-line text-foreground">
                            {(dict as any).calculatorCtaStandard?.title}
                        </h3>
                        <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">
                            {(dict as any).calculatorCtaStandard?.description}
                        </p>
                        <div className="pt-4 flex flex-col items-center gap-3">
                            <Link href={`/${lang}/lista-vip?step=landing`}>
                                <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                                    {(dict as any).calculatorCtaStandard?.button}
                                </Button>
                            </Link>
                            <p className="text-xs md:text-sm text-muted-foreground font-medium opacity-80">
                                {(dict as any).calculatorCtaStandard?.microcopy}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
