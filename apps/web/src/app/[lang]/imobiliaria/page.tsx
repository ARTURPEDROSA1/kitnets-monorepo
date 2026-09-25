import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ImobiliariaContent from "./ImobiliariaContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadAgencyDashboard, loadAgencyList } from "@/lib/agency-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Imobiliárias",
        description: "Quem administra os seus contratos: o que cada imobiliária responde, o que a taxa dela custa por mês e como falar com ela.",
    };
}

/** Preloads the list (and the dashboard of `?id=`, or the old `?agency=`) on the server so the first paint has it. */
async function ImobiliariaLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <ImobiliariaContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDashboard] = await Promise.all([
        loadAgencyList(supabase, profileId).catch(err => { console.error("[Imobiliária] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id) ? loadAgencyDashboard(supabase, id, profileId).catch(() => null) : Promise.resolve(null),
    ]);
    return <ImobiliariaContent lang={lang} initial={initial} initialDashboard={initialDashboard} />;
}

export default async function ImobiliariaPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: "en" | "pt" | "es" }>;
    searchParams: Promise<{ id?: string | string[]; agency?: string | string[] }>;
}) {
    const [{ lang }, { id, agency }] = await Promise.all([params, searchParams]);
    const selected = typeof id === "string" ? id : typeof agency === "string" ? agency : null;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <ImobiliariaLoader lang={lang} id={selected} />
        </Suspense>
    );
}
