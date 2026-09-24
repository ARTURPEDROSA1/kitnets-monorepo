"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Delta } from "./Delta";
import type { CitySnapshot } from "@/lib/fipezap-cities-server";
import type { Benchmark } from "@/lib/fipezap-insights";
import { fmtBRL, fmtPct, monthShort, rankBy } from "@/lib/fipezap-compare";
import { buildFipezapCitiesHref, type FipezapCitiesState } from "@/lib/fipezap-cities-params";
import type { Dictionary } from "@/dictionaries";
import { cn } from "@/lib/utils";

type Page = Dictionary["fipezapCitiesPage"];
type SortKey = "name" | "varMensal" | "varMensalPrev" | "ytd" | "var12m" | "precoM2" | "yieldAnual" | "yield12m";

/**
 * FIPE's "Últimos resultados" table: IPCA, IGP-M and the national index pinned at the top, then the
 * capitals and the other cities, each sortable by any column. The selected city is highlighted, the
 * compared ones tinted; every city name links to its own page.
 */
export function FipezapResultsTable({ state, lang, national, cities, ipca, igpm, t }: { state: FipezapCitiesState; lang: string; national: CitySnapshot | null; cities: CitySnapshot[]; ipca: Benchmark | null; igpm: Benchmark | null; t: Page }) {
    const isYield = state.tipo === "yield";
    const defaultSort: SortKey = isYield ? "yieldAnual" : "var12m";
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: defaultSort, dir: "desc" });
    const [grouped, setGrouped] = useState(true);

    const columns: Array<{ key: SortKey; label: string; align?: "right" }> = isYield
        ? [{ key: "name", label: t.columns.city }, { key: "yieldAnual", label: t.columns.yieldAnnual, align: "right" }, { key: "yield12m", label: t.columns.yieldM12, align: "right" }, { key: "var12m", label: `${t.controls.locacao} · ${t.columns.m12}`, align: "right" }, { key: "precoM2", label: t.labels.m2Rent, align: "right" }]
        : [{ key: "name", label: t.columns.city }, { key: "varMensal", label: t.columns.month, align: "right" }, { key: "varMensalPrev", label: t.columns.prevMonth, align: "right" }, { key: "ytd", label: t.columns.ytd, align: "right" }, { key: "var12m", label: t.columns.m12, align: "right" }, { key: "precoM2", label: t.columns.priceM2, align: "right" }, { key: "yieldAnual", label: t.columns.yieldAnnual, align: "right" }];

    const sortRows = (rows: CitySnapshot[]) => sort.key === "name"
        ? [...rows].sort((a, b) => a.city.name.localeCompare(b.city.name, "pt") * (sort.dir === "asc" ? 1 : -1))
        : rankBy(rows, r => r[sort.key as Exclude<SortKey, "name">], sort.dir);
    const groups = useMemo(() => grouped
        ? [{ label: t.controls.capitals, rows: sortRows(cities.filter(c => c.city.isCapital)) }, { label: t.controls.otherCities, rows: sortRows(cities.filter(c => !c.city.isCapital)) }]
        : [{ label: null, rows: sortRows(cities) }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cities, sort, grouped]);

    const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
    const cell = (r: CitySnapshot, key: SortKey) => {
        if (key === "precoM2") return <span className="tabular-nums">{fmtBRL(r.precoM2, { lang })}</span>;
        if (key === "yieldAnual" || key === "yield12m") return <span className="tabular-nums">{fmtPct(r[key], { lang, sign: false })}</span>;
        if (key === "name") return null;
        return <Delta value={r[key]} lang={lang} />;
    };
    const exportCsv = () => {
        const head = ["cidade", "uf", "mes", ...columns.slice(1).map(c => c.key)];
        const line = (r: CitySnapshot) => [r.city.name, r.city.uf ?? "", r.month.slice(0, 7), ...columns.slice(1).map(c => r[c.key as Exclude<SortKey, "name">] ?? "")].join(";");
        const rows = [head.join(";"), ...(national ? [line(national)] : []), ...cities.map(line)];
        const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fipezap-${state.tipo}-${state.dorm}-cidades.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const pinned: Array<{ key: string; name: string; sub?: string; values: Partial<Record<SortKey, React.ReactNode>> }> = [];
    if (!isYield) {
        if (ipca) pinned.push({ key: "ipca", name: t.labels.ipca, sub: "IBGE", values: { varMensal: <Delta value={ipca.varMensal} lang={lang} />, ytd: <Delta value={ipca.ytd} lang={lang} />, var12m: <Delta value={ipca.acc12m} lang={lang} /> } });
        if (igpm) pinned.push({ key: "igpm", name: t.labels.igpm, sub: "FGV", values: { varMensal: <Delta value={igpm.varMensal} lang={lang} />, ytd: <Delta value={igpm.ytd} lang={lang} />, var12m: <Delta value={igpm.acc12m} lang={lang} /> } });
    }

    const rowClass = (slug: string) => cn(slug === state.cidade && "bg-primary/5 font-semibold", state.comparar.includes(slug) && "bg-muted/40");
    const href = (slug: string) => buildFipezapCitiesHref(lang, state, { cidade: slug, comparar: state.comparar.filter(c => c !== slug) });

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 md:px-0">
                <button type="button" onClick={() => setGrouped(g => !g)} className="text-xs text-muted-foreground underline-offset-2 hover:underline" aria-pressed={grouped}>
                    {grouped ? `${t.controls.capitals} / ${t.controls.otherCities}` : t.labels.showAll.replace("{n}", String(cities.length))}
                </button>
                <Button variant="outline" size="sm" onClick={exportCsv} className="h-7 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />{t.labels.exportCsv}</Button>
            </div>
            <p className="px-2 text-[11px] text-muted-foreground md:hidden">{t.labels.swipeHint}</p>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto rounded-lg border border-border/60">
                <table className="w-full text-sm border-collapse">
                    <caption className="sr-only">{t.sections.results}</caption>
                    <thead className="sticky top-0 z-20 bg-card text-xs">
                        <tr className="border-b border-border">
                            {columns.map(c => {
                                const active = sort.key === c.key;
                                return (
                                    <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                                        className={cn("px-3 py-2 font-medium text-muted-foreground whitespace-nowrap", c.align === "right" ? "text-right" : "text-left", c.key === "name" && "sticky left-0 z-30 bg-card min-w-[10rem]")}>
                                        <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}>
                                            {c.label}
                                            {active ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {pinned.map(p => (
                            <tr key={p.key} className="bg-muted/30 text-muted-foreground">
                                <th scope="row" className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-left font-medium whitespace-nowrap">{p.name} <span className="text-[10px] font-normal">{p.sub}</span></th>
                                {columns.slice(1).map(c => <td key={c.key} className="px-3 py-1.5 text-right">{p.values[c.key] ?? <span className="text-muted-foreground/40">–</span>}</td>)}
                            </tr>
                        ))}
                        {national && (
                            <tr className={cn("bg-muted/20 font-semibold", rowClass(national.city.slug))}>
                                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left whitespace-nowrap">
                                    <Link href={href(national.city.slug)} className="hover:underline underline-offset-2">{t.labels.national}</Link>
                                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{monthShort(national.month, lang)}</span>
                                </th>
                                {columns.slice(1).map(c => <td key={c.key} className="px-3 py-2 text-right">{cell(national, c.key)}</td>)}
                            </tr>
                        )}
                        {groups.map(g => (
                            <GroupRows key={g.label ?? "all"} label={g.label} colSpan={columns.length}>
                                {g.rows.map(r => (
                                    <tr key={r.city.slug} className={cn("hover:bg-muted/30 transition-colors", rowClass(r.city.slug))}>
                                        <th scope="row" className={cn("sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal whitespace-nowrap", rowClass(r.city.slug) && "bg-card")}>
                                            <Link href={href(r.city.slug)} className="hover:underline underline-offset-2">{r.city.name}</Link>
                                            <span className="ml-1 text-[10px] text-muted-foreground">{r.city.uf}</span>
                                            {r.month !== (national?.month ?? r.month) && <span className="ml-1.5 text-[10px] text-muted-foreground">{monthShort(r.month, lang)}</span>}
                                        </th>
                                        {columns.slice(1).map(c => <td key={c.key} className="px-3 py-1.5 text-right">{cell(r, c.key)}</td>)}
                                    </tr>
                                ))}
                            </GroupRows>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function GroupRows({ label, colSpan, children }: { label: string | null; colSpan: number; children: React.ReactNode }) {
    return (
        <>
            {label && <tr><th colSpan={colSpan} scope="colgroup" className="sticky left-0 bg-card px-3 pt-3 pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</th></tr>}
            {children}
        </>
    );
}
