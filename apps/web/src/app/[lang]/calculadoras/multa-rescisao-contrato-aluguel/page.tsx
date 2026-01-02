import { getDictionary } from "@/dictionaries";
import RentFineCalculator from "./RentFineCalculatorClient";
import { Metadata } from "next";

export async function generateMetadata({ params: { lang } }: { params: { lang: string } }): Promise<Metadata> {
    const dict = getDictionary(lang);

    return {
        title: dict.rentFineCalculatorPage.metaTitle || "Calculadora de Multa Rescisória de Aluguel | Kitnets",
        description: dict.rentFineCalculatorPage.metaDescription || "Calcule o valor da multa por quebra de contrato de aluguel conforme a Lei do Inquilinato. Simule diferentes cenários e saiba quanto pagar.",
        alternates: {
            canonical: `https://www.kitnets.com.br/${lang}/calculadoras/multa-rescisao-contrato-aluguel`,
            languages: {
                'pt': 'https://www.kitnets.com.br/pt/calculadoras/multa-rescisao-contrato-aluguel',
                'en': 'https://www.kitnets.com.br/en/calculadoras/multa-rescisao-contrato-aluguel', // Assuming generic fallback
                'es': 'https://www.kitnets.com.br/es/calculadoras/multa-rescisao-contrato-aluguel',
            }
        }
    };
}

export default function Page({ params: { lang } }: { params: { lang: string } }) {
    const dict = getDictionary(lang);

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": dict.rentFineCalculatorPage.title || "Calculadora de Multa Rescisória",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "description": dict.rentFineCalculatorPage.description || "Calcule multa de aluguel rapidamente.",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "url": `https://www.kitnets.com.br/${lang}/calculadoras/multa-rescisao-contrato-aluguel`,
        "author": {
            "@type": "Organization",
            "name": "Kitnets"
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd)
                }}
            />
            <RentFineCalculator />
        </>
    );
}
