"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CalculatorCtaProps {
    dict: {
        title: string;
        description: string;
        button: string;
    };
    lang: string;
}

export default function CalculatorCta({ dict, lang }: CalculatorCtaProps) {
    if (!dict) return null;

    return (
        <div className="mt-16 text-center space-y-8 bg-muted/30 p-8 md:p-12 rounded-[2.5rem] border relative overflow-hidden w-full max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-grid-black/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))]" />
            <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight whitespace-pre-line text-foreground">
                    {dict.title}
                </h2>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                    {dict.description}
                </p>
                <div className="pt-2">
                    <Link href={`/${lang}/lista-vip?step=landing`}>
                        <Button size="lg" className="h-14 px-8 text-lg rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all border-0">
                            {dict.button}
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
