import { getDictionary } from "../../../dictionaries";
import ImobiliariaContent from "./ImobiliariaContent";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: 'Imobiliária',
        description: 'Cadastre e gerencie sua imobiliária no Kitnets.com.',
    };
}

export default async function ImobiliariaPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return <ImobiliariaContent lang={lang} />;
}
