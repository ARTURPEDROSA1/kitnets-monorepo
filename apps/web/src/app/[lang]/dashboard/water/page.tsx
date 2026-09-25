import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { Loader2 } from "lucide-react";
import { getOwnerWaterPropertiesSummary } from "@/lib/water-properties-server";
import WaterHubContent from "./WaterHubContent";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    return {
        title: "Água",
        description: "As contas de água dos imóveis cujo hidrômetro principal você paga: consumo, valor, custo por m³ e a conta vigente em PDF.",
    };
}

/**
 * /dashboard/water — one card per rental property whose main water meter is paid
 * by the landlord ("Água" under Medidores Principais do Imóvel), leading to that
 * property's water bills dashboard (/dashboard/billing/<id>).
 */
export default async function WaterDashboardHubPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const { userId } = await auth();
    const properties = userId ? await getOwnerWaterPropertiesSummary(userId) : [];
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <WaterHubContent lang={lang} properties={properties} />
        </Suspense>
    );
}
