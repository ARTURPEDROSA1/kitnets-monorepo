"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, Brush, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SegmentedControl } from "./SegmentedControl";
import type { BenchmarkPoint, HistoryPoint } from "@/lib/fipezap-cities-server";
import { filterFrom, fmtPct, monthShort, rebaseSeries } from "@/lib/fipezap-compare";
import { parseFipezapCitiesParams, periodStart, type FipezapCitiesState, type FipezapTipo } from "@/lib/fipezap-cities-params";
import { CDI, GRID, IGPM, INK, IPCA, NATIONAL, TICK, TOOLTIP_STYLE } from "./palette";

export interface HistorySeries { slug: string; name: string; color: string; points: HistoryPoint[] }
type Mode = "mensal" | "12m" | "indice" | "yield";

export interface HistoryLabels { mensal: string; m12: string; indice: string; yield: string; ipca: string; igpm: string; cdi: string; national: string; rebasedNote: string; viewData: string; hideData: string; month: string }

/**
 * FIPE's "evolução do índice" slides, interactive. Modes: the selected place's monthly variation as
 * bars against Brazil's line; 12-month accumulations of every drawn place against IPCA and IGP-M
 * (dashed); the index rebased to 100 at the start of the period; or the annualised rental yield
 * against the CDI. The period comes from the URL (changed client-side by the control bar).
 */
export function FipezapHistoryChart({ series, state, latest, ipca, igpm, cdi, lang, labels }: {
    series: HistorySeries[]; state: FipezapCitiesState; latest: string; ipca: BenchmarkPoint[]; igpm: BenchmarkPoint[]; cdi: BenchmarkPoint[]; lang: string; labels: HistoryLabels;
}) {
    const sp = useSearchParams();
    const live = parseFipezapCitiesParams(Object.fromEntries(sp.entries()), state.cidade);
    const from = periodStart(live, latest) ?? "0000";
    const to = live.periodo === "custom" && live.ate ? `${live.ate}-01` : null;
    const tipo: FipezapTipo = state.tipo;
    const [mode, setMode] = useState<Mode>(tipo === "yield" ? "yield" : "12m");
    const [showData, setShowData] = useState(false);
    const effectiveMode: Mode = tipo === "yield" ? "yield" : mode === "yield" ? "12m" : mode;
    const selected = series.find(s => s.slug === state.cidade) ?? series[0];
    const national = series.find(s => s.slug === "brasil");

    const rows = useMemo(() => {
        const byMonth = new Map<string, Record<string, number | null | string>>();
        const put = (month: string, key: string, value: number | null) => { const r = byMonth.get(month) ?? { month }; r[key] = value; byMonth.set(month, r); };
        for (const s of series) {
            const pts = filterFrom(s.points, from, to);
            if (effectiveMode === "indice") {
                const rebased = rebaseSeries(pts.filter(p => p.varMensal !== null).map(p => ({ month: p.month, value: p.varMensal as number })), pts[0]?.month ?? from, pts.filter(p => p.indice !== null).map(p => ({ month: p.month, value: p.indice as number })));
                for (const p of rebased) put(p.month, s.slug, p.value);
            } else {
                for (const p of pts) put(p.month, s.slug, effectiveMode === "mensal" ? p.varMensal : effectiveMode === "yield" ? p.yieldAnual : p.var12m);
            }
        }
        if (effectiveMode === "12m") { for (const p of filterFrom(ipca, from, to)) put(p.month, "ipca", p.acc12m); for (const p of filterFrom(igpm, from, to)) put(p.month, "igpm", p.acc12m); }
        if (effectiveMode === "yield") for (const p of filterFrom(cdi, from, to)) put(p.month, "cdi", p.acc12m);
        return [...byMonth.values()].filter(r => series.some(s => r[s.slug] !== undefined)).sort((a, b) => String(a.month).localeCompare(String(b.month)));
    }, [series, from, to, effectiveMode, ipca, igpm, cdi]);

    const extremes = useMemo(() => {
        if (!selected) return null;
        const vals = rows.map(r => ({ month: String(r.month), v: r[selected.slug] as number | null })).filter(p => p.v !== null) as Array<{ month: string; v: number }>;
        if (vals.length < 3) return null;
        return { max: vals.reduce((a, b) => (b.v > a.v ? b : a)), min: vals.reduce((a, b) => (b.v < a.v ? b : a)) };
    }, [rows, selected]);

    const isIndex = effectiveMode === "indice";
    const fmt = (v: number) => (isIndex ? v.toLocaleString(lang === "pt" ? "pt-BR" : lang, { maximumFractionDigits: 1 }) : fmtPct(v, { lang, digits: effectiveMode === "mensal" ? 2 : 1, sign: effectiveMode !== "yield" }));
    const tickEvery = Math.max(1, Math.round(rows.length / 8));
    const nameOf = (key: string) => key === "ipca" ? labels.ipca : key === "igpm" ? labels.igpm : key === "cdi" ? labels.cdi : series.find(s => s.slug === key)?.name ?? key;
    const modeOptions: Array<{ value: Mode; label: string }> = tipo === "yield" ? [{ value: "yield", label: labels.yield }] : [{ value: "12m", label: labels.m12 }, { value: "mensal", label: labels.mensal }, { value: "indice", label: labels.indice }];
    const legend = [
        ...series.map(s => ({ key: s.slug, label: s.name, color: s.color, dashed: s.slug === "brasil" && s.slug !== state.cidade })),
        ...(effectiveMode === "12m" ? [{ key: "ipca", label: labels.ipca, color: IPCA, dashed: true }, { key: "igpm", label: labels.igpm, color: IGPM, dashed: true }] : []),
        ...(effectiveMode === "yield" ? [{ key: "cdi", label: labels.cdi, color: CDI, dashed: true }] : []),
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 md:px-0">
                {modeOptions.length > 1 ? <SegmentedControl<Mode> ariaLabel={labels.mensal} size="xs" value={effectiveMode} onChange={setMode} options={modeOptions} /> : <span />}
                <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="legend">
                    {legend.map(l => <li key={l.key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0 w-4 border-t-2" style={{ borderColor: l.color, borderStyle: l.dashed ? "dashed" : "solid" }} />{l.label}</li>)}
                </ul>
            </div>
            {isIndex && rows[0] && <p className="px-2 md:px-0 text-[11px] text-muted-foreground">{labels.rebasedNote.replace("{mes}", monthShort(String(rows[0].month), lang))}</p>}
            <div className="h-[260px] md:h-[360px]" role="img" aria-label={`${nameOf(selected?.slug ?? "")}: ${extremes ? `max ${fmt(extremes.max.v)} (${monthShort(extremes.max.month, lang)}), min ${fmt(extremes.min.v)} (${monthShort(extremes.min.month, lang)})` : ""}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                        <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} interval={tickEvery - 1} tickFormatter={(m: string) => monthShort(m, lang)} minTickGap={24} />
                        <YAxis tick={TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => (isIndex ? String(Math.round(v)) : `${v.toLocaleString(lang === "pt" ? "pt-BR" : lang, { maximumFractionDigits: 1 })}%`)} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(m) => monthShort(String(m), lang)} formatter={(value, name) => [fmt(Number(value)), nameOf(String(name))]} />
                        {!isIndex && <ReferenceLine y={0} stroke={GRID} />}
                        {isIndex && <ReferenceLine y={100} stroke={GRID} strokeDasharray="4 3" />}
                        {effectiveMode === "mensal" && selected && <Bar dataKey={selected.slug} name={selected.slug} fill={INK} isAnimationActive={false} maxBarSize={14} radius={[2, 2, 0, 0]} />}
                        {effectiveMode === "mensal" && national && national.slug !== selected?.slug && <Line type="monotone" dataKey={national.slug} name={national.slug} stroke={NATIONAL} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                        {effectiveMode !== "mensal" && series.map(s => (
                            <Line key={s.slug} type="monotone" dataKey={s.slug} name={s.slug} stroke={s.color} strokeWidth={s.slug === state.cidade ? 2.5 : 1.5} strokeDasharray={s.slug === "brasil" && s.slug !== state.cidade ? "4 3" : undefined} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
                        ))}
                        {effectiveMode === "12m" && <Line type="monotone" dataKey="ipca" name="ipca" stroke={IPCA} strokeDasharray="5 3" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                        {effectiveMode === "12m" && <Line type="monotone" dataKey="igpm" name="igpm" stroke={IGPM} strokeDasharray="2 3" strokeWidth={1.25} dot={false} isAnimationActive={false} connectNulls />}
                        {effectiveMode === "yield" && <Line type="monotone" dataKey="cdi" name="cdi" stroke={CDI} strokeDasharray="5 3" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                        {extremes && effectiveMode !== "mensal" && selected && <>
                            <ReferenceDot x={extremes.max.month} y={extremes.max.v} r={3} fill={INK} stroke="none" label={{ value: fmt(extremes.max.v), position: "top", fontSize: 10, fill: "hsl(var(--foreground))" }} />
                            <ReferenceDot x={extremes.min.month} y={extremes.min.v} r={3} fill={INK} stroke="none" label={{ value: fmt(extremes.min.v), position: "bottom", fontSize: 10, fill: "hsl(var(--foreground))" }} />
                        </>}
                        {live.periodo === "all" && rows.length > 60 && <Brush dataKey="month" height={22} travellerWidth={8} stroke={GRID} fill="hsl(var(--muted) / 0.3)" tickFormatter={(m: string) => monthShort(m, lang)} className="hidden md:block" />}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="px-2 md:px-0">
                <button type="button" onClick={() => setShowData(s => !s)} className="text-xs text-muted-foreground underline-offset-2 hover:underline" aria-expanded={showData}>{showData ? labels.hideData : labels.viewData}</button>
                {showData && (
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-card"><tr>{["month", ...legend.map(l => l.key)].map(k => <th key={k} scope="col" className="px-2 py-1 text-right first:text-left font-medium text-muted-foreground">{k === "month" ? labels.month : nameOf(k)}</th>)}</tr></thead>
                            <tbody className="divide-y divide-border/60 tabular-nums">
                                {[...rows].reverse().map(r => <tr key={String(r.month)}><td className="px-2 py-1">{monthShort(String(r.month), lang)}</td>{legend.map(l => <td key={l.key} className="px-2 py-1 text-right">{typeof r[l.key] === "number" ? fmt(r[l.key] as number) : "–"}</td>)}</tr>)}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
