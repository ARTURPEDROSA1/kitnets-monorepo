

import React from "react";
import { AnunciarProvider } from "@/components/anunciar/AnunciarContext";
import { AnunciarFlow } from "@/components/anunciar/AnunciarFlow";

export default async function AnunciarPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return (
        <AnunciarProvider lang={lang}>
            <AnunciarFlow />
        </AnunciarProvider>
    );
}
