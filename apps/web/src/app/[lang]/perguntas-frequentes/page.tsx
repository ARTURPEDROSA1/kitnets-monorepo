import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FaqSection } from './components/FaqSection';
import { AskForm } from './components/AskForm';
import { ContactForm } from './components/ContactForm';
import { faqData } from './faq-data';

export const metadata: Metadata = {
    title: 'Perguntas Frequentes - Kitnets.com',
    description: 'Tudo o que você precisa saber sobre a Kitnets.com — rápido, claro e sem complicação.',
};

export default function FaqPage() {
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
                <div className="mt-20 text-center py-10 px-6 bg-muted/40 rounded-2xl w-full">
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                        Pronto para usar a Kitnets.com?
                    </h2>
                    <p className="text-muted-foreground mb-6">
                        Crie sua conta e comece agora.
                    </p>
                    <a
                        href="/cadastro"
                        className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-emerald-600 hover:bg-emerald-700 md:text-lg transition-transform hover:scale-105 shadow-lg shadow-emerald-600/20"
                    >
                        Começar agora
                    </a>
                </div>
            </div>
        </div>
    );
}
