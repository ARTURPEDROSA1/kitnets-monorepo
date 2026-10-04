import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import OwnerPage from "@/components/proprietario/OwnerPage";
import { requireProfile } from "@/lib/api-auth";
import { listProfileDocuments, loadHolding } from "@/lib/company-import-server";
import { loadPilotGateways } from "@/lib/gateway-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Proprietário",
        description: "A ficha da holding: CNPJ, razão social, CNAEs, endereço da sede, administrador e os documentos da empresa.",
    };
}

/** Preloads the holding record, its documents and — for the pilot accounts — the gateways on the server so the first paint has them. */
async function OwnerLoader({ lang }: { lang: string }) {
    const authed = await requireProfile();
    if ("response" in authed) return <OwnerPage lang={lang} initial={null} gateways={null} />;
    const { profileId, supabase } = authed.ctx;
    const [holding, documents, gateways] = await Promise.all([
        loadHolding(supabase, profileId).catch(err => { console.error("[Proprietário] preload failed:", err); return null; }),
        listProfileDocuments(supabase, profileId).catch(() => []),
        loadPilotGateways(supabase, profileId).catch(err => { console.error("[Proprietário] gateways failed:", err); return null; }),
    ]);
    return <OwnerPage lang={lang} initial={holding ? { holding, documents } : null} gateways={gateways} />;
}

export default async function ProprietarioPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <OwnerLoader lang={lang} />
        </Suspense>
    );
}
