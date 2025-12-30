
import RentAdjustmentCalculatorClient from "./RentAdjustmentCalculatorClient";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const t = (dict as any).rentAdjustmentCalculatorPage?.seo;

    return {
        title: t?.title || "Calculadora de Reajuste de Aluguel",
        description: t?.description || "Calcule o reajuste de aluguel online e gratuito.",
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadora-reajuste-aluguel`,
            languages: {
                'pt': `${baseUrl}/pt/calculadora-reajuste-aluguel`,
                'en': `${baseUrl}/en/calculadora-reajuste-aluguel`,
                'es': `${baseUrl}/es/calculadora-reajuste-aluguel`,
            },
        },
    }
}

export default function Page() {
    return <RentAdjustmentCalculatorClient />;
}
