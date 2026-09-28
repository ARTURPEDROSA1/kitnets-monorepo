import PlanoDeContasContent from "./PlanoDeContasContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Plano de contas · Contábil & Fiscal",
        description: "O plano de contas da holding: propriedades para investimento, tributos, receitas e despesas de aluguel.",
    };
}

export default async function PlanoDeContasPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <PlanoDeContasContent lang={lang} />;
}
