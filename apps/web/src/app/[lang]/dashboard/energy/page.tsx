import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { Loader2 } from "lucide-react";
import { getOwnerPropertiesSummary } from "@/lib/energy-properties-server";
import EnergyHubContent from "./EnergyHubContent";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    return {
        title: "Energia",
        description: "As contas de luz de cada imóvel e UC avulsa: consumo, valor a pagar, geração solar, créditos e a economia da compensação.",
    };
}

export default async function EnergyDashboardHubPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const { userId } = await auth();
    const initialProperties = userId ? await getOwnerPropertiesSummary(userId) : [];

    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <EnergyHubContent lang={lang} initialProperties={initialProperties} />
        </Suspense>
    );
}
