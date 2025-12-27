
import { WaitlistProvider } from "@/components/waitlist/WaitlistContext";
import { WaitlistFlow } from "@/components/waitlist/WaitlistFlow";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    return {
        title: "Lista de Espera SaaS - Kitnets.com",
        description: "Plataforma profissional para gestão de imóveis. Cadastre-se na lista de espera para acesso antecipado.",
        alternates: {
            canonical: `${baseUrl}/${lang}/lista-vip`,
            languages: {
                'pt': `${baseUrl}/pt/lista-vip`,
                'en': `${baseUrl}/en/lista-vip`,
                'es': `${baseUrl}/es/lista-vip`,
            },
        },
        openGraph: {
            title: "Lista de Espera SaaS - Kitnets.com",
            description: "Plataforma profissional para gestão de imóveis. Cadastre-se na lista de espera para acesso antecipado.",
            url: `${baseUrl}/${lang}/lista-vip`,
            locale: lang,
            type: 'website',
            images: [
                {
                    url: `${baseUrl}/icon.png`,
                    width: 512,
                    height: 512,
                    alt: "Kitnets.com SaaS"
                }
            ]
        }
    };
}

export default async function WaitlistPage() {

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Kitnets.com SaaS",
        "applicationCategory": "RealEstateApplication",
        "operatingSystem": "Web",
        "offers": {
            "@type": "Offer",
            "availability": "https://schema.org/PreOrder",
            "price": "0",
            "priceCurrency": "BRL"
        },
        "description": "Plataforma profissional para gestão de imóveis e carteiras imobiliárias."
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <WaitlistProvider>
                <WaitlistFlow />
            </WaitlistProvider>
        </>
    );
}
