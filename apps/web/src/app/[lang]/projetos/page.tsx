import { Suspense } from "react";
import ProjetosContent from "./ProjetosContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Projetos",
        description: "O que está sendo comprado ou construído: parcelas pagas, previstas, valorização e o fluxo de caixa até o imóvel render.",
    };
}

/** `/projetos` — the module was "Novos Investimentos" until 2026-09; next.config redirects the old address here. */
export default async function ProjetosPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    // useSearchParams needs a Suspense boundary for the static shell.
    return (
        <Suspense fallback={null}>
            <ProjetosContent lang={lang} />
        </Suspense>
    );
}
