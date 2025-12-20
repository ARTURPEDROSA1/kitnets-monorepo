"use client";

import React from "react";
import { StepLayout } from "./StepLayout";
import { useAnunciar } from "./AnunciarContext";
import { Button } from "@kitnets/ui";
import { CheckCircle, LayoutDashboard, PlusCircle } from "lucide-react";
import Link from "next/link";

export function Step10Success() {
    const { lang } = useAnunciar();

    const getLink = (path: string) => {
        return lang === 'pt' ? path : `/${lang}${path}`;
    };

    return (
        <StepLayout title="" showBack={false}>
            <div className="text-center flex flex-col items-center py-10 animate-in zoom-in-50 duration-500">
                <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="w-12 h-12" />
                </div>

                <h1 className="text-3xl font-bold mb-2">Seu anúncio está no ar!</h1>
                <p className="text-gray-500 max-w-xs mx-auto mb-8">
                    Parabéns! Seu imóvel já está visível para milhares de interessados.
                </p>

                <div className="w-full space-y-3">
                    <Button
                        asChild
                        className="w-full h-12 text-lg gap-2 shadow-lg"
                    >
                        <Link href={getLink("/dashboard")}>
                            <LayoutDashboard className="w-5 h-5" />
                            Ver Painel
                        </Link>
                    </Button>

                    <Button
                        asChild
                        variant="outline"
                        className="w-full h-12 text-lg gap-2"
                    >
                        <Link href={getLink("/anunciar")}>
                            <PlusCircle className="w-5 h-5" />
                            Anunciar outro imóvel
                        </Link>
                    </Button>
                </div>

                <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200">
                    <p><strong>Dica:</strong> Acompanhe visitas, leads e dados do mercado local diretamente no seu painel.</p>
                </div>

            </div>
        </StepLayout>
    );
}
