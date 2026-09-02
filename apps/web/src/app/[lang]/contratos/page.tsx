import ContratosContent from "./ContratosContent";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: 'Contratos de Locação',
        description: 'Gerencie seus contratos de locação no Kitnets.com.',
    };
}

export default async function ContratosPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;

    return <ContratosContent lang={lang} />;
}
