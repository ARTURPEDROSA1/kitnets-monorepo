import { RentListings } from "@/components/RentListings";
import { getDictionary } from "../../../dictionaries";

export default async function RentPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col">
            <main className="container mx-auto px-4 py-8">
                <RentListings t={dict.rentPage} />
            </main>
        </div>
    );
}
