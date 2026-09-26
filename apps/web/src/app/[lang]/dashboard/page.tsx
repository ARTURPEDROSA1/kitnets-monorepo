import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DashboardContent from "./DashboardContent";
import { requireProfile } from "@/lib/api-auth";
import { loadDashboard } from "@/lib/dashboard-views-server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Dashboard",
        description: "A carteira num só painel: imóveis, contratos, pessoas abrigadas, corretores, energia, água, condomínio, projetos e impostos, com o mapa dos seus imóveis.",
    };
}

/**
 * Preloads the whole bundle on the server. Without a profile row (a brand-new account landing here right
 * after signing up) the client creates it and fetches the bundle itself.
 */
async function DashboardLoader({ lang }: { lang: string }) {
    const mapsApiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
    const mapId = env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null;
    const authed = await requireProfile();
    if ("response" in authed) return <DashboardContent lang={lang} mapsApiKey={mapsApiKey} mapId={mapId} />;
    const { profileId, supabase, userId } = authed.ctx;
    const initial = await loadDashboard(supabase, profileId, userId).catch(err => {
        console.error("[Dashboard] preload failed:", err);
        return null;
    });
    return <DashboardContent lang={lang} initial={initial} mapsApiKey={mapsApiKey} mapId={mapId} />;
}

export default async function DashboardPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <DashboardLoader lang={lang} />
        </Suspense>
    );
}
