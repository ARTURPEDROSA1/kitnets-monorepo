import LancamentosContent from "./LancamentosContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Lançamentos · Contábil & Fiscal",
        description: "Livro de lançamentos da holding em partidas dobradas, com fechamento mensal e estornos.",
    };
}

export default async function LancamentosPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <LancamentosContent lang={lang} />;
}
