import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import FaturasContent from "./FaturasContent";
import { UUID_REGEX, requireProfile } from "@/lib/api-auth";
import { loadInvoiceDetail, loadInvoiceList } from "@/lib/invoice-views-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Faturas",
        description: "O que você cobra direto do inquilino: aluguel, condomínio e encargos que não passam pela imobiliária.",
    };
}

/** Preloads the list (and the invoice of `?id=`) on the server so the first paint has it. */
async function FaturasLoader({ lang, id }: { lang: string; id: string | null }) {
    const authed = await requireProfile();
    if ("response" in authed) return <FaturasContent lang={lang} />;
    const { profileId, supabase } = authed.ctx;
    const [initial, initialDetail] = await Promise.all([
        loadInvoiceList(supabase, profileId).catch(err => { console.error("[Faturas] list preload failed:", err); return null; }),
        id && UUID_REGEX.test(id) ? loadInvoiceDetail(supabase, id, profileId).catch(() => null) : Promise.resolve(null),
    ]);
    return <FaturasContent lang={lang} initial={initial} initialDetail={initialDetail} />;
}

export default async function FaturasPage({
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
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
            }
        >
            <FaturasLoader lang={lang} id={typeof id === "string" ? id : null} />
        </Suspense>
    );
}
