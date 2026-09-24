"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SegmentedControl } from "./SegmentedControl";
import { CityPicker } from "./CityPicker";
import { buildFipezapCitiesHref, DEFAULT_STATE, MAX_COMPARE, parseFipezapCitiesParams, type FipezapCitiesState, type FipezapPeriodo, type FipezapTipo } from "@/lib/fipezap-cities-params";
import { FIPEZAP_CITIES } from "@/lib/fipezap-cities";
import type { FipezapDorm } from "@/lib/fipezap-import";
import type { Dictionary } from "@/dictionaries";

type Controls = Dictionary["fipezapCitiesPage"]["controls"];

/**
 * Sticky control bar. Series, bedrooms, city and comparison change what the server renders, so they
 * navigate (router.replace, no scroll) inside a transition that keeps the bar responsive; the period
 * only reshapes the history chart, so it is written to the URL with history.replaceState and read by
 * the chart through useSearchParams — no round trip.
 */
export function FipezapCitiesControls({ state, lang, t, availableDorms }: { state: FipezapCitiesState; lang: string; t: Controls; availableDorms: FipezapDorm[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    // the period lives only in the URL (history.replaceState); useSearchParams reflects it without a round trip
    const sp = useSearchParams();
    const periodo = parseFipezapCitiesParams(Object.fromEntries(sp.entries()), state.cidade).periodo;

    const go = (patch: Partial<FipezapCitiesState>) => {
        const href = buildFipezapCitiesHref(lang, { ...state, periodo }, patch);
        startTransition(() => { router.replace(href, { scroll: false }); });
    };
    const changePeriod = (p: FipezapPeriodo) => {
        const href = buildFipezapCitiesHref(lang, state, { periodo: p, de: null, ate: null });
        window.history.replaceState(null, "", href);   // null state: Next syncs useSearchParams with this call
    };

    const dormOptions = (["total", "1", "2", "3", "4"] as FipezapDorm[]).map(d => ({
        value: d, label: d === "total" ? t.dormTotal : t[`dorm${d}` as "dorm1"], disabled: !availableDorms.includes(d),
    }));
    const pickerLabels = { search: t.searchCity, noResults: t.noResults, capitals: t.capitals, otherCities: t.otherCities, brasil: t.brasil, capital: t.capitals, add: t.addCity, remove: t.remove };
    const periodOptions = (["ytd", "1y", "2y", "3y", "5y", "10y", "all"] as Array<Exclude<FipezapPeriodo, "custom">>).map(p => ({ value: p as FipezapPeriodo, label: t.periods[p] }));

    return (
        <div className="md:sticky md:top-0 z-30 -mx-4 px-4 py-2.5 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="sr-only sm:not-sr-only">{t.tipo}</span>
                    <SegmentedControl<FipezapTipo> ariaLabel={t.tipo} value={state.tipo} onChange={v => go({ tipo: v })} options={[{ value: "venda", label: t.venda }, { value: "locacao", label: t.locacao }, { value: "yield", label: t.yield }]} />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="sr-only sm:not-sr-only">{t.dorm}</span>
                    <SegmentedControl<FipezapDorm> ariaLabel={t.dorm} size="xs" value={state.dorm} onChange={v => go({ dorm: v })} options={dormOptions} />
                </label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="sr-only sm:not-sr-only">{t.cidade}</span>
                    <CityPicker cities={FIPEZAP_CITIES} value={state.cidade} onChange={v => go({ cidade: v as string, comparar: state.comparar.filter(c => c !== v) })} labels={pickerLabels} title={t.cidade} includeNational />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t.compare}</span>
                    <CityPicker cities={FIPEZAP_CITIES} multiple max={MAX_COMPARE} value={state.comparar} exclude={[state.cidade]} onChange={v => go({ comparar: v as string[] })} labels={pickerLabels} title={`${t.compare} · ${t.compareHint.replace("{max}", String(MAX_COMPARE))}`} />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                    <span className="sr-only sm:not-sr-only">{t.period}</span>
                    <SegmentedControl<FipezapPeriodo> ariaLabel={t.period} size="xs" value={periodo === "custom" ? DEFAULT_STATE.periodo : periodo} onChange={changePeriod} options={periodOptions} />
                </label>
                {pending && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t.loading}</span>}
            </div>
        </div>
    );
}
