import ContasBancariasContent from "./ContasBancariasContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Contas bancárias · Contábil & Fiscal",
        description: "Conecte a conta da holding para alimentar DRE, balanço e impostos no Kitnets.com.",
    };
}

export default async function ContasBancariasPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <ContasBancariasContent lang={lang} />;
}
