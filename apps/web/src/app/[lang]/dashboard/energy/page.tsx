import { auth } from "@clerk/nextjs/server";
import { getOwnerPropertiesSummary } from "@/lib/energy-properties-server";
import EnergyHubContent from "./EnergyHubContent";

export const dynamic = "force-dynamic";

export default async function EnergyDashboardHubPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const { userId } = await auth();
    const initialProperties = userId ? await getOwnerPropertiesSummary(userId) : [];

    return <EnergyHubContent lang={lang} initialProperties={initialProperties} />;
}
