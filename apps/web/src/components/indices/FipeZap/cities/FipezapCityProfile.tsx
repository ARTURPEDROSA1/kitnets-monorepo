import Link from "next/link";
import { MapPin } from "lucide-react";
import { Delta } from "./Delta";
import { CitySparklineLazy } from "./ChartsLazy";
import type { CitySnapshot, HistoryPoint } from "@/lib/fipezap-cities-server";
import { fmtBRL, fmtPct, monthShort } from "@/lib/fipezap-compare";
import { buildFipezapCitiesHref, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import { FIPEZAP_CITY_LIST } from "@/lib/fipezap-cities";
import type { Dictionary } from "@/dictionaries";

type Page = Dictionary["fipezapCitiesPage"];

/**
 * FIPE's "resumo por cidade" slide: where the city is, its latest figures against Brazil, a five-year
 * sparkline of the 12-month variation, and shortcuts to compare with neighbours in the same state.
 */
export function FipezapCityProfile({ snapshot, national, history, nationalHistory, state, lang, t, from }: {
    snapshot: CitySnapshot; national: CitySnapshot | null; history: HistoryPoint[]; nationalHistory: HistoryPoint[]; state: FipezapCitiesState; lang: string; t: Page; from: string;
}) {
    const c = snapshot.city;
    const isYield = state.tipo === "yield";
    const rows: Array<{ label: string; city: React.ReactNode; nat: React.ReactNode }> = isYield
        ? [
            { label: t.columns.yieldAnnual, city: fmtPct(snapshot.yieldAnual, { lang, sign: false }), nat: fmtPct(national?.yieldAnual, { lang, sign: false }) },
            { label: t.columns.yieldM12, city: fmtPct(snapshot.yield12m, { lang, sign: false }), nat: fmtPct(national?.yield12m, { lang, sign: false }) },
            { label: t.labels.m2Rent, city: fmtBRL(snapshot.precoM2, { lang }), nat: fmtBRL(national?.precoM2, { lang }) },
        ]
        : [
            { label: t.columns.month, city: <Delta value={snapshot.varMensal} lang={lang} />, nat: <Delta value={national?.varMensal} lang={lang} /> },
            { label: t.columns.ytd, city: <Delta value={snapshot.ytd} lang={lang} />, nat: <Delta value={national?.ytd} lang={lang} /> },
            { label: t.columns.m12, city: <Delta value={snapshot.var12m} lang={lang} />, nat: <Delta value={national?.var12m} lang={lang} /> },
            { label: t.columns.priceM2, city: fmtBRL(snapshot.precoM2, { lang }), nat: fmtBRL(national?.precoM2, { lang }) },
            { label: t.columns.yieldAnnual, city: fmtPct(snapshot.yieldAnual, { lang, sign: false }), nat: fmtPct(national?.yieldAnual, { lang, sign: false }) },
        ];
    const neighbours = FIPEZAP_CITY_LIST.filter(x => x.uf === c.uf && x.slug !== c.slug && !state.comparar.includes(x.slug)).slice(0, 4);

    return (
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr] px-2 md:px-0">
            <div className="space-y-3">
                <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-semibold">{c.name} <span className="text-muted-foreground font-normal">· {c.uf}{c.isCapital ? ` · ${t.labels.capital}` : ""}{c.metro ? ` · ${c.metro}` : ""}</span></p>
                        <p className="text-xs text-muted-foreground">{c.region} · {t.labels.since.replace("{mes}", monthShort(history[0]?.month ?? snapshot.month, lang))} · {monthShort(snapshot.month, lang)}</p>
                    </div>
                </div>
                <table className="w-full text-sm">
                    <thead><tr className="text-[11px] text-muted-foreground"><th scope="col" className="py-1 text-left font-medium"></th><th scope="col" className="py-1 text-right font-medium">{c.name}</th><th scope="col" className="py-1 text-right font-medium">{t.labels.national}</th></tr></thead>
                    <tbody className="divide-y divide-border/60">
                        {rows.map(r => <tr key={r.label}><th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">{r.label}</th><td className="py-1.5 text-right font-semibold tabular-nums">{r.city}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.nat}</td></tr>)}
                    </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground">{t.labels.neighborhoodNote}</p>
            </div>
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{isYield ? t.columns.yieldAnnual : t.columns.m12} · {c.name} {t.labels.vsNational}</p>
                <CitySparklineLazy city={history} national={nationalHistory} isYield={isYield} cityName={c.name} nationalLabel={t.labels.national} lang={lang} from={from} />
                {neighbours.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{t.labels.comparingWith}:</span>
                        {neighbours.map(n => <Link key={n.slug} href={buildFipezapCitiesHref(lang, state, { comparar: [...state.comparar, n.slug].slice(0, 5) })} className="rounded-full border border-dashed border-border px-2 py-0.5 hover:bg-accent hover:text-foreground">+ {n.name}</Link>)}
                    </div>
                )}
            </div>
        </div>
    );
}
