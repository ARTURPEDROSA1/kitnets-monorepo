import { LaunchesListings } from "@/components/LaunchesListings";
import { getDictionary } from "@/dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    return {
        title: dict.launchesPage.title,
        description: dict.launchesPage.subtitle,
        alternates: {
            canonical: `https://kitnets.com/${lang}/lancamentos`,
            languages: {
                'pt': 'https://kitnets.com/pt/lancamentos',
                'en': 'https://kitnets.com/en/lancamentos',
                'es': 'https://kitnets.com/es/lancamentos',
            },
        },
    };
}

export default async function LaunchesPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <main className="container mx-auto">
            <LaunchesListings t={dict.launchesPage} />
        </main>
    );
}
