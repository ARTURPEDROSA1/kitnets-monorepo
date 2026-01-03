import { HighIncomeTaxCalculator } from "@/components/calculators/HighIncomeTaxCalculator";
import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const content = dict.highIncomeTaxCalculatorPage;
    const title = `${content?.seo?.title || "Calculadora Imposto Mínimo PF (IRPFM)"} | Kitnets.com`;
    const description = content?.seo?.description || "Simule o Imposto Mínimo para Altas Rendas (IRPFM) conforme Lei 15.270/2025.";

    return {
        title,
        description,
        alternates: {
            canonical: `${baseUrl}/${lang}/calculadoras/imposto-minimo-pf`,
            languages: {
                'pt': `${baseUrl}/pt/calculadoras/imposto-minimo-pf`,
                'en': `${baseUrl}/en/calculadoras/imposto-minimo-pf`,
                'es': `${baseUrl}/es/calculadoras/imposto-minimo-pf`,
            },
        },
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/calculadoras/imposto-minimo-pf`,
            siteName: 'Kitnets.com',
            locale: lang,
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    }
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const content = dict.highIncomeTaxCalculatorPage;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": content?.title,
        "description": content?.subtitle,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "featureList": "Cálculo de IRPFM, Simulação de Alíquota Efetiva, Redutor Lei 15.270"
    };

    return (
        <div className="container mx-auto py-10 px-4 space-y-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <HighIncomeTaxCalculator dict={dict} />
        </div>
    );
}
