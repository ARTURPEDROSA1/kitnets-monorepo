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
        <div className="w-full max-w-4xl mx-auto my-12 p-8 md:p-12 border rounded-[2rem] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-center space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-pre-line leading-tight">
                {dict.title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed text-base md:text-lg">
                {dict.description}
            </p>
            <div className="pt-4">
                <Link href={`/${lang}/lista-vip?step=landing`}>
                    <Button
                        size="lg"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-6 h-auto text-lg rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                    >
                        {dict.button}
                    </Button>
                </Link>
            </div>
        </div>
    );
}
