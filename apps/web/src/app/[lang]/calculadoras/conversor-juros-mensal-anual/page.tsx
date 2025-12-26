
import { Metadata } from "next";
import { getDictionary } from "../../../../dictionaries";
import { InterestRateConverter } from "./InterestRateConverter";

export async function generateMetadata(
    { params }: { params: Promise<{ lang: "pt" | "en" | "es" }> }
): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    return {
        title: dict.interestRateConverterPage.title,
        description: dict.interestRateConverterPage.metaDescription,
        alternates: {
            canonical: '/calculadoras/conversor-juros-mensal-anual'
        }
    };
}

export default async function Page({ params }: { params: Promise<{ lang: "pt" | "en" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="container mx-auto py-12 px-4">
            <InterestRateConverter dict={dict} />
        </div>
    );
}
