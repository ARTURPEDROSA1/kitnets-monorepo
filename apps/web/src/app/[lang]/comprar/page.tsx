import { BuyListings } from "@/components/BuyListings";
import { getDictionary } from "../../../dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    return {
        title: dict.buyPage.title,
        description: dict.buyPage.subtitle,
    };
}

export default async function BuyPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col">
            <main className="container mx-auto px-4 py-8">
                <BuyListings t={dict.buyPage} />
            </main>
        </div>
    );
}
