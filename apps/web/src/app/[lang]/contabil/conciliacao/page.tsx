import ConciliacaoContent from "./ConciliacaoContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Extrato e conciliação · Contábil & Fiscal",
        description: "O extrato da holding nos livros: lançamentos automáticos, dúvidas para o proprietário e conferência do saldo bancário.",
    };
}

export default async function ConciliacaoPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <ConciliacaoContent lang={lang} />;
}
