import { getDictionary } from "../../../dictionaries";
import CorretoresContent from "./CorretoresContent";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: 'Corretores',
        description: 'Cadastre e gerencie seus corretores de imóveis no Kitnets.com.',
    };
}

export default async function CorretoresPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return <CorretoresContent lang={lang} />;
}
