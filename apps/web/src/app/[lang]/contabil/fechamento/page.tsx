import FechamentoContent from "./FechamentoContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Fechamento do mês · Contábil & Fiscal",
        description: "Competência do mês (aluguéis, depreciação, juros de financiamentos), conferência do fechamento e pacote do contador.",
    };
}

export default async function FechamentoPage({ params, searchParams }: { params: Promise<{ lang: "en" | "pt" | "es" }>; searchParams: Promise<{ month?: string }> }) {
    const { lang } = await params;
    const { month } = await searchParams;
    return <FechamentoContent lang={lang} initialMonth={month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null} />;
}
