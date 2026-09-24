"use client";

import { useState } from "react";
import Link from "next/link";
import { Delta } from "./Delta";
import type { YearlyRow } from "@/lib/fipezap-cities-server";
import { monthShort, yearlyHeatClass } from "@/lib/fipezap-compare";
import { buildFipezapCitiesHref, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import { cn } from "@/lib/utils";

export interface YearlyLabels { year: string; city: string; ipca: string; igpm: string; national: string; capitals: string; otherCities: string; showAll: string; showLess: string; ytdNote: string; swipeHint: string; realGain: string; realLoss: string }

/**
 * FIPE's "variação anual" table with colour: each cell is the city's December-over-December change,
 * shaded by how far it sits from that year's IPCA (emerald above, rose below). IPCA, IGP-M and
 * Brazil are pinned; the current year shows the 12-month change to the latest month.
 */
export function FipezapYearlyTable({ years, rows, national, inflation, state, lang, labels }: {
    years: number[]; rows: YearlyRow[]; national: YearlyRow | null;
    inflation: { ipca: Record<number, number | null>; igpm: Record<number, number | null>; ipcaLatest: number | null; igpmLatest: number | null };
    state: FipezapCitiesState; lang: string; labels: YearlyLabels;
}) {
    const [showAll, setShowAll] = useState(false);
    const latestMonth = national?.latest?.month ?? rows.find(r => r.latest)?.latest?.month ?? null;
    const currentYear = latestMonth ? Number(latestMonth.slice(0, 4)) : null;
    const columns: Array<{ key: string; year: number | null; label: string }> = [...years.map(y => ({ key: String(y), year: y, label: String(y) })), ...(currentYear ? [{ key: "latest", year: null, label: `${currentYear}*` }] : [])];
    const visible = showAll ? rows : rows.filter(r => r.city.isCapital || r.city.slug === state.cidade || state.comparar.includes(r.city.slug));
    const valueOf = (r: YearlyRow, c: typeof columns[number]) => (c.year !== null ? r.byYear[c.year] ?? null : r.latest?.var12m ?? null);
    const ipcaOf = (c: typeof columns[number]) => (c.year !== null ? inflation.ipca[c.year] ?? null : inflation.ipcaLatest);
    const href = (slug: string) => buildFipezapCitiesHref(lang, state, { cidade: slug, comparar: state.comparar.filter(x => x !== slug) });

    const pinnedRow = (name: string, sub: string, values: Array<number | null>, key: string) => (
        <tr key={key} className="bg-muted/30 text-muted-foreground">
            <th scope="row" className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-left font-medium whitespace-nowrap">{name} <span className="text-[10px] font-normal">{sub}</span></th>
            {values.map((v, i) => <td key={i} className="px-1 py-1 text-center"><Delta value={v} lang={lang} digits={1} arrow={false} className="text-xs" /></td>)}
        </tr>
    );

    return (
        <div className="space-y-2">
            <p className="px-2 text-[11px] text-muted-foreground md:hidden">{labels.swipeHint}</p>
            <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-xs border-collapse">
                    <caption className="sr-only">{labels.year}</caption>
                    <thead className="bg-card">
                        <tr className="border-b border-border">
                            <th scope="col" className="sticky left-0 z-20 bg-card px-3 py-2 text-left font-medium text-muted-foreground min-w-[10rem]">{labels.city}</th>
                            {columns.map(c => <th key={c.key} scope="col" className="px-1 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[3.6rem]">{c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {pinnedRow(labels.ipca, "IBGE", columns.map(ipcaOf), "ipca")}
                        {pinnedRow(labels.igpm, "FGV", columns.map(c => (c.year !== null ? inflation.igpm[c.year] ?? null : inflation.igpmLatest)), "igpm")}
                        {national && (
                            <tr className="font-semibold">
                                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left whitespace-nowrap"><Link href={href("brasil")} className="hover:underline underline-offset-2">{labels.national}</Link></th>
                                {columns.map(c => { const v = valueOf(national, c); return <td key={c.key} className="p-0.5"><div className={cn("rounded px-1 py-1 text-center tabular-nums", yearlyHeatClass(v, ipcaOf(c)))}><Delta value={v} lang={lang} digits={1} arrow={false} className="!text-inherit" /></div></td>; })}
                            </tr>
                        )}
                        {visible.map(r => (
                            <tr key={r.city.slug} className={cn(r.city.slug === state.cidade && "font-semibold", state.comparar.includes(r.city.slug) && "bg-muted/30")}>
                                <th scope="row" className={cn("sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal whitespace-nowrap", r.city.slug === state.cidade && "font-semibold")}>
                                    <Link href={href(r.city.slug)} className="hover:underline underline-offset-2">{r.city.name}</Link><span className="ml-1 text-[10px] text-muted-foreground">{r.city.uf}</span>
                                </th>
                                {columns.map(c => { const v = valueOf(r, c); return <td key={c.key} className="p-0.5"><div className={cn("rounded px-1 py-1 text-center tabular-nums", yearlyHeatClass(v, ipcaOf(c)))}>{v === null ? <span className="text-muted-foreground/40">–</span> : <Delta value={v} lang={lang} digits={1} arrow={false} className="!text-inherit" />}</div></td>; })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 md:px-0 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-3">
                    {latestMonth && <span>{labels.ytdNote.replace("{mes}", monthShort(latestMonth, lang))}</span>}
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-emerald-200 dark:bg-emerald-900/60" />{labels.realGain}</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-rose-200 dark:bg-rose-900/60" />{labels.realLoss}</span>
                </span>
                {rows.length > visible.length || showAll ? <button type="button" onClick={() => setShowAll(s => !s)} className="underline-offset-2 hover:underline">{showAll ? labels.showLess : labels.showAll.replace("{n}", String(rows.length))}</button> : null}
            </div>
        </div>
    );
}
