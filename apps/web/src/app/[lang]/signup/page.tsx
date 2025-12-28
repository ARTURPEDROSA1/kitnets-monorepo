
import SignupForm from "./SignupForm";
import { getDictionary } from "../../../dictionaries";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return {
        title: `${dict.login.signUp} | Kitnets.com`,
        description: "Crie sua conta no Kitnets.com e comece a gerenciar ou encontrar seu imóvel ideal.",
        alternates: {
            canonical: `/${lang}/signup`,
        },
        robots: {
            index: true,
            follow: true,
        }
    };
}

export default async function Page({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <SignupForm lang={lang} />;
}
