import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import InquilinosContent from "./InquilinosContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadTenantDashboard, loadTenantList } from "@/lib/tenant-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Inquilinos",
        description: "Quem mora nos seus imóveis, quem está chegando e quem já saiu: contato, contrato e tempo de casa de cada inquilino.",
    };
}

/**
 * Loads on the server what the page is going to show — the list, and the dashboard when `?id=`
 * (or the old `?tenant=`) is set — so the first paint already has it. Anything that fails here
 * is left for the client to fetch and report.
 */
async function InquilinosLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <InquilinosContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDashboard] = await Promise.all([
        loadTenantList(supabase, profileId).catch(err => { console.error("[Inquilinos] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id) ? loadTenantDashboard(supabase, id, profileId).catch(() => null) : Promise.resolve(null),
    ]);
    return <InquilinosContent lang={lang} initial={initial} initialDashboard={initialDashboard} />;
}

export default async function InquilinosPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
    searchParams: Promise<{ id?: string | string[]; tenant?: string | string[] }>;
}) {
    const [{ lang }, { id, tenant }] = await Promise.all([params, searchParams]);
    const selected = typeof id === "string" ? id : typeof tenant === "string" ? tenant : null;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <InquilinosLoader lang={lang} id={selected} />
        </Suspense>
    );
}
