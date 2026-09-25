import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ContratosContent from "./ContratosContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadLeaseDashboard, loadLeaseList } from "@/lib/lease-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Contratos de Locação",
        description: "Os contratos de locação da carteira: vigência, vencimentos, reajustes, o que cada um rendeu e os arquivos de cada contrato.",
    };
}

/**
 * Loads on the server what the page is going to show — the list, and the dashboard when `?id=`
 * (or the old `?lease=`) is set — so the first paint already has it instead of a "Carregando…"
 * followed by a second, cold, authenticated round trip. Anything that fails here is simply left
 * for the client to fetch and report.
 */
async function ContratosLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <ContratosContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDashboard] = await Promise.all([
        loadLeaseList(supabase, profileId).catch(err => { console.error("[Contratos] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id) ? loadLeaseDashboard(supabase, id, profileId).catch(() => null) : Promise.resolve(null),
    ]);
    return <ContratosContent lang={lang} initial={initial} initialDashboard={initialDashboard} />;
}

export default async function ContratosPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
    searchParams: Promise<{ id?: string | string[]; lease?: string | string[] }>;
}) {
    const [{ lang }, { id, lease }] = await Promise.all([params, searchParams]);
    const selected = typeof id === "string" ? id : typeof lease === "string" ? lease : null;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <ContratosLoader lang={lang} id={selected} />
        </Suspense>
    );
}
