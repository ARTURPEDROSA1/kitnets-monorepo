import PoliticasContent from "./PoliticasContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Políticas contábeis · Contábil & Fiscal",
        description: "Norma, modelo de mensuração dos imóveis e demais políticas contábeis da holding, com a simulação dos modelos.",
    };
}

export default async function PoliticasPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <PoliticasContent lang={lang} />;
}
