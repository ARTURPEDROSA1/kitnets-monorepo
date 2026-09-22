import { auth } from "@clerk/nextjs/server";
import { getOwnerWaterPropertiesSummary } from "@/lib/water-properties-server";
import WaterHubContent from "./WaterHubContent";

export const dynamic = "force-dynamic";

/**
 * /dashboard/water — one card per rental property whose main water meter is paid
 * by the landlord ("Água" under Medidores Principais do Imóvel), leading to that
 * property's water bills dashboard (/dashboard/billing/<id>).
 */
export default async function WaterDashboardHubPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const { userId } = await auth();
    const properties = userId ? await getOwnerWaterPropertiesSummary(userId) : [];
    return <WaterHubContent lang={lang} properties={properties} />;
}
