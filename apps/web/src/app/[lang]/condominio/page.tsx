import CondominioContent from "./CondominioContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Condomínio",
        description: "Receitas, custos e resultado do condomínio dos seus imóveis com várias unidades.",
    };
}

export default async function CondominioPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <CondominioContent lang={lang} />;
}
