

import React, { Suspense } from "react";
import { AnunciarProvider } from "@/components/anunciar/AnunciarContext";
import { AnunciarFlow } from "@/components/anunciar/AnunciarFlow";

import { getDictionary } from "@/dictionaries";
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return {
        title: `${dict.menu.advertise} | Kitnets.com`,
        description: dict.home.subtitle,
        alternates: {
            canonical: `https://kitnets.com/${lang}/anunciar`,
            languages: {
                'pt': 'https://kitnets.com/pt/anunciar',
                'en': 'https://kitnets.com/en/anunciar',
                'es': 'https://kitnets.com/es/anunciar',
            },
        },
    };
}

export default async function AnunciarPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
            <AnunciarProvider lang={lang}>
                <AnunciarFlow />
            </AnunciarProvider>
        </Suspense>
    );
}
