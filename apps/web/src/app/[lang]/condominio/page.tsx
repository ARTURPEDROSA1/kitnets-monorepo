import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import CondominioContent from "./CondominioContent";
import { requireProfile } from "@/lib/api-auth";
import { loadCondominiumList, loadCondoProperties } from "@/lib/condominium-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Condomínio",
        description: "Receitas, custos e resultado do condomínio dos seus imóveis com várias unidades.",
    };
}

/** Preloads the condominiums (with their card figures and the property photos) and the multi-unit properties on the server. */
async function CondominioLoader({ lang }: { lang: string }) {
    const authed = await requireProfile();
    if ("response" in authed) return <CondominioContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialProperties] = await Promise.all([
        loadCondominiumList(supabase, profileId).catch(err => { console.error("[Condomínio] list preload failed:", err); return null; }),
        loadCondoProperties(supabase, profileId).catch(() => null),
    ]);
    return <CondominioContent lang={lang} initial={initial} initialProperties={initialProperties} />;
}

export default async function CondominioPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <CondominioLoader lang={lang} />
        </Suspense>
    );
}
