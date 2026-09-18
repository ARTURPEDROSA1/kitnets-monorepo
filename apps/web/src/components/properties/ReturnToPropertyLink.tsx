"use client";

/**
 * "Voltar ao imóvel" — shown on the tenant, agency and contract pages when they were opened from a
 * property's "Contrato de Aluguel" card. The card adds `?property=<properties.id>` to its links; the
 * Imóveis page already opens a property from `?id=<properties.id>`, so that is where this goes back to.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS = ["pt", "en", "es"];

/** The property the page was opened from (`?property=`), or null. Read once, after mount, so server and client render the same first HTML. */
export function useReturnPropertyId(): string | null {
    const [id, setId] = useState<string | null>(null);
    useEffect(() => {
        const value = new URLSearchParams(window.location.search).get("property");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL, which only exists in the browser
        if (value && UUID.test(value)) setId(value);
    }, []);
    return id;
}

export function ReturnToPropertyLink({ propertyId, className }: { propertyId: string | null; className?: string }) {
    if (!propertyId) return null;
    const first = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "pt";
    const lang = LANGS.includes(first) ? first : "pt";
    return (
        <Link
            href={`/${lang}/imoveis?id=${propertyId}`}
            className={cn("inline-flex items-center gap-1.5 h-9 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors", className)}
            title="Voltar à página do imóvel de onde você veio"
        >
            <ArrowLeft className="w-4 h-4" /> <Home className="w-4 h-4" /> Voltar ao imóvel
        </Link>
    );
}
