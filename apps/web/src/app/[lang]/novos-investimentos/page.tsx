import { Suspense } from "react";
import NovosInvestimentosContent from "./NovosInvestimentosContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Novos Investimentos",
        description: "Acompanhe os imóveis comprados na planta: parcelas pagas, previstas e o fluxo de caixa até o aluguel.",
    };
}

export default async function NovosInvestimentosPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    // useSearchParams needs a Suspense boundary for the static shell.
    return (
        <Suspense fallback={null}>
            <NovosInvestimentosContent lang={lang} />
        </Suspense>
    );
}
