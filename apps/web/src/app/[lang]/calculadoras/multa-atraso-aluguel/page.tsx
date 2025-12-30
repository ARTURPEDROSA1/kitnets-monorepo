import { getDictionary } from "@/dictionaries";
import RentLateFineCalculatorClient from "./RentLateFineCalculatorClient";
import { Metadata } from "next";

type Props = {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const seo = dict.rentLateFineCalculatorPage.seo;

    return {
        title: seo.title,
        description: seo.description,
        alternates: {
            canonical: `https://kitnets.com/${lang}/calculadoras/multa-atraso-aluguel`,
        }
    };
}

export default async function RentLateFineCalculatorPage() {
    return <RentLateFineCalculatorClient />;
}
