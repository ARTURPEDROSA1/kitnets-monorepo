
import ProRataRentCalculatorClient from "./ProRataRentCalculatorClient";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const t = (dict as any).proRataRentCalculatorPage?.seo;

    return {
        title: t?.title || "Calculadora de Aluguel Proporcional",
        description: t?.description || "Calcule o aluguel proporcional online.",
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/aluguel-proporcional`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/aluguel-proporcional`,
                'en': `${baseUrl}/en/calculadoras/aluguel-proporcional`,
                'es': `${baseUrl}/es/calculadoras/aluguel-proporcional`,
            },
        },
    }
}

export default function Page() {
    return <ProRataRentCalculatorClient />;
}
