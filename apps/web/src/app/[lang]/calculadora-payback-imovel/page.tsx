import PaybackCalculatorClient from "./PaybackCalculatorClient";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kitnets.com";
    const t = (dict as unknown as { paybackCalculatorPage?: { seo?: { title?: string; description?: string } } }).paybackCalculatorPage?.seo;

    return {
        title: t?.title || "Calculadora de Payback de Imóvel para Aluguel",
        description: t?.description || "Descubra em quantos anos um imóvel alugado se paga: payback, yield, TIR e fluxo de caixa com ou sem financiamento.",
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadora-payback-imovel`,
            languages: {
                pt: `${baseUrl}/pt/calculadora-payback-imovel`,
                en: `${baseUrl}/en/calculadora-payback-imovel`,
                es: `${baseUrl}/es/calculadora-payback-imovel`,
            },
        },
    };
}

export default function Page() {
    return <PaybackCalculatorClient />;
}
