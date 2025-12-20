import { BuyListings } from "@/components/BuyListings";
import { getDictionary } from "../../../dictionaries";

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
