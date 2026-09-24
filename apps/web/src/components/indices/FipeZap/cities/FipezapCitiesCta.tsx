import Link from "next/link";
import { ArrowRight, MapPinned } from "lucide-react";
import { getDictionary } from "@/dictionaries";
import { buildFipezapCitiesHref, DEFAULT_STATE, type FipezapTipo } from "@/lib/fipezap-cities-params";
import type { FipezapDorm } from "@/lib/fipezap-import";

/** The slim card that sends readers of the national FipeZap page and the Panorama to the city dashboard. */
export function FipezapCitiesCta({ lang, tipo, dorm }: { lang: string; tipo?: string; dorm?: string }) {
    const t = getDictionary(lang).fipezapCitiesPage;
    const state = { ...DEFAULT_STATE, tipo: (["venda", "locacao", "yield"].includes(tipo ?? "") ? tipo : "venda") as FipezapTipo, dorm: (["total", "1", "2", "3", "4"].includes(dorm ?? "") ? dorm : "total") as FipezapDorm };
    return (
        <Link href={buildFipezapCitiesHref(lang, state)} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><MapPinned className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.h1}</span>
                <span className="block text-xs text-muted-foreground">{t.subtitle}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}
