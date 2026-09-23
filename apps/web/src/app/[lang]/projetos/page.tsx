import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ProjetosContent from "./ProjetosContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadProjectDashboard, loadProjectList } from "@/lib/new-investment-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Projetos",
        description: "O que está sendo comprado ou construído: parcelas pagas, previstas, valorização e o fluxo de caixa até o imóvel render.",
    };
}

/**
 * Loads on the server what the page is going to show — the list, and the dashboard when `?id=`
 * is set — so the first paint already has it. Before this the browser got an empty shell and then
 * made a second, authenticated, often cold round trip per view ("Carregando…" for seconds on the
 * phone). Anything that fails here is simply left for the client to fetch and report.
 */
async function ProjetosLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <ProjetosContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDashboard] = await Promise.all([
        loadProjectList(supabase, profileId).catch(err => { console.error("[Projetos] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id)
            ? loadProjectDashboard(supabase, id, profileId).catch(() => null)
            : Promise.resolve(null),
    ]);
    return <ProjetosContent lang={lang} initial={initial} initialDashboard={initialDashboard} />;
}

/** `/projetos` — the module was "Novos Investimentos" until 2026-09; next.config redirects the old address here. */
export default async function ProjetosPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
    searchParams: Promise<{ id?: string | string[] }>;
}) {
    const [{ lang }, { id }] = await Promise.all([params, searchParams]);
    return (
        <Suspense
            fallback={
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <ProjetosLoader lang={lang} id={typeof id === "string" ? id : null} />
        </Suspense>
    );
}
