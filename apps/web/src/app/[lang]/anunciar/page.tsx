

import React, { Suspense } from "react";
import { AnunciarProvider } from "@/components/anunciar/AnunciarContext";
import { AnunciarFlow } from "@/components/anunciar/AnunciarFlow";

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
