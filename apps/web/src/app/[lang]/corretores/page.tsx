import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import CorretoresContent from "./CorretoresContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadAgentDashboard, loadAgentList } from "@/lib/agent-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Corretores",
        description: "Quem intermedeia os seus contratos: os contratos que cada corretor responde, os inquilinos que atende e como falar com ele.",
    };
}

/** Preloads the list (and the dashboard of `?id=`, or the old `?agent=`) on the server so the first paint has it. */
async function CorretoresLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <CorretoresContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDashboard] = await Promise.all([
        loadAgentList(supabase, profileId).catch(err => { console.error("[Corretores] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id) ? loadAgentDashboard(supabase, id, profileId).catch(() => null) : Promise.resolve(null),
    ]);
    return <CorretoresContent lang={lang} initial={initial} initialDashboard={initialDashboard} />;
}

export default async function CorretoresPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
    searchParams: Promise<{ id?: string | string[]; agent?: string | string[] }>;
}) {
    const [{ lang }, { id, agent }] = await Promise.all([params, searchParams]);
    const selected = typeof id === "string" ? id : typeof agent === "string" ? agent : null;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <CorretoresLoader lang={lang} id={selected} />
        </Suspense>
    );
}
