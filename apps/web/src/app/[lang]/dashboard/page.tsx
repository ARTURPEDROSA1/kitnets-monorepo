import { Suspense } from "react";
import DashboardContent from "./DashboardContent";
import { requireProfile } from "@/lib/api-auth";
import { loadDashboard } from "@/lib/dashboard-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Dashboard",
        description: "O aluguel do mês num só quadro: o que vence, o que entrou, o que está a vencer e o que venceu, com as contas, as parcelas e as datas dos contratos.",
    };
}

/**
 * Preloads the whole bundle on the server. Without a profile row (a brand-new account landing here right
 * after signing up) the client creates it and fetches the bundle itself.
 */
async function DashboardLoader({ lang }: { lang: string }) {
    const authed = await requireProfile();
    if ("response" in authed) return <DashboardContent lang={lang} />;
    const { profileId, supabase, userId } = authed.ctx;
    const initial = await loadDashboard(supabase, profileId, userId).catch(err => {
        console.error("[Dashboard] preload failed:", err);
        return null;
    });
    return <DashboardContent lang={lang} initial={initial} />;
}

/** What the page looks like while the bundle loads: the strip, the board and the side column, as shapes. */
function DashboardSkeleton() {
    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6" aria-busy="true" aria-label="Carregando o painel">
            <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
            <div className="h-24 animate-pulse rounded-xl border border-border/60 bg-card" />
            <div className="grid grid-cols-1 gap-4 min-[85rem]:grid-cols-[minmax(0,1fr)_272px]">
                <div className="h-96 animate-pulse rounded-xl border border-border/60 bg-card" />
                <div className="space-y-3">
                    <div className="h-40 animate-pulse rounded-xl border border-border/60 bg-card" />
                    <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-card" />
                </div>
            </div>
        </div>
    );
}

export default async function DashboardPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <DashboardLoader lang={lang} />
        </Suspense>
    );
}
