import { getDictionary } from "@/dictionaries";
import { Metadata } from "next";
import RentalIncomeCalculatorClient from "./RentalIncomeCalculatorClient";

type Props = {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;

    // cast to any to avoid type check issues if dictionary types aren't perfectly up to date with the new key immediately
    const dict = getDictionary(lang) as any;
    const seo = dict.rentalIncomeCalculatorPage?.seo || {
        title: "Calculadora: A Renda do Aluguel Paga o Financiamento? - Kitnets.com",
        description: "Descubra em quanto tempo o aluguel cobre a parcela do financiamento. Simule cenários com SAC, PRICE, vacância e impostos."
    };

    return {
        title: seo.title,
        description: seo.description,
        alternates: {
            canonical: `https://kitnets.com/${lang}/calculadoras/renda-aluguel`,
        },
    };
}

export default async function Page() {
    return <RentalIncomeCalculatorClient />;
}
